import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { BrowserLocalRepository, createSupabaseBrowserRepository } from '../db/browserRepository';
import type { DataRepository } from '../db/shared';
import type { AuthSession } from '../types';
import { ApiError } from './apiError';
import { createBarflowEngine, EngineError, todayDate, type EngineUser } from './barflowEngine';

const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const SUPABASE_URL = String(env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = String(env.VITE_SUPABASE_ANON_KEY || '').trim();
const EMPRESA_ID = Number(env.VITE_EMPRESA_ID || 1);

const ADMIN_EMAIL = String(env.VITE_ADMIN_EMAIL || 'asesorconsultorcasf@yahoo.com')
  .trim()
  .toLowerCase();
const ADMIN_PASSWORD = String(env.VITE_ADMIN_PASSWORD || '123456');
const BAR_EMAIL = String(env.VITE_BAR_EMAIL || 'csepulvedafuica@gmail.com')
  .trim()
  .toLowerCase();
const BAR_PASSWORD = String(env.VITE_BAR_PASSWORD || '123456');

const LOCAL_TOKEN_PREFIX = 'local:';

let cachedSupabaseClient: SupabaseClient | null = null;
let cachedRepo: DataRepository | null = null;
let initPromise: Promise<void> | null = null;

export function isSupabaseBrowserConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function getSupabaseClient(): SupabaseClient {
  if (!cachedSupabaseClient) {
    cachedSupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return cachedSupabaseClient;
}

function getRepository(): DataRepository {
  if (!cachedRepo) {
    if (isSupabaseBrowserConfigured()) {
      cachedRepo = createSupabaseBrowserRepository(getSupabaseClient());
    } else {
      cachedRepo = new BrowserLocalRepository();
    }
  }
  return cachedRepo;
}

async function ensureSeeded(repo: DataRepository): Promise<void> {
  if (!initPromise) {
    initPromise = repo.initAndSeed(EMPRESA_ID, ADMIN_EMAIL, BAR_EMAIL).catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
}

function encodeLocalToken(payload: { email: string; rol: 'Gerencia' | 'Bar'; nombre: string; exp: number }): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return `${LOCAL_TOKEN_PREFIX}${btoa(bin)}`;
}

function decodeLocalToken(token: string): { email: string; rol: 'Gerencia' | 'Bar'; nombre: string; exp: number } | null {
  if (!token.startsWith(LOCAL_TOKEN_PREFIX)) return null;
  try {
    const bin = atob(token.slice(LOCAL_TOKEN_PREFIX.length));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as { email?: string; rol?: string; nombre?: string; exp?: number };
    if (
      !parsed ||
      typeof parsed.email !== 'string' ||
      (parsed.rol !== 'Gerencia' && parsed.rol !== 'Bar') ||
      typeof parsed.exp !== 'number' ||
      Date.now() > parsed.exp
    ) {
      return null;
    }
    return {
      email: parsed.email,
      rol: parsed.rol,
      nombre: typeof parsed.nombre === 'string' && parsed.nombre ? parsed.nombre : parsed.rol,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

function validateModulo(rol: 'Gerencia' | 'Bar', moduloRaw: string): void {
  const modulo = moduloRaw.trim().toLowerCase();
  if ((modulo === 'gerencia' || modulo === 'admin') && rol !== 'Gerencia') {
    throw new ApiError(
      'Acceso denegado. Este módulo es exclusivo para Gerencia y administradores autorizados.',
      403
    );
  }
  if ((modulo === 'bar' || modulo === 'barra') && rol !== 'Bar') {
    throw new ApiError('Este correo es de Gerencia. Accede por la entrada del Panel Gerencial.', 403);
  }
}

function resolveSupabaseRole(email: string, metadata?: Record<string, unknown>): 'Gerencia' | 'Bar' {
  const metaRol = String(metadata?.rol || '').trim();
  if (metaRol === 'Gerencia' || metaRol === 'Bar') {
    return metaRol;
  }
  if (email.toLowerCase() === ADMIN_EMAIL) {
    return 'Gerencia';
  }
  return 'Bar';
}

async function resolveBrowserUser(token?: string): Promise<EngineUser> {
  if (!token) {
    throw new ApiError('No autenticado', 401);
  }

  if (isSupabaseBrowserConfigured() && !token.startsWith(LOCAL_TOKEN_PREFIX)) {
    const client = getSupabaseClient();
    const { data, error } = await client.auth.getSession();
    const session = data?.session;
    if (error || !session || !session.user?.email) {
      throw new ApiError('Sesión expirada o inválida', 401);
    }
    const email = session.user.email.trim().toLowerCase();
    const rol = resolveSupabaseRole(email, {
      ...(session.user.user_metadata || {}),
      ...(session.user.app_metadata || {}),
    });
    const nombre =
      String(session.user.user_metadata?.nombre || '') ||
      (rol === 'Gerencia' ? 'Gerencia & Auditoría' : 'Encargado de Barra');
    return {
      email,
      rol,
      empresa: EMPRESA_ID,
      nombre,
    };
  }

  const decoded = decodeLocalToken(token);
  if (!decoded) {
    throw new ApiError('Sesión expirada o inválida', 401);
  }
  return {
    email: decoded.email,
    rol: decoded.rol,
    empresa: EMPRESA_ID,
    nombre: decoded.nombre,
  };
}

async function loginBrowser(body: Record<string, unknown>): Promise<AuthSession> {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const modulo = String(body.modulo || '');

  if (isSupabaseBrowserConfigured()) {
    const client = getSupabaseClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user?.email) {
      throw new ApiError('Correo o contraseña incorrectos', 401);
    }
    const rol = resolveSupabaseRole(data.user.email, {
      ...(data.user.user_metadata || {}),
      ...(data.user.app_metadata || {}),
    });
    try {
      validateModulo(rol, modulo);
    } catch (err) {
      await client.auth.signOut().catch(() => {});
      throw err;
    }
    const nombre =
      String(data.user.user_metadata?.nombre || '') ||
      (rol === 'Gerencia' ? 'Gerencia & Auditoría' : 'Encargado de Barra');
    const repo = getRepository();
    await ensureSeeded(repo);
    return {
      token: data.session.access_token,
      rol,
      email: data.user.email.toLowerCase(),
      nombre,
    };
  }

  let rol: 'Gerencia' | 'Bar' | null = null;
  let nombre = '';
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    rol = 'Gerencia';
    nombre = 'Gerencia & Auditoría';
  } else if (email === BAR_EMAIL && password === BAR_PASSWORD) {
    rol = 'Bar';
    nombre = 'Encargado de Barra';
  }

  if (!rol) {
    throw new ApiError('Correo o contraseña incorrectos', 401);
  }

  validateModulo(rol, modulo);

  const repo = getRepository();
  await ensureSeeded(repo);

  const exp = Date.now() + 12 * 60 * 60 * 1000;
  const token = encodeLocalToken({ email, rol, nombre, exp });
  return { token, rol, email, nombre };
}

export async function signOutBrowserClient(): Promise<void> {
  if (isSupabaseBrowserConfigured()) {
    try {
      await getSupabaseClient().auth.signOut();
    } catch {
      // Ignore signOut errors during local cleanup
    }
  }
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function triggerXlsxDownload(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBlobDownload(blob, filename);
}

export async function browserDownloadExcelReport(token: string): Promise<void> {
  const user = await resolveBrowserUser(token);
  if (user.rol !== 'Gerencia') {
    throw new ApiError('Acceso restringido exclusivamente a Gerencia', 403);
  }
  const repo = getRepository();
  await ensureSeeded(repo);
  const engine = createBarflowEngine(repo, EMPRESA_ID);
  const estado = await engine.buildEstado(true);
  const { buildReporteGerencialBuffer } = await import('./excelHelpers');
  const buf = await buildReporteGerencialBuffer(estado);
  triggerXlsxDownload(buf, `Reporte_Gerencial_Bar_${todayDate()}.xlsx`);
}

export async function browserDownloadImportTemplate(token: string): Promise<void> {
  const user = await resolveBrowserUser(token);
  if (user.rol !== 'Gerencia') {
    throw new ApiError('Acceso restringido exclusivamente a Gerencia', 403);
  }
  const repo = getRepository();
  await ensureSeeded(repo);
  const snap = await repo.getSnapshot(EMPRESA_ID);
  const { buildPlantillaProductosBuffer } = await import('./excelHelpers');
  const buf = await buildPlantillaProductosBuffer(snap.categorias);
  triggerXlsxDownload(buf, 'Plantilla_Carga_Productos_BarFlow.xlsx');
}

export async function browserDownloadProjectZip(token: string): Promise<void> {
  const user = await resolveBrowserUser(token);
  if (user.rol !== 'Gerencia') {
    throw new ApiError('Acceso restringido exclusivamente a Gerencia', 403);
  }
  const repo = getRepository();
  await ensureSeeded(repo);
  const engine = createBarflowEngine(repo, EMPRESA_ID);
  const backupPayload = await engine.getBackupSnapshot(user);
  const { buildProjectBackupZipBlob } = await import('./projectBackup');
  const zipBlob = await buildProjectBackupZipBlob(backupPayload);
  triggerBlobDownload(zipBlob, `BarFlow_Proyecto_Completo_${todayDate()}.zip`);
}

export async function handleBrowserApiRequest<T>(
  route: string,
  options: { method?: string; body?: unknown; token?: string } = {}
): Promise<T> {
  const cleanRoute = route.split('?')[0];
  const method = (options.method || 'GET').toUpperCase();
  const body =
    options.body && typeof options.body === 'object' ? (options.body as Record<string, unknown>) : {};

  try {
    if (method === 'GET' && cleanRoute === '/health') {
      return {
        ok: true,
        mode: isSupabaseBrowserConfigured() ? 'supabase-browser' : 'browser-local',
      } as T;
    }

    if (method === 'POST' && cleanRoute === '/login') {
      return (await loginBrowser(body)) as T;
    }

    const user = await resolveBrowserUser(options.token);
    const repo = getRepository();
    await ensureSeeded(repo);
    const engine = createBarflowEngine(repo, EMPRESA_ID);

    if (method === 'GET' && cleanRoute === '/estado') {
      return (await engine.getEstado(user)) as T;
    }

    // Productos
    if (method === 'POST' && cleanRoute === '/productos') {
      return (await engine.createProducto(user, body)) as T;
    }
    if (method === 'POST' && cleanRoute === '/productos/importar') {
      return (await engine.importProductos(user, body)) as T;
    }
    let m = cleanRoute.match(/^\/productos\/(\d+)\/rendimiento$/);
    if (method === 'PATCH' && m) {
      return (await engine.updateProductoRendimiento(user, Number(m[1]), body)) as T;
    }
    m = cleanRoute.match(/^\/productos\/(\d+)\/stock-inicial$/);
    if (method === 'POST' && m) {
      return (await engine.setStockInicial(user, Number(m[1]), body)) as T;
    }
    m = cleanRoute.match(/^\/productos\/(\d+)$/);
    if (method === 'PATCH' && m) {
      return (await engine.updateProducto(user, Number(m[1]), body)) as T;
    }

    // Movimientos e ingresos/salidas
    if (method === 'POST' && cleanRoute === '/ingresos') {
      return (await engine.registrarIngreso(user, body)) as T;
    }
    if (method === 'POST' && cleanRoute === '/salidas') {
      return (await engine.registrarSalida(user, body)) as T;
    }

    // Cierres
    if (method === 'POST' && cleanRoute === '/cierres') {
      return (await engine.registrarCierre(user, body)) as T;
    }
    if (method === 'POST' && cleanRoute === '/cierres/lote') {
      return (await engine.registrarCierresLote(user, body)) as T;
    }

    // Solicitudes Barra -> Bodega Central
    if (method === 'POST' && cleanRoute === '/solicitudes') {
      return (await engine.crearSolicitud(user, body)) as T;
    }
    if (method === 'POST' && cleanRoute === '/solicitudes/sugerido-minimo') {
      return (await engine.crearSolicitudesSugeridoMinimo(user)) as T;
    }
    m = cleanRoute.match(/^\/solicitudes\/(\d+)\/despachar$/);
    if (method === 'POST' && m) {
      return (await engine.despacharSolicitud(user, Number(m[1]), body)) as T;
    }
    m = cleanRoute.match(/^\/solicitudes\/(\d+)\/rechazar$/);
    if (method === 'POST' && m) {
      return (await engine.rechazarSolicitud(user, Number(m[1]), body)) as T;
    }
    m = cleanRoute.match(/^\/solicitudes\/(\d+)\/recibir$/);
    if (method === 'POST' && m) {
      return (await engine.recibirSolicitud(user, Number(m[1]), body)) as T;
    }

    // Cuadratura
    if (method === 'POST' && cleanRoute === '/cuadratura/ajustar') {
      return (await engine.ajustarCuadratura(user, body)) as T;
    }

    // Proveedores
    if (method === 'POST' && cleanRoute === '/proveedores') {
      return (await engine.crearProveedor(user, body)) as T;
    }
    m = cleanRoute.match(/^\/proveedores\/(\d+)$/);
    if (method === 'PATCH' && m) {
      return (await engine.actualizarProveedor(user, Number(m[1]), body)) as T;
    }
    if (method === 'DELETE' && m) {
      return (await engine.desactivarProveedor(user, Number(m[1]))) as T;
    }

    // Categorías
    if (method === 'POST' && cleanRoute === '/categorias') {
      return (await engine.crearCategoria(user, body)) as T;
    }
    if (method === 'PATCH' && cleanRoute === '/categorias') {
      return (await engine.renombrarCategoria(user, body)) as T;
    }
    m = cleanRoute.match(/^\/categorias\/(.+)$/);
    if (method === 'DELETE' && m) {
      return (await engine.eliminarCategoria(user, decodeURIComponent(m[1]))) as T;
    }

    // Insumos
    if (method === 'PUT' && cleanRoute === '/insumos/control') {
      return (await engine.guardarInsumoControl(user, body)) as T;
    }
    if (method === 'POST' && cleanRoute === '/insumos/solicitudes') {
      return (await engine.crearSolicitudesInsumo(user, body)) as T;
    }
    m = cleanRoute.match(/^\/insumos\/solicitudes\/(\d+)$/);
    if (method === 'PATCH' && m) {
      return (await engine.actualizarSolicitudInsumo(user, Number(m[1]), body)) as T;
    }
    if (method === 'POST' && cleanRoute === '/insumos') {
      return (await engine.crearInsumo(user, body)) as T;
    }
    m = cleanRoute.match(/^\/insumos\/(\d+)\/movimiento$/);
    if (method === 'POST' && m) {
      return (await engine.movimientoInsumo(Number(m[1]), body)) as T;
    }
    m = cleanRoute.match(/^\/insumos\/(\d+)$/);
    if (method === 'PATCH' && m) {
      return (await engine.actualizarInsumo(user, Number(m[1]), body)) as T;
    }
    if (method === 'DELETE' && m) {
      return (await engine.desactivarInsumo(user, Number(m[1]))) as T;
    }

    // Recetas / Cócteles y Turno
    if (method === 'POST' && cleanRoute === '/recetas') {
      return (await engine.crearReceta(user, body)) as T;
    }
    m = cleanRoute.match(/^\/recetas\/(\d+)\/descontar$/);
    if (method === 'POST' && m) {
      return (await engine.descontarReceta(user, Number(m[1]), body)) as T;
    }
    m = cleanRoute.match(/^\/recetas\/(\d+)$/);
    if (method === 'DELETE' && m) {
      return (await engine.desactivarReceta(user, Number(m[1]))) as T;
    }
    if (method === 'POST' && cleanRoute === '/turno/descontar-lote') {
      return (await engine.descontarTurnoLote(user, body)) as T;
    }

    // Vasos / Cristalería
    if (method === 'POST' && cleanRoute === '/vasos') {
      return (await engine.crearVaso(user, body)) as T;
    }
    m = cleanRoute.match(/^\/vasos\/(\d+)\/movimiento$/);
    if (method === 'POST' && m) {
      return (await engine.movimientoVaso(user, Number(m[1]), body)) as T;
    }
    m = cleanRoute.match(/^\/vasos\/(\d+)$/);
    if (method === 'PATCH' && m) {
      return (await engine.actualizarVaso(user, Number(m[1]), body)) as T;
    }

    throw new ApiError(`Ruta no soportada en modo navegador: ${method} ${cleanRoute}`, 404);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof EngineError) {
      throw new ApiError(err.message, err.status);
    }
    throw new ApiError(err instanceof Error ? err.message : 'Error interno en modo navegador', 500);
  }
}
