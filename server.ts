import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import {
  createRepository,
  DEFAULT_INSUMO_CONTROL,
  DEFAULT_SEED_CATEGORIES,
  formatDisplayTS,
  nowISO,
  type DbProducto,
} from './src/db/repository.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 3000);
const EMPRESA_ID = Number(process.env.EMPRESA_ID || 1);
const JWT_SECRET =
  process.env.JWT_SECRET && !process.env.JWT_SECRET.startsWith('CAMBIAR_') && process.env.JWT_SECRET.length >= 32
    ? process.env.JWT_SECRET
    : 'barflow_dev_secret_key_change_in_production_2026_secure';

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'asesorconsultorcasf@yahoo.com').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456';
const BAR_EMAIL = (process.env.BAR_EMAIL || 'csepulvedafuica@gmail.com').trim().toLowerCase();
const BAR_PASSWORD = process.env.BAR_PASSWORD || '123456';

const repo = createRepository();

interface AuthUser {
  email: string;
  rol: 'Gerencia' | 'Bar';
  empresa: number;
  nombre: string;
}

interface AuthedRequest extends Request {
  user?: AuthUser;
}

const VALID_UNITS = ['unidad', 'botella', 'lata', 'ml', 'L', 'barril', 'caja'];
const VALID_CATEGORIES = DEFAULT_SEED_CATEGORIES;
const VALID_ENVASES = ['botella', 'lata', 'bidón', 'barril', 'caja', 'otro'];
const VALID_CONTENIDO_UNITS = ['ml', 'L'];
const VALID_TURNOS = ['AM', 'PM'] as const;

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function npos(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10000) / 10000 : null;
}

function nnonneg(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10000) / 10000 : null;
}

function normalizeCategory(raw: unknown, fallback = 'Otros Licores'): string {
  const txt = String(raw || '').trim();
  if (!txt) return fallback;
  const found = VALID_CATEGORIES.find((c) => c.toLowerCase() === txt.toLowerCase());
  if (found) return found;
  const low = txt.toLowerCase();
  if (low === 'wisky' || low === 'wiksky' || low === 'whiskey') return 'Whisky';
  return txt;
}

/** Convierte una cantidad de ingrediente (ml, L, corto, coctel, unidad) a fracción de unidad de stock del producto */
function convertIngredientToStockUnits(
  prod: Pick<DbProducto, 'contenido_envase' | 'unidad_contenido' | 'porciones_corto' | 'porciones_coctel'>,
  cantidad: number,
  unidadMedida: string
): number {
  const uMed = unidadMedida.trim().toLowerCase();
  if (uMed === 'corto' || uMed === 'porcion_corto') {
    const yieldCorto = Number(prod.porciones_corto || 0);
    if (yieldCorto > 0) {
      return Math.round((cantidad / yieldCorto) * 10000) / 10000;
    }
  }
  if (uMed === 'coctel' || uMed === 'cóctel' || uMed === 'porcion_coctel') {
    const yieldCoctel = Number(prod.porciones_coctel || 0);
    if (yieldCoctel > 0) {
      return Math.round((cantidad / yieldCoctel) * 10000) / 10000;
    }
  }
  if (uMed === 'ml' || uMed === 'l') {
    const qtyMl = uMed === 'l' ? cantidad * 1000 : cantidad;
    const rawCont = Number(prod.contenido_envase || 0);
    if (rawCont > 0) {
      const envaseMl = (prod.unidad_contenido || 'ml').trim().toLowerCase() === 'l' ? rawCont * 1000 : rawCont;
      if (envaseMl > 0) {
        return Math.round((qtyMl / envaseMl) * 10000) / 10000;
      }
    }
  }
  return Math.round(cantidad * 10000) / 10000;
}

/** Deduct quantity from a bodega's lots using FEFO then FIFO */
async function deductLotsFEFO(
  productoId: number,
  bodegaId: number,
  cantidad: number
): Promise<Array<{ loteId: number; qty: number; costo: number; vencimiento: string | null }>> {
  const lotes = await repo.getActiveLotesForProductBodega(EMPRESA_ID, productoId, bodegaId);
  const disponibleTotal = lotes.reduce((sum, l) => sum + Number(l.cantidad_disponible || 0), 0);

  if (disponibleTotal + 0.0005 < cantidad) {
    throw new Error(
      `Stock insuficiente en ${bodegaId === 1 ? 'Bodega Central' : 'Barra Principal'}. Disponible: ${Math.round(disponibleTotal * 1000) / 1000}`
    );
  }

  let pendiente = cantidad;
  const deducted: Array<{ loteId: number; qty: number; costo: number; vencimiento: string | null }> = [];

  for (const lote of lotes) {
    if (pendiente <= 0.00005) break;
    const avail = Number(lote.cantidad_disponible || 0);
    const take = Math.min(avail, pendiente);
    const newAvail = Math.max(0, Math.round((avail - take) * 10000) / 10000);

    await repo.updateLoteDisponible(lote.id, EMPRESA_ID, newAvail);

    deducted.push({
      loteId: lote.id,
      qty: Math.round(take * 10000) / 10000,
      costo: Number(lote.costo_unitario || 0),
      vencimiento: lote.fecha_vencimiento,
    });
    pendiente = Math.round((pendiente - take) * 10000) / 10000;
  }

  return deducted;
}

async function buildEstado(isGerencia: boolean) {
  const snap = await repo.getSnapshot(EMPRESA_ID);

  const prodMap = new Map(snap.productos.map((p) => [p.id, p]));
  const provMap = new Map(snap.proveedores.map((pr) => [pr.id, pr]));
  const vasoMap = new Map(snap.vasos.map((v) => [v.id, v]));

  const stockByProd = new Map<
    number,
    { bar: number; central: number; valorBar: number; valorCentral: number }
  >();

  for (const p of snap.productos) {
    stockByProd.set(p.id, { bar: 0, central: 0, valorBar: 0, valorCentral: 0 });
  }

  for (const l of snap.lotes) {
    const entry = stockByProd.get(l.producto_id);
    if (!entry) continue;
    const q = Number(l.cantidad_disponible || 0);
    const v = q * Number(l.costo_unitario || 0);
    if (l.bodega_id === 1) {
      entry.central = Math.round((entry.central + q) * 1000) / 1000;
      entry.valorCentral += v;
    } else if (l.bodega_id === 3) {
      entry.bar = Math.round((entry.bar + q) * 1000) / 1000;
      entry.valorBar += v;
    }
  }

  const productos = snap.productos.map((p) => {
    const st = stockByProd.get(p.id) || { bar: 0, central: 0, valorBar: 0, valorCentral: 0 };
    const base = {
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      categoria: normalizeCategory(p.categoria),
      unidad: p.unidad,
      stock_inicial_sistema: Number(p.stock_inicial_sistema || 0),
      stock_minimo: Number(p.stock_minimo || 0),
      tipo_envase: p.tipo_envase,
      contenido_envase: p.contenido_envase,
      unidad_contenido: p.unidad_contenido,
      porciones_corto: p.porciones_corto ?? null,
      porciones_coctel: p.porciones_coctel ?? null,
      bar: st.bar,
      central: isGerencia ? st.central : 0,
    };
    if (isGerencia) {
      return {
        ...base,
        costo_referencia: Number(p.costo_referencia || 0),
        valor_bar: Math.round(st.valorBar),
        valor_central: Math.round(st.valorCentral),
      };
    }
    return base;
  });

  const solicitudes = snap.solicitudes
    .filter((s) => prodMap.has(s.producto_id))
    .map((s) => {
      const p = prodMap.get(s.producto_id)!;
      const st = stockByProd.get(s.producto_id);
      return {
        id: s.id,
        fecha: formatDisplayTS(s.fecha),
        producto_id: s.producto_id,
        producto: p.nombre,
        codigo: p.codigo,
        unidad: p.unidad,
        cantidad_solicitada: Number(s.cantidad_solicitada),
        cantidad_despachada: s.cantidad_despachada != null ? Number(s.cantidad_despachada) : null,
        cantidad_entregada: s.cantidad_entregada != null ? Number(s.cantidad_entregada) : null,
        tipo_solicitud: s.tipo_solicitud || 'Reposición',
        estado: s.estado,
        solicitante: s.solicitante,
        observacion: s.observacion,
        fecha_despacho: formatDisplayTS(s.fecha_despacho) || null,
        fecha_recepcion: formatDisplayTS(s.fecha_recepcion) || null,
        ...(isGerencia ? { stock_central: st?.central ?? 0 } : {}),
        stock_bar: st?.bar ?? 0,
      };
    });

  const movimientos = snap.movimientos
    .filter((m) => prodMap.has(m.producto_id) && (isGerencia || m.bodega_id === 3))
    .slice(0, 300)
    .map((m) => {
      const p = prodMap.get(m.producto_id)!;
      return {
        id: m.id,
        fecha: formatDisplayTS(m.fecha),
        tipo: m.tipo,
        producto_id: m.producto_id,
        codigo: p.codigo,
        producto: p.nombre,
        bodega_id: m.bodega_id,
        bodega: m.bodega_id === 1 ? 'Bodega Central' : 'Barra Principal',
        cantidad: Number(m.cantidad),
        ...(isGerencia ? { costo_unitario: Number(m.costo_unitario || 0) } : {}),
        motivo: m.motivo,
        responsable: m.responsable,
      };
    });

  const lotes = snap.lotes
    .filter((l) => prodMap.has(l.producto_id) && (isGerencia || l.bodega_id === 3))
    .map((l) => {
      const p = prodMap.get(l.producto_id)!;
      return {
        id: l.id,
        producto_id: l.producto_id,
        producto_nombre: p.nombre,
        producto_codigo: p.codigo,
        bodega_id: l.bodega_id,
        bodega_nombre: l.bodega_id === 1 ? 'Bodega Central' : 'Barra Principal',
        cantidad_inicial: Number(l.cantidad_inicial),
        cantidad_disponible: Number(l.cantidad_disponible),
        ...(isGerencia ? { costo_unitario: Number(l.costo_unitario || 0) } : {}),
        fecha_vencimiento: l.fecha_vencimiento,
        fecha_ingreso: formatDisplayTS(l.fecha_ingreso),
        referencia: l.referencia,
      };
    });

  const cierres = snap.cierres
    .filter((c) => prodMap.has(c.producto_id))
    .map((c) => {
      const p = prodMap.get(c.producto_id)!;
      const teorico = Number(
        c.stock_teorico_esperado ?? Math.round((Number(c.stock_inicio) + Number(c.ingresos) - Number(c.mermas)) * 1000) / 1000
      );
      const diff = Number(
        c.diferencia_comparativa ?? Math.round((Number(c.stock_cierre) - teorico) * 1000) / 1000
      );
      return {
        id: c.id,
        fecha: c.fecha,
        turno: (c.turno === 'PM' ? 'PM' : 'AM') as 'AM' | 'PM',
        producto_id: c.producto_id,
        codigo: p.codigo,
        producto: p.nombre,
        unidad: p.unidad,
        stock_inicio: Number(c.stock_inicio),
        ingresos: Number(c.ingresos),
        mermas: Number(c.mermas),
        stock_teorico_esperado: teorico,
        consumo_calculado: Number(c.consumo_calculado),
        stock_cierre: Number(c.stock_cierre),
        diferencia_comparativa: diff,
        ...(isGerencia ? { diferencia_valor: Math.round(diff * Number(p.costo_referencia || 0)) } : {}),
        responsable: c.responsable,
        observacion: c.observacion,
      };
    });

  const proveedores = snap.proveedores.map((pr) => ({
    id: pr.id,
    nombre: pr.nombre,
    contacto: pr.contacto,
    telefono_wsp: pr.telefono_wsp,
    email: pr.email,
    categoria: pr.categoria,
    rut: pr.rut,
    notas: pr.notas,
  }));

  const insumos = snap.insumos.map((ins) => {
    const prov = ins.proveedor_id ? provMap.get(ins.proveedor_id) : null;
    return {
      id: ins.id,
      codigo: ins.codigo,
      nombre: ins.nombre,
      categoria: ins.categoria || 'Insumos de Barra',
      criterio: ins.criterio ?? null,
      unidad: ins.unidad,
      stock_actual: Number(ins.stock_actual || 0),
      stock_minimo: Number(ins.stock_minimo || 0),
      ...(isGerencia ? { costo_unitario: Number(ins.costo_unitario || 0) } : {}),
      proveedor_id: ins.proveedor_id,
      proveedor_nombre: prov?.nombre || null,
      proveedor_wsp: prov?.telefono_wsp || null,
      solicitable_por_bar: ins.solicitable_por_bar ?? true,
      max_por_solicitud: ins.max_por_solicitud != null ? Number(ins.max_por_solicitud) : null,
      notas: ins.notas,
    };
  });

  const insumoControl = snap.insumoControl || {
    empresa_id: EMPRESA_ID,
    ...DEFAULT_INSUMO_CONTROL,
  };

  const solicitudesInsumos = (snap.solicitudesInsumos || []).map((si) => {
    const prov = si.proveedor_id ? provMap.get(si.proveedor_id) : null;
    return {
      id: si.id,
      fecha: formatDisplayTS(si.fecha),
      insumo_id: si.insumo_id,
      nombre_item: si.nombre_item,
      categoria: si.categoria || 'Insumos de Barra',
      unidad: si.unidad,
      cantidad_solicitada: Number(si.cantidad_solicitada),
      criterio: si.criterio,
      proveedor_id: si.proveedor_id,
      proveedor_nombre: prov?.nombre || null,
      proveedor_wsp: prov?.telefono_wsp || null,
      estado: si.estado,
      solicitante: si.solicitante,
      observacion: si.observacion,
    };
  });

  const catSet = new Set<string>(DEFAULT_SEED_CATEGORIES);
  for (const c of snap.categorias || []) {
    if (c.nombre) catSet.add(c.nombre);
  }
  for (const p of productos) {
    if (p.categoria) catSet.add(p.categoria);
  }
  for (const ins of insumos) {
    if (ins.categoria) catSet.add(ins.categoria);
  }
  const categorias = Array.from(catSet).sort((a, b) => a.localeCompare(b, 'es'));

  const recetas = snap.recetas.map((rec) => {
    const rawIngs = snap.recetaIngredientes.filter((ri) => ri.receta_id === rec.id && prodMap.has(ri.producto_id));
    let costoTotal = 0;
    const ingredientes = rawIngs.map((ri) => {
      const p = prodMap.get(ri.producto_id)!;
      const st = stockByProd.get(p.id);
      const frac = convertIngredientToStockUnits(p, Number(ri.cantidad_ml_o_unidad), ri.unidad_medida);
      const costoIng = Math.round(frac * Number(p.costo_referencia || 0));
      costoTotal += costoIng;
      return {
        id: ri.id,
        receta_id: rec.id,
        producto_id: p.id,
        producto_nombre: p.nombre,
        producto_codigo: p.codigo,
        producto_unidad: p.unidad,
        contenido_envase: p.contenido_envase,
        unidad_contenido: p.unidad_contenido,
        porciones_corto: p.porciones_corto ?? null,
        porciones_coctel: p.porciones_coctel ?? null,
        cantidad_ml_o_unidad: Number(ri.cantidad_ml_o_unidad),
        unidad_medida: ri.unidad_medida,
        ...(isGerencia ? { costo_ingrediente: costoIng } : {}),
        stock_bar_actual: st?.bar ?? 0,
      };
    });

    const precioVenta = Number(rec.precio_venta || 0);
    const margenBruto = Math.round(precioVenta - costoTotal);
    const margenPct = precioVenta > 0 ? Math.round((margenBruto / precioVenta) * 1000) / 10 : 0;

    return {
      id: rec.id,
      codigo: rec.codigo,
      nombre: rec.nombre,
      categoria: rec.categoria,
      ...(isGerencia
        ? {
            precio_venta: precioVenta,
            costo_total: Math.round(costoTotal),
            margen_bruto: margenBruto,
            margen_pct: margenPct,
          }
        : {}),
      notas: rec.notas,
      ingredientes,
    };
  });

  const vasos = snap.vasos.map((v) => ({
    id: v.id,
    codigo: v.codigo,
    nombre: v.nombre,
    capacidad_ml: Number(v.capacidad_ml || 0),
    stock_inicial: Number(v.stock_inicial || 0),
    stock_disponible: Number(v.stock_disponible || 0),
    stock_minimo: Number(v.stock_minimo || 0),
    roturas_acumuladas: Number(v.roturas_acumuladas || 0),
    ...(isGerencia ? { costo_reposicion: Number(v.costo_reposicion || 0) } : {}),
  }));

  const vasosMovimientos = snap.vasosMovimientos
    .filter((vm) => vasoMap.has(vm.vaso_id))
    .slice(0, 150)
    .map((vm) => {
      const v = vasoMap.get(vm.vaso_id)!;
      return {
        id: vm.id,
        vaso_id: vm.vaso_id,
        vaso_nombre: v.nombre,
        fecha: formatDisplayTS(vm.fecha),
        turno: (vm.turno === 'PM' ? 'PM' : 'AM') as 'AM' | 'PM',
        tipo: vm.tipo,
        cantidad: Number(vm.cantidad),
        motivo: vm.motivo,
        responsable: vm.responsable,
      };
    });

  const alertasMinimo = productos.filter((p) => p.bar < p.stock_minimo).length;
  const sinStock = productos.filter((p) => p.bar <= 0).length;
  const solicitudesPendientes = solicitudes.filter((s) => s.estado === 'Pendiente').length;
  const porRecibirBar = solicitudes.filter((s) => s.estado === 'Despachada').length;
  const insumosBajoMinimo = insumos.filter((i) => i.stock_actual < i.stock_minimo).length;
  const vasosDisponibles = vasos.reduce((s, v) => s + v.stock_disponible, 0);
  const vasosRoturas = vasos.reduce((s, v) => s + v.roturas_acumuladas, 0);

  const kpis: Record<string, number> = {
    totalProductos: productos.length,
    alertasMinimo,
    sinStock,
    solicitudesPendientes,
    porRecibirBar,
    insumosBajoMinimo,
    vasosDisponibles,
    vasosRoturas,
  };

  if (isGerencia) {
    let valBar = 0;
    let valCentral = 0;
    for (const st of stockByProd.values()) {
      valBar += st.valorBar;
      valCentral += st.valorCentral;
    }
    kpis.valorBar = Math.round(valBar);
    kpis.valorCentral = Math.round(valCentral);
  }

  const consumosTurno = (snap.consumosTurno || []).map((ct) => ({
    id: ct.id,
    fecha: ct.fecha,
    turno: (ct.turno === 'PM' ? 'PM' : 'AM') as 'AM' | 'PM',
    tipo: ct.tipo,
    receta_id: ct.receta_id,
    producto_id: ct.producto_id,
    nombre: ct.nombre,
    cantidad_porciones: Number(ct.cantidad_porciones),
    detalle_descuento: ct.detalle_descuento,
    ...(isGerencia ? { costo_total: Number(ct.costo_total || 0) } : {}),
    responsable: ct.responsable,
    observacion: ct.observacion,
  }));

  return {
    categorias,
    productos,
    solicitudes,
    movimientos,
    cierres,
    lotes,
    proveedores,
    insumos,
    insumoControl: {
      permitir_crear_items_bar: Boolean(insumoControl.permitir_crear_items_bar),
      restringir_categorias_bar: Boolean(insumoControl.restringir_categorias_bar),
      categorias_permitidas_bar: Array.isArray(insumoControl.categorias_permitidas_bar)
        ? insumoControl.categorias_permitidas_bar
        : [],
      solo_bajo_minimo: Boolean(insumoControl.solo_bajo_minimo),
      bloquear_duplicados_pendientes: Boolean(insumoControl.bloquear_duplicados_pendientes),
      max_items_por_solicitud:
        insumoControl.max_items_por_solicitud != null ? Number(insumoControl.max_items_por_solicitud) : null,
      permitir_criterio_personalizado_bar: Boolean(insumoControl.permitir_criterio_personalizado_bar),
      criterios_permitidos_bar: Array.isArray(insumoControl.criterios_permitidos_bar)
        ? insumoControl.criterios_permitidos_bar
        : [],
    },
    solicitudesInsumos,
    recetas,
    consumosTurno,
    vasos,
    vasosMovimientos,
    kpis,
  };
}

const wrap =
  (fn: (req: AuthedRequest, res: Response) => Promise<void | Response>) =>
  (req: AuthedRequest, res: Response) =>
    Promise.resolve(fn(req, res)).catch((err: unknown) => {
      console.error('[API Error]', err);
      const message = err instanceof Error ? err.message : 'No se pudo completar la operación';
      res.status(500).json({ error: message });
    });

function auth(req: AuthedRequest, res: Response, next: NextFunction): void {
  try {
    const raw = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!raw) {
      res.status(401).json({ error: 'Sesión requerida' });
      return;
    }
    const decoded = jwt.verify(raw, JWT_SECRET, { algorithms: ['HS256'] }) as AuthUser;
    if (decoded.empresa !== EMPRESA_ID) {
      res.status(401).json({ error: 'Empresa no autorizada' });
      return;
    }
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Sesión expirada, inicia sesión nuevamente' });
  }
}

function adminOnly(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (req.user?.rol !== 'Gerencia') {
    res.status(403).json({ error: 'Acceso restringido exclusivamente a Gerencia' });
    return;
  }
  next();
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: repo.mode });
});

app.post(
  '/api/login',
  wrap(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const moduloRaw = String(req.body?.modulo || '').trim().toLowerCase();

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
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }

    if ((moduloRaw === 'gerencia' || moduloRaw === 'admin') && rol !== 'Gerencia') {
      return res.status(403).json({
        error: 'Acceso denegado. Este módulo es exclusivo para Gerencia y administradores autorizados.',
      });
    }

    if ((moduloRaw === 'bar' || moduloRaw === 'barra') && rol !== 'Bar') {
      return res.status(403).json({
        error: 'Este correo es de Gerencia. Accede por la entrada del Panel Gerencial.',
      });
    }

    const token = jwt.sign({ email, rol, empresa: EMPRESA_ID, nombre }, JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '12h',
    });

    res.json({ token, rol, email, nombre });
  })
);

app.get(
  '/api/estado',
  auth,
  wrap(async (req, res) => {
    const isGerencia = req.user!.rol === 'Gerencia';
    const data = await buildEstado(isGerencia);
    res.json({
      rol: req.user!.rol,
      email: req.user!.email,
      ...data,
    });
  })
);

// ============================================================================
// PRODUCTOS + STOCK INICIAL MANUAL + CARGA MASIVA COMERCIAL
// ============================================================================

app.post(
  '/api/productos',
  auth,
  adminOnly,
  wrap(async (req, res) => {
    const b = req.body || {};
    const codigo = String(b.codigo || '').trim().toUpperCase();
    const nombre = String(b.nombre || '').trim().toUpperCase();
    const categoria = normalizeCategory(b.categoria);
    const unidad = String(b.unidad || 'botella').trim();
    const stockMinimo = nnonneg(b.stock_minimo ?? 0);
    const costoRef = nnonneg(b.costo_referencia ?? 0);
    const tipoEnvase = b.tipo_envase ? String(b.tipo_envase).trim() : null;
    const contenidoEnvase = b.contenido_envase !== '' && b.contenido_envase != null ? npos(b.contenido_envase) : null;
    const unidadContenido = b.unidad_contenido ? String(b.unidad_contenido).trim() : null;
    const porcionesCorto = b.porciones_corto !== '' && b.porciones_corto != null ? npos(b.porciones_corto) : null;
    const porcionesCoctel = b.porciones_coctel !== '' && b.porciones_coctel != null ? npos(b.porciones_coctel) : null;
    const stockCentralIni = nnonneg(b.stock_inicial_central ?? 0) ?? 0;
    const stockBarIni = nnonneg(b.stock_inicial_barra ?? 0) ?? 0;
    const stockInicialSistema =
      b.stock_inicial_sistema !== undefined && b.stock_inicial_sistema !== ''
        ? (nnonneg(b.stock_inicial_sistema) ?? stockCentralIni + stockBarIni)
        : Math.round((stockCentralIni + stockBarIni) * 1000) / 1000;

    if (!codigo || !nombre || !VALID_UNITS.includes(unidad) || stockMinimo === null || costoRef === null) {
      return res.status(400).json({ error: 'Verifica código, nombre, unidad, mínimo y costo' });
    }
    if (!categoria) {
      return res.status(400).json({ error: 'Categoría inválida' });
    }
    if (tipoEnvase && !VALID_ENVASES.includes(tipoEnvase)) {
      return res.status(400).json({ error: 'Tipo de envase inválido' });
    }
    if (tipoEnvase && (!contenidoEnvase || !unidadContenido || !VALID_CONTENIDO_UNITS.includes(unidadContenido))) {
      return res.status(400).json({ error: 'Especifica contenido numérico y unidad (ml o L) del envase' });
    }

    const dup = await repo.findProductoByCodigo(EMPRESA_ID, codigo);
    if (dup) {
      return res.status(409).json({ error: `Ya existe un producto activo con el código ${codigo}` });
    }

    await repo.ensureCategoria(EMPRESA_ID, categoria);

    const prod = await repo.insertProducto({
      empresa_id: EMPRESA_ID,
      codigo,
      nombre,
      categoria,
      area: 'Bar',
      unidad,
      stock_inicial_sistema: stockInicialSistema,
      stock_minimo: stockMinimo,
      costo_referencia: costoRef,
      tipo_envase: tipoEnvase,
      contenido_envase: contenidoEnvase,
      unidad_contenido: tipoEnvase ? unidadContenido : null,
      porciones_corto: porcionesCorto,
      porciones_coctel: porcionesCoctel,
      activo: true,
    });

    await repo.insertMovimiento({
      empresa_id: EMPRESA_ID,
      fecha: nowISO(),
      tipo: 'Nuevo Producto',
      producto_id: prod.id,
      bodega_id: 3,
      lote_id: null,
      cantidad: 0,
      costo_unitario: costoRef,
      motivo: `Creación en maestro | Stock inicial sistema: ${stockInicialSistema}`,
      responsable: req.user!.email,
    });

    if (stockCentralIni > 0) {
      const lC = await repo.insertLote({
        empresa_id: EMPRESA_ID,
        producto_id: prod.id,
        bodega_id: 1,
        cantidad_inicial: stockCentralIni,
        cantidad_disponible: stockCentralIni,
        costo_unitario: costoRef,
        fecha_vencimiento: null,
        fecha_ingreso: nowISO(),
        referencia: 'Stock inicial manual',
      });
      await repo.insertMovimiento({
        empresa_id: EMPRESA_ID,
        fecha: nowISO(),
        tipo: 'Stock Inicial',
        producto_id: prod.id,
        bodega_id: 1,
        lote_id: lC.id,
        cantidad: stockCentralIni,
        costo_unitario: costoRef,
        motivo: 'Stock inicial manual Bodega Central',
        responsable: req.user!.email,
      });
    }

    if (stockBarIni > 0) {
      const lB = await repo.insertLote({
        empresa_id: EMPRESA_ID,
        producto_id: prod.id,
        bodega_id: 3,
        cantidad_inicial: stockBarIni,
        cantidad_disponible: stockBarIni,
        costo_unitario: costoRef,
        fecha_vencimiento: null,
        fecha_ingreso: nowISO(),
        referencia: 'Stock inicial manual',
      });
      await repo.insertMovimiento({
        empresa_id: EMPRESA_ID,
        fecha: nowISO(),
        tipo: 'Stock Inicial',
        producto_id: prod.id,
        bodega_id: 3,
        lote_id: lB.id,
        cantidad: stockBarIni,
        costo_unitario: costoRef,
        motivo: 'Stock inicial manual Barra Principal',
        responsable: req.user!.email,
      });
    }

    res.json({ ok: true, id: prod.id });
  })
);

app.patch(
  '/api/productos/:id',
  auth,
  adminOnly,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID inválido' });
    const b = req.body || {};
    const nombre = String(b.nombre || '').trim().toUpperCase();
    const categoria = normalizeCategory(b.categoria);
    const unidad = String(b.unidad || 'botella').trim();
    const stockMinimo = nnonneg(b.stock_minimo ?? 0);
    const costoRef = nnonneg(b.costo_referencia ?? 0);
    const stockInicialSistema =
      b.stock_inicial_sistema !== undefined ? nnonneg(b.stock_inicial_sistema) : undefined;
    const tipoEnvase = b.tipo_envase ? String(b.tipo_envase).trim() : null;
    const contenidoEnvase = b.contenido_envase !== '' && b.contenido_envase != null ? npos(b.contenido_envase) : null;
    const unidadContenido = b.unidad_contenido ? String(b.unidad_contenido).trim() : null;
    const porcionesCorto =
      b.porciones_corto !== undefined
        ? (b.porciones_corto === '' || b.porciones_corto === null ? null : npos(b.porciones_corto))
        : undefined;
    const porcionesCoctel =
      b.porciones_coctel !== undefined
        ? (b.porciones_coctel === '' || b.porciones_coctel === null ? null : npos(b.porciones_coctel))
        : undefined;

    if (!nombre || !VALID_UNITS.includes(unidad) || stockMinimo === null || costoRef === null) {
      return res.status(400).json({ error: 'Datos de producto inválidos' });
    }

    await repo.ensureCategoria(EMPRESA_ID, categoria);

    const patch: Partial<Omit<DbProducto, 'id' | 'empresa_id' | 'codigo'>> = {
      nombre,
      categoria,
      unidad,
      stock_minimo: stockMinimo,
      costo_referencia: costoRef,
      tipo_envase: tipoEnvase,
      contenido_envase: tipoEnvase ? contenidoEnvase : null,
      unidad_contenido: tipoEnvase ? unidadContenido : null,
    };
    if (stockInicialSistema !== undefined && stockInicialSistema !== null) {
      patch.stock_inicial_sistema = stockInicialSistema;
    }
    if (porcionesCorto !== undefined) {
      patch.porciones_corto = porcionesCorto;
    }
    if (porcionesCoctel !== undefined) {
      patch.porciones_coctel = porcionesCoctel;
    }

    const updated = await repo.updateProducto(id, EMPRESA_ID, patch);
    if (!updated) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ ok: true });
  })
);

app.patch(
  '/api/productos/:id/rendimiento',
  auth,
  adminOnly,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID inválido' });
    const b = req.body || {};

    const rawCorto = b.porciones_corto;
    const rawCoctel = b.porciones_coctel;
    const porcionesCorto = rawCorto === '' || rawCorto === null || rawCorto === undefined ? null : npos(rawCorto);
    const porcionesCoctel = rawCoctel === '' || rawCoctel === null || rawCoctel === undefined ? null : npos(rawCoctel);

    if (rawCorto !== '' && rawCorto !== null && rawCorto !== undefined && porcionesCorto === null) {
      return res.status(400).json({ error: 'Las porciones de corto por botella deben ser mayores a 0' });
    }
    if (rawCoctel !== '' && rawCoctel !== null && rawCoctel !== undefined && porcionesCoctel === null) {
      return res.status(400).json({ error: 'El rendimiento para cócteles debe ser mayor a 0' });
    }

    const updated = await repo.updateProducto(id, EMPRESA_ID, {
      porciones_corto: porcionesCorto,
      porciones_coctel: porcionesCoctel,
    });
    if (!updated) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ ok: true, porciones_corto: porcionesCorto, porciones_coctel: porcionesCoctel });
  })
);

app.post(
  '/api/productos/:id/stock-inicial',
  auth,
  adminOnly,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const bodegaId = Number(req.body?.bodega_id || 3);
    const cantidad = nnonneg(req.body?.cantidad);
    const stockInicialSistema =
      req.body?.stock_inicial_sistema !== undefined ? nnonneg(req.body.stock_inicial_sistema) : null;
    const nota = String(req.body?.motivo || 'Carga manual de stock inicial del sistema').slice(0, 180);

    if (!Number.isInteger(id) || id < 1 || ![1, 3].includes(bodegaId) || cantidad === null) {
      return res.status(400).json({ error: 'Datos de stock inicial inválidos' });
    }

    const prod = await repo.findProductoById(EMPRESA_ID, id);
    if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });

    const lotes = await repo.getActiveLotesForProductBodega(EMPRESA_ID, id, bodegaId);
    const actual = Math.round(lotes.reduce((s, l) => s + Number(l.cantidad_disponible || 0), 0) * 1000) / 1000;
    const diff = Math.round((cantidad - actual) * 1000) / 1000;
    const costoRef = Number(prod.costo_referencia || 0);

    if (diff > 0.0001) {
      const lote = await repo.insertLote({
        empresa_id: EMPRESA_ID,
        producto_id: id,
        bodega_id: bodegaId,
        cantidad_inicial: diff,
        cantidad_disponible: diff,
        costo_unitario: costoRef,
        fecha_vencimiento: null,
        fecha_ingreso: nowISO(),
        referencia: 'Stock inicial manual sistema',
      });
      await repo.insertMovimiento({
        empresa_id: EMPRESA_ID,
        fecha: nowISO(),
        tipo: 'Stock Inicial',
        producto_id: id,
        bodega_id: bodegaId,
        lote_id: lote.id,
        cantidad: diff,
        costo_unitario: costoRef,
        motivo: `${nota} (Stock fijado en ${cantidad})`,
        responsable: req.user!.email,
      });
    } else if (diff < -0.0001) {
      const deducted = await deductLotsFEFO(id, bodegaId, Math.abs(diff));
      for (const d of deducted) {
        await repo.insertMovimiento({
          empresa_id: EMPRESA_ID,
          fecha: nowISO(),
          tipo: 'Stock Inicial',
          producto_id: id,
          bodega_id: bodegaId,
          lote_id: d.loteId,
          cantidad: d.qty,
          costo_unitario: d.costo,
          motivo: `${nota} (Ajustado de ${actual} a ${cantidad})`,
          responsable: req.user!.email,
        });
      }
    }

    const snap = await repo.getSnapshot(EMPRESA_ID);
    const totalActual = snap.lotes
      .filter((l) => l.producto_id === id && (l.bodega_id === 1 || l.bodega_id === 3))
      .reduce((s, l) => s + Number(l.cantidad_disponible || 0), 0);

    await repo.updateProducto(id, EMPRESA_ID, {
      stock_inicial_sistema: stockInicialSistema ?? Math.round(totalActual * 1000) / 1000,
    });

    res.json({ ok: true });
  })
);

app.get(
  '/api/productos/plantilla.xlsx',
  auth,
  adminOnly,
  wrap(async (_req, res) => {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'BarFlow Plantilla Comercial';
    const ws = wb.addWorksheet('Productos_Barra', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { key: 'codigo', header: 'Codigo', width: 14 },
      { key: 'nombre', header: 'Nombre', width: 38 },
      { key: 'categoria', header: 'Categoria', width: 18 },
      { key: 'unidad', header: 'Unidad', width: 12 },
      { key: 'stock_central', header: 'Stock_Inicial_Central', width: 22 },
      { key: 'stock_barra', header: 'Stock_Inicial_Barra', width: 20 },
      { key: 'stock_minimo', header: 'Stock_Minimo_Barra', width: 20 },
      { key: 'costo', header: 'Costo_Unitario', width: 16 },
      { key: 'tipo_envase', header: 'Tipo_Envase', width: 14 },
      { key: 'contenido', header: 'Contenido_Envase', width: 18 },
      { key: 'unidad_cont', header: 'Unidad_Contenido', width: 18 },
    ];

    const ejemplos = [
      { codigo: 'WHI-001', nombre: 'WHISKY CHIVAS REGAL 12 ANOS 750 ML', categoria: 'Whisky', unidad: 'botella', stock_central: 12, stock_barra: 3, stock_minimo: 4, costo: 24500, tipo_envase: 'botella', contenido: 750, unidad_cont: 'ml' },
      { codigo: 'PIS-001', nombre: 'PISCO MISTRAL NOBEL 40° 750 ML', categoria: 'Piscos', unidad: 'botella', stock_central: 18, stock_barra: 4, stock_minimo: 5, costo: 11200, tipo_envase: 'botella', contenido: 750, unidad_cont: 'ml' },
      { codigo: 'CER-001', nombre: 'CERVEZA HEINEKEN BOTELLA 330 ML', categoria: 'Cervezas', unidad: 'unidad', stock_central: 120, stock_barra: 36, stock_minimo: 48, costo: 1150, tipo_envase: 'botella', contenido: 330, unidad_cont: 'ml' },
      { codigo: 'OTR-001', nombre: 'RAMAZZOTTI APERITIVO ROSATO 700 ML', categoria: 'Otros Licores', unidad: 'botella', stock_central: 10, stock_barra: 4, stock_minimo: 4, costo: 12400, tipo_envase: 'botella', contenido: 700, unidad_cont: 'ml' },
      { codigo: 'GAS-001', nombre: 'SPRITE LATA 350 ML', categoria: 'Gaseosas', unidad: 'lata', stock_central: 96, stock_barra: 36, stock_minimo: 36, costo: 650, tipo_envase: 'lata', contenido: 350, unidad_cont: 'ml' },
      { codigo: 'JUG-001', nombre: 'JUGO DE MARACUYA PULPA 1 LT', categoria: 'Jugos', unidad: 'botella', stock_central: 12, stock_barra: 4, stock_minimo: 5, costo: 3200, tipo_envase: 'botella', contenido: 1000, unidad_cont: 'ml' },
    ];
    for (const row of ejemplos) ws.addRow(row);

    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };

    const snapCats = await repo.getSnapshot(EMPRESA_ID);
    const allCats = Array.from(new Set([...VALID_CATEGORIES, ...snapCats.categorias.map((c) => c.nombre)]));
    const guide = wb.addWorksheet('Categorias_Validas');
    guide.columns = [
      { key: 'cat', header: 'Categorias Sugeridas (o personalizada)', width: 34 },
      { key: 'uni', header: 'Unidades Permitidas', width: 22 },
    ];
    for (let i = 0; i < Math.max(allCats.length, VALID_UNITS.length); i++) {
      guide.addRow({
        cat: allCats[i] || '',
        uni: VALID_UNITS[i] || '',
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Plantilla_Carga_Productos_BarFlow.xlsx"');
    const buf = await wb.xlsx.writeBuffer();
    res.end(Buffer.from(buf));
  })
);

function parseCsvRows(csvText: string): Array<Record<string, string>> {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const sep = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === sep && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };
  const headers = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitLine(lines[i]);
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rec[h] = vals[idx] ?? '';
    });
    rows.push(rec);
  }
  return rows;
}

app.post(
  '/api/productos/importar',
  auth,
  adminOnly,
  wrap(async (req, res) => {
    const fileType = String(req.body?.file_type || 'xlsx').toLowerCase();
    const content = String(req.body?.content || '');
    const reemplazar = Boolean(req.body?.reemplazar_existentes);

    if (!content) {
      return res.status(400).json({ error: 'Archivo vacío o no seleccionado' });
    }

    let rawItems: Array<Record<string, unknown>> = [];

    if (fileType === 'csv') {
      rawItems = parseCsvRows(content);
    } else if (fileType === 'json' && Array.isArray(req.body?.rows)) {
      rawItems = req.body.rows;
    } else {
      const base64 = content.includes(',') ? content.split(',').pop() || '' : content;
      const buf = Buffer.from(base64, 'base64');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
      const ws = wb.worksheets[0];
      if (!ws) return res.status(400).json({ error: 'El archivo Excel no tiene hojas válidas' });
      const headers: string[] = [];
      ws.getRow(1).eachCell((cell, colNumber) => {
        headers[colNumber] = String(cell.value || '').trim().toLowerCase().replace(/\s+/g, '_');
      });
      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const rec: Record<string, unknown> = {};
        let hasData = false;
        row.eachCell((cell, colNumber) => {
          const h = headers[colNumber];
          if (!h) return;
          const v = cell.value && typeof cell.value === 'object' && 'result' in cell.value ? cell.value.result : cell.value;
          if (v != null && String(v).trim() !== '') hasData = true;
          rec[h] = v;
        });
        if (hasData) rawItems.push(rec);
      });
    }

    if (rawItems.length === 0) {
      return res.status(400).json({ error: 'No se encontraron filas de productos válidas para importar' });
    }

    if (reemplazar) {
      await repo.deactivateAllProductos(EMPRESA_ID);
    }

    let creados = 0;
    let actualizados = 0;
    let omitidos = 0;

    for (let idx = 0; idx < rawItems.length; idx++) {
      const r = rawItems[idx];
      const getVal = (...keys: string[]) => {
        for (const k of keys) {
          if (r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== '') return r[k];
        }
        return undefined;
      };

      const nombreRaw = String(getVal('nombre', 'producto', 'descripcion') || '').trim().toUpperCase();
      if (!nombreRaw) {
        omitidos++;
        continue;
      }

      const codigoRaw = String(getVal('codigo', 'sku', 'cod') || `IMP-${String(Date.now()).slice(-4)}-${idx + 1}`)
        .trim()
        .toUpperCase();
      const categoria = normalizeCategory(getVal('categoria', 'familia', 'rubro'));
      await repo.ensureCategoria(EMPRESA_ID, categoria);
      const unidadRaw = String(getVal('unidad', 'uom') || 'botella').trim();
      const unidad = VALID_UNITS.includes(unidadRaw) ? unidadRaw : 'unidad';
      const stockCentral = nnonneg(getVal('stock_inicial_central', 'stock_central', 'central') ?? 0) ?? 0;
      const stockBarra = nnonneg(getVal('stock_inicial_barra', 'stock_barra', 'stock_inicial', 'barra') ?? 0) ?? 0;
      const stockMin = nnonneg(getVal('stock_minimo_barra', 'stock_minimo', 'minimo') ?? 0) ?? 0;
      const costo = nnonneg(getVal('costo_unitario', 'costo_referencia', 'costo', 'valor') ?? 0) ?? 0;
      const tipoEnvaseRaw = String(getVal('tipo_envase', 'envase') || '').trim();
      const tipoEnvase = VALID_ENVASES.includes(tipoEnvaseRaw) ? tipoEnvaseRaw : null;
      const contenido = npos(getVal('contenido_envase', 'contenido'));
      const unidadContRaw = String(getVal('unidad_contenido', 'u_contenido') || 'ml').trim();
      const unidadCont = VALID_CONTENIDO_UNITS.includes(unidadContRaw) ? unidadContRaw : 'ml';
      const stockInicialSistema = Math.round((stockCentral + stockBarra) * 1000) / 1000;

      const existing = await repo.findProductoByCodigo(EMPRESA_ID, codigoRaw);
      if (existing) {
        await repo.updateProducto(existing.id, EMPRESA_ID, {
          nombre: nombreRaw,
          categoria,
          unidad,
          stock_minimo: stockMin,
          costo_referencia: costo,
          tipo_envase: tipoEnvase,
          contenido_envase: tipoEnvase ? contenido : null,
          unidad_contenido: tipoEnvase ? unidadCont : null,
        });
        actualizados++;
        continue;
      }

      const prod = await repo.insertProducto({
        empresa_id: EMPRESA_ID,
        codigo: codigoRaw,
        nombre: nombreRaw,
        categoria,
        area: 'Bar',
        unidad,
        stock_inicial_sistema: stockInicialSistema,
        stock_minimo: stockMin,
        costo_referencia: costo,
        tipo_envase: tipoEnvase,
        contenido_envase: tipoEnvase ? contenido : null,
        unidad_contenido: tipoEnvase ? unidadCont : null,
        activo: true,
      });

      if (stockCentral > 0) {
        const lC = await repo.insertLote({
          empresa_id: EMPRESA_ID,
          producto_id: prod.id,
          bodega_id: 1,
          cantidad_inicial: stockCentral,
          cantidad_disponible: stockCentral,
          costo_unitario: costo,
          fecha_vencimiento: null,
          fecha_ingreso: nowISO(),
          referencia: 'Carga masiva inicial',
        });
        await repo.insertMovimiento({
          empresa_id: EMPRESA_ID,
          fecha: nowISO(),
          tipo: 'Stock Inicial',
          producto_id: prod.id,
          bodega_id: 1,
          lote_id: lC.id,
          cantidad: stockCentral,
          costo_unitario: costo,
          motivo: 'Carga masiva comercial (Central)',
          responsable: req.user!.email,
        });
      }

      if (stockBarra > 0) {
        const lB = await repo.insertLote({
          empresa_id: EMPRESA_ID,
          producto_id: prod.id,
          bodega_id: 3,
          cantidad_inicial: stockBarra,
          cantidad_disponible: stockBarra,
          costo_unitario: costo,
          fecha_vencimiento: null,
          fecha_ingreso: nowISO(),
          referencia: 'Carga masiva inicial',
        });
        await repo.insertMovimiento({
          empresa_id: EMPRESA_ID,
          fecha: nowISO(),
          tipo: 'Stock Inicial',
          producto_id: prod.id,
          bodega_id: 3,
          lote_id: lB.id,
          cantidad: stockBarra,
          costo_unitario: costo,
          motivo: 'Carga masiva comercial (Barra)',
          responsable: req.user!.email,
        });
      }

      creados++;
    }

    res.json({ ok: true, creados, actualizados, omitidos });
  })
);

// ============================================================================
// INGRESOS, SALIDAS Y CIERRES (SOLO 2 TURNOS: AM / PM)
// ============================================================================

app.post(
  '/api/ingresos',
  auth,
  adminOnly,
  wrap(async (req, res) => {
    const productoId = Number(req.body?.producto_id);
    const bodegaId = Number(req.body?.bodega_id || 1);
    const cantidad = npos(req.body?.cantidad);
    const costo = nnonneg(req.body?.costo_unitario ?? 0);
    const vencimiento = req.body?.fecha_vencimiento ? String(req.body.fecha_vencimiento).slice(0, 10) : null;
    const motivo = String(req.body?.motivo || 'Ingreso de mercadería').slice(0, 160);

    if (!Number.isInteger(productoId) || ![1, 3].includes(bodegaId) || !cantidad || costo === null) {
      return res.status(400).json({ error: 'Datos de ingreso inválidos' });
    }

    const prod = await repo.findProductoById(EMPRESA_ID, productoId);
    if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });

    const lote = await repo.insertLote({
      empresa_id: EMPRESA_ID,
      producto_id: productoId,
      bodega_id: bodegaId,
      cantidad_inicial: cantidad,
      cantidad_disponible: cantidad,
      costo_unitario: costo,
      fecha_vencimiento: vencimiento,
      fecha_ingreso: nowISO(),
      referencia: motivo,
    });

    await repo.insertMovimiento({
      empresa_id: EMPRESA_ID,
      fecha: nowISO(),
      tipo: 'Ingreso',
      producto_id: productoId,
      bodega_id: bodegaId,
      lote_id: lote.id,
      cantidad,
      costo_unitario: costo,
      motivo,
      responsable: req.user!.email,
    });

    res.json({ ok: true });
  })
);

app.post(
  '/api/salidas',
  auth,
  wrap(async (req, res) => {
    const productoId = Number(req.body?.producto_id);
    const cantidad = npos(req.body?.cantidad);
    const tipo = String(req.body?.tipo || 'Salida');
    const motivo = String(req.body?.motivo || (tipo === 'Merma' ? 'Merma / Rotura en barra' : 'Consumo de barra')).slice(0, 200);

    if (!Number.isInteger(productoId) || !cantidad || !['Salida', 'Merma'].includes(tipo)) {
      return res.status(400).json({ error: 'Datos inválidos para salida o merma' });
    }

    try {
      const deducted = await deductLotsFEFO(productoId, 3, cantidad);
      for (const d of deducted) {
        await repo.insertMovimiento({
          empresa_id: EMPRESA_ID,
          fecha: nowISO(),
          tipo,
          producto_id: productoId,
          bodega_id: 3,
          lote_id: d.loteId,
          cantidad: d.qty,
          costo_unitario: d.costo,
          motivo,
          responsable: req.user!.email,
        });
      }
      res.json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al registrar salida';
      return res.status(409).json({ error: msg });
    }
  })
);

async function procesarCierreItem(params: {
  fecha: string;
  turno: 'AM' | 'PM';
  productoId: number;
  ingresos: number;
  mermas: number;
  stockCierre: number;
  observacion: string;
  userEmail: string;
}) {
  const { fecha, turno, productoId, ingresos, mermas, stockCierre, observacion, userEmail } = params;

  const prod = await repo.findProductoById(EMPRESA_ID, productoId);
  if (!prod) throw new Error(`Producto #${productoId} no encontrado`);

  const lotesBar = await repo.getActiveLotesForProductBodega(EMPRESA_ID, productoId, 3);
  const stockInicio = Math.round(lotesBar.reduce((s, l) => s + Number(l.cantidad_disponible || 0), 0) * 1000) / 1000;
  const costoRef = Number(prod.costo_referencia || 0);
  const disponibleTeorico = Math.round((stockInicio + ingresos - mermas) * 1000) / 1000;
  const consumoCalculado = Math.round((disponibleTeorico - stockCierre) * 1000) / 1000;
  const diferenciaComparativa = Math.round((stockCierre - disponibleTeorico) * 1000) / 1000;

  if (mermas > stockInicio + ingresos + 0.0001) {
    throw new Error(
      `En ${prod.nombre}, las mermas (${mermas}) superan el disponible (${stockInicio + ingresos})`
    );
  }

  if (ingresos > 0) {
    const lIng = await repo.insertLote({
      empresa_id: EMPRESA_ID,
      producto_id: productoId,
      bodega_id: 3,
      cantidad_inicial: ingresos,
      cantidad_disponible: ingresos,
      costo_unitario: costoRef,
      fecha_vencimiento: null,
      fecha_ingreso: nowISO(),
      referencia: `Ingreso en cierre ${turno}`,
    });
    await repo.insertMovimiento({
      empresa_id: EMPRESA_ID,
      fecha: nowISO(),
      tipo: 'Ingreso',
      producto_id: productoId,
      bodega_id: 3,
      lote_id: lIng.id,
      cantidad: ingresos,
      costo_unitario: costoRef,
      motivo: `Ingreso turno ${fecha} (${turno})`,
      responsable: userEmail,
    });
  }

  if (mermas > 0) {
    const deductedM = await deductLotsFEFO(productoId, 3, mermas);
    for (const d of deductedM) {
      await repo.insertMovimiento({
        empresa_id: EMPRESA_ID,
        fecha: nowISO(),
        tipo: 'Merma',
        producto_id: productoId,
        bodega_id: 3,
        lote_id: d.loteId,
        cantidad: d.qty,
        costo_unitario: d.costo,
        motivo: `Merma turno ${fecha} (${turno})${observacion ? ': ' + observacion : ''}`,
        responsable: userEmail,
      });
    }
  }

  const diffToTarget = Math.round((disponibleTeorico - stockCierre) * 1000) / 1000;
  if (diffToTarget > 0.0001) {
    const deductedC = await deductLotsFEFO(productoId, 3, diffToTarget);
    for (const d of deductedC) {
      await repo.insertMovimiento({
        empresa_id: EMPRESA_ID,
        fecha: nowISO(),
        tipo: 'Cierre Diario',
        producto_id: productoId,
        bodega_id: 3,
        lote_id: d.loteId,
        cantidad: d.qty,
        costo_unitario: d.costo,
        motivo: `Cierre manual ${fecha} (${turno}) | Contado: ${stockCierre}`,
        responsable: userEmail,
      });
    }
  } else if (diffToTarget < -0.0001) {
    const sobrante = Math.abs(diffToTarget);
    const lSob = await repo.insertLote({
      empresa_id: EMPRESA_ID,
      producto_id: productoId,
      bodega_id: 3,
      cantidad_inicial: sobrante,
      cantidad_disponible: sobrante,
      costo_unitario: costoRef,
      fecha_vencimiento: null,
      fecha_ingreso: nowISO(),
      referencia: `Ajuste positivo cierre ${turno}`,
    });
    await repo.insertMovimiento({
      empresa_id: EMPRESA_ID,
      fecha: nowISO(),
      tipo: 'Ajuste Cierre',
      producto_id: productoId,
      bodega_id: 3,
      lote_id: lSob.id,
      cantidad: sobrante,
      costo_unitario: costoRef,
      motivo: `Sobrante en cierre ${fecha} (${turno}) | Contado: ${stockCierre}`,
      responsable: userEmail,
    });
  } else {
    await repo.insertMovimiento({
      empresa_id: EMPRESA_ID,
      fecha: nowISO(),
      tipo: 'Cierre Diario',
      producto_id: productoId,
      bodega_id: 3,
      lote_id: null,
      cantidad: 0,
      costo_unitario: costoRef,
      motivo: `Cierre exacto ${fecha} (${turno}) | Stock: ${stockCierre}`,
      responsable: userEmail,
    });
  }

  await repo.insertCierre({
    empresa_id: EMPRESA_ID,
    fecha,
    turno,
    producto_id: productoId,
    stock_inicio: stockInicio,
    ingresos,
    mermas,
    stock_teorico_esperado: disponibleTeorico,
    consumo_calculado: consumoCalculado,
    stock_cierre: stockCierre,
    diferencia_comparativa: diferenciaComparativa,
    responsable: userEmail,
    observacion: observacion || null,
  });

  return { consumoCalculado, diferenciaComparativa };
}

app.post(
  '/api/cierres',
  auth,
  wrap(async (req, res) => {
    const fecha = String(req.body?.fecha || todayDate()).slice(0, 10);
    const turnoRaw = String(req.body?.turno || '').trim().toUpperCase();
    const productoId = Number(req.body?.producto_id);
    const ingresos = nnonneg(req.body?.ingresos ?? 0);
    const mermas = nnonneg(req.body?.mermas ?? 0);
    const stockCierre = nnonneg(req.body?.stock_cierre);
    const observacion = String(req.body?.observacion || '').slice(0, 200);

    if (!VALID_TURNOS.includes(turnoRaw as 'AM' | 'PM')) {
      return res.status(400).json({ error: 'El turno debe ser AM o PM únicamente' });
    }
    const turno = turnoRaw as 'AM' | 'PM';

    if (!Number.isInteger(productoId) || ingresos === null || mermas === null || stockCierre === null) {
      return res.status(400).json({ error: 'Datos inválidos en el cierre de turno' });
    }

    try {
      const result = await procesarCierreItem({
        fecha,
        turno,
        productoId,
        ingresos,
        mermas,
        stockCierre,
        observacion,
        userEmail: req.user!.email,
      });
      res.json({
        ok: true,
        consumo_calculado: result.consumoCalculado,
        diferencia_comparativa: result.diferenciaComparativa,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al registrar cierre';
      const status = msg.includes('no encontrado') ? 404 : 409;
      return res.status(status).json({ error: msg });
    }
  })
);

app.post(
  '/api/cierres/lote',
  auth,
  wrap(async (req, res) => {
    const fecha = String(req.body?.fecha || todayDate()).slice(0, 10);
    const turnoRaw = String(req.body?.turno || '').trim().toUpperCase();
    const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];

    if (!VALID_TURNOS.includes(turnoRaw as 'AM' | 'PM')) {
      return res.status(400).json({ error: 'El turno debe ser AM o PM únicamente' });
    }
    const turno = turnoRaw as 'AM' | 'PM';

    if (itemsRaw.length === 0) {
      return res.status(400).json({ error: 'Ingresa al menos un conteo de producto para guardar' });
    }

    let procesados = 0;
    try {
      for (const raw of itemsRaw) {
        const productoId = Number(raw?.producto_id);
        const ingresos = nnonneg(raw?.ingresos ?? 0);
        const mermas = nnonneg(raw?.mermas ?? 0);
        const stockCierre = nnonneg(raw?.stock_cierre);
        const observacion = String(raw?.observacion || '').slice(0, 200);

        if (!Number.isInteger(productoId) || ingresos === null || mermas === null || stockCierre === null) {
          return res.status(400).json({ error: 'Revisa los valores numéricos ingresados en la planilla' });
        }

        await procesarCierreItem({
          fecha,
          turno,
          productoId,
          ingresos,
          mermas,
          stockCierre,
          observacion,
          userEmail: req.user!.email,
        });
        procesados++;
      }
      res.json({ ok: true, procesados });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error procesando planilla de cierre';
      return res.status(409).json({ error: msg });
    }
  })
);

// ============================================================================
// SOLICITUDES Y RECEPCIÓN DE BODEGA
// ============================================================================

app.post(
  '/api/solicitudes',
  auth,
  wrap(async (req, res) => {
    const productoId = Number(req.body?.producto_id);
    const cantidad = npos(req.body?.cantidad);
    const tipoSolicitud = String(req.body?.tipo_solicitud || 'Libre / Evento').slice(0, 60);
    const observacion = String(req.body?.observacion || '').slice(0, 250);

    if (!Number.isInteger(productoId) || !cantidad) {
      return res.status(400).json({ error: 'Selecciona un producto y una cantidad válida' });
    }

    const prod = await repo.findProductoById(EMPRESA_ID, productoId);
    if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });

    await repo.insertSolicitud({
      empresa_id: EMPRESA_ID,
      fecha: nowISO(),
      bodega_origen_id: 1,
      bodega_destino_id: 3,
      producto_id: productoId,
      cantidad_solicitada: cantidad,
      cantidad_despachada: null,
      cantidad_entregada: null,
      tipo_solicitud: tipoSolicitud,
      estado: 'Pendiente',
      solicitante: req.user!.email,
      observacion: observacion || null,
      fecha_despacho: null,
      fecha_recepcion: null,
    });

    res.json({ ok: true });
  })
);

app.post(
  '/api/solicitudes/sugerido-minimo',
  auth,
  wrap(async (req, res) => {
    const estado = await buildEstado(false);
    const activeProds = new Set(
      estado.solicitudes
        .filter((s) => s.estado === 'Pendiente' || s.estado === 'Despachada')
        .map((s) => s.producto_id)
    );

    let creados = 0;
    for (const p of estado.productos) {
      if (p.bar < p.stock_minimo && !activeProds.has(p.id)) {
        const falta = Math.round((p.stock_minimo - p.bar) * 1000) / 1000;
        await repo.insertSolicitud({
          empresa_id: EMPRESA_ID,
          fecha: nowISO(),
          bodega_origen_id: 1,
          bodega_destino_id: 3,
          producto_id: p.id,
          cantidad_solicitada: falta,
          cantidad_despachada: null,
          cantidad_entregada: null,
          tipo_solicitud: 'Sugerido Mínimo',
          estado: 'Pendiente',
          solicitante: req.user!.email,
          observacion: `Reposición automática (Stock ${p.bar} < Mínimo ${p.stock_minimo})`,
          fecha_despacho: null,
          fecha_recepcion: null,
        });
        creados++;
      }
    }

    res.json({ ok: true, creados });
  })
);

app.post(
  '/api/solicitudes/:id/despachar',
  auth,
  adminOnly,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID inválido' });

    const sol = await repo.findSolicitudById(EMPRESA_ID, id);
    if (!sol || sol.estado !== 'Pendiente') {
      return res.status(404).json({ error: 'La solicitud no existe o ya fue procesada' });
    }

    const cantDespacho =
      req.body?.cantidad_despachada != null ? npos(req.body.cantidad_despachada) : Number(sol.cantidad_solicitada);
    if (!cantDespacho) {
      return res.status(400).json({ error: 'Cantidad a despachar inválida' });
    }

    try {
      const deducted = await deductLotsFEFO(sol.producto_id, 1, cantDespacho);
      for (const d of deducted) {
        await repo.insertMovimiento({
          empresa_id: EMPRESA_ID,
          fecha: nowISO(),
          tipo: 'Traspaso Salida',
          producto_id: sol.producto_id,
          bodega_id: 1,
          lote_id: d.loteId,
          cantidad: d.qty,
          costo_unitario: d.costo,
          motivo: `Despacho Solicitud #${id} hacia Barra Principal`,
          responsable: req.user!.email,
        });
      }

      await repo.updateSolicitud(id, EMPRESA_ID, {
        estado: 'Despachada',
        cantidad_despachada: cantDespacho,
        fecha_despacho: nowISO(),
      });

      res.json({ ok: true, cantidad_despachada: cantDespacho });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo despachar';
      return res.status(409).json({ error: msg });
    }
  })
);

app.post(
  '/api/solicitudes/:id/rechazar',
  auth,
  adminOnly,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const motivo = String(req.body?.motivo || 'Rechazada por Gerencia').slice(0, 200);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID inválido' });

    const sol = await repo.findSolicitudById(EMPRESA_ID, id);
    if (!sol || sol.estado !== 'Pendiente') {
      return res.status(404).json({ error: 'Solicitud no pendiente' });
    }

    await repo.updateSolicitud(id, EMPRESA_ID, {
      estado: 'Rechazada',
      observacion: sol.observacion ? `${sol.observacion} | Rechazo: ${motivo}` : `Rechazo: ${motivo}`,
    });
    res.json({ ok: true });
  })
);

app.post(
  '/api/solicitudes/:id/recibir',
  auth,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const cantRecibida = nnonneg(req.body?.cantidad_recibida);
    if (!Number.isInteger(id) || id < 1 || cantRecibida === null) {
      return res.status(400).json({ error: 'Cantidad recibida inválida' });
    }

    const sol = await repo.findSolicitudById(EMPRESA_ID, id);
    if (!sol || sol.estado !== 'Despachada') {
      return res.status(404).json({ error: 'La solicitud no está en estado Despachada' });
    }

    const prod = await repo.findProductoById(EMPRESA_ID, sol.producto_id);
    const despachada = Number(sol.cantidad_despachada ?? sol.cantidad_solicitada);
    let costoReal = Number(prod?.costo_referencia || 0);

    const dispatchMovs = await repo.getMovimientosForDispatchCost(EMPRESA_ID, sol.producto_id, id);
    if (dispatchMovs.length > 0) {
      const totQ = dispatchMovs.reduce((s, r) => s + Number(r.cantidad || 0), 0);
      const totV = dispatchMovs.reduce((s, r) => s + Number(r.cantidad || 0) * Number(r.costo_unitario || 0), 0);
      if (totQ > 0) costoReal = Math.round((totV / totQ) * 100) / 100;
    }

    if (cantRecibida > 0) {
      const lBar = await repo.insertLote({
        empresa_id: EMPRESA_ID,
        producto_id: sol.producto_id,
        bodega_id: 3,
        cantidad_inicial: cantRecibida,
        cantidad_disponible: cantRecibida,
        costo_unitario: costoReal,
        fecha_vencimiento: null,
        fecha_ingreso: nowISO(),
        referencia: `Recepción Solicitud #${id}`,
      });

      const diffNote =
        Math.abs(cantRecibida - despachada) > 0.0001
          ? ` (Ajustado: despachado ${despachada}, recibido ${cantRecibida})`
          : '';

      await repo.insertMovimiento({
        empresa_id: EMPRESA_ID,
        fecha: nowISO(),
        tipo: 'Recepción Barra',
        producto_id: sol.producto_id,
        bodega_id: 3,
        lote_id: lBar.id,
        cantidad: cantRecibida,
        costo_unitario: costoReal,
        motivo: `Recepción Solicitud #${id} (${sol.tipo_solicitud})${diffNote}`,
        responsable: req.user!.email,
      });
    }

    await repo.updateSolicitud(id, EMPRESA_ID, {
      estado: 'Recibida',
      cantidad_entregada: cantRecibida,
      fecha_recepcion: nowISO(),
    });

    res.json({ ok: true, cantidad_entregada: cantRecibida });
  })
);

app.post(
  '/api/cuadratura/ajustar',
  auth,
  adminOnly,
  wrap(async (req, res) => {
    const productoId = Number(req.body?.producto_id);
    const bodegaId = Number(req.body?.bodega_id || 3);
    const conteoFisico = nnonneg(req.body?.conteo_fisico);
    const motivo = String(req.body?.motivo || 'Ajuste por cuadratura física').slice(0, 200);

    if (!Number.isInteger(productoId) || ![1, 3].includes(bodegaId) || conteoFisico === null) {
      return res.status(400).json({ error: 'Datos de cuadratura inválidos' });
    }

    const prod = await repo.findProductoById(EMPRESA_ID, productoId);
    if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });

    const lotes = await repo.getActiveLotesForProductBodega(EMPRESA_ID, productoId, bodegaId);
    const teorico = Math.round(lotes.reduce((s, l) => s + Number(l.cantidad_disponible || 0), 0) * 1000) / 1000;
    const costoRef = Number(prod.costo_referencia || 0);
    const diff = Math.round((conteoFisico - teorico) * 1000) / 1000;

    if (Math.abs(diff) < 0.0001) {
      return res.json({ ok: true, diferencia: 0, message: 'El stock ya cuadra exactamente' });
    }

    if (diff > 0) {
      const lAdd = await repo.insertLote({
        empresa_id: EMPRESA_ID,
        producto_id: productoId,
        bodega_id: bodegaId,
        cantidad_inicial: diff,
        cantidad_disponible: diff,
        costo_unitario: costoRef,
        fecha_vencimiento: null,
        fecha_ingreso: nowISO(),
        referencia: 'Ajuste Cuadratura +',
      });
      await repo.insertMovimiento({
        empresa_id: EMPRESA_ID,
        fecha: nowISO(),
        tipo: 'Ajuste Cuadratura',
        producto_id: productoId,
        bodega_id: bodegaId,
        lote_id: lAdd.id,
        cantidad: diff,
        costo_unitario: costoRef,
        motivo: `${motivo} (+${diff} | Sistema ${teorico} → Físico ${conteoFisico})`,
        responsable: req.user!.email,
      });
    } else {
      const faltante = Math.abs(diff);
      const deducted = await deductLotsFEFO(productoId, bodegaId, faltante);
      for (const d of deducted) {
        await repo.insertMovimiento({
          empresa_id: EMPRESA_ID,
          fecha: nowISO(),
          tipo: 'Ajuste Cuadratura',
          producto_id: productoId,
          bodega_id: bodegaId,
          lote_id: d.loteId,
          cantidad: d.qty,
          costo_unitario: d.costo,
          motivo: `${motivo} (-${d.qty} | Sistema ${teorico} → Físico ${conteoFisico})`,
          responsable: req.user!.email,
        });
      }
    }

    res.json({ ok: true, diferencia: diff });
  })
);

// ============================================================================
// PROVEEDORES (CON WHATSAPP WSP)
// ============================================================================

app.post(
  '/api/proveedores',
  auth,
  adminOnly,
  wrap(async (req, res) => {
    const b = req.body || {};
    const nombre = String(b.nombre || '').trim();
    const telefonoWsp = String(b.telefono_wsp || '').trim();
    if (!nombre || !telefonoWsp) {
      return res.status(400).json({ error: 'Nombre y teléfono WhatsApp del proveedor son obligatorios' });
    }
    const created = await repo.insertProveedor({
      empresa_id: EMPRESA_ID,
      nombre,
      contacto: b.contacto ? String(b.contacto).trim() : null,
      telefono_wsp: telefonoWsp,
      email: b.email ? String(b.email).trim() : null,
      categoria: String(b.categoria || 'Licores y Destilados').trim(),
      rut: b.rut ? String(b.rut).trim() : null,
      notas: b.notas ? String(b.notas).trim() : null,
      activo: true,
    });
    res.json({ ok: true, id: created.id });
  })
);

app.patch(
  '/api/proveedores/:id',
  auth,
  adminOnly,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID inválido' });
    const b = req.body || {};
    const nombre = String(b.nombre || '').trim();
    const telefonoWsp = String(b.telefono_wsp || '').trim();
    if (!nombre || !telefonoWsp) {
      return res.status(400).json({ error: 'Nombre y teléfono WhatsApp son obligatorios' });
    }
    const ok = await repo.updateProveedor(id, EMPRESA_ID, {
      nombre,
      contacto: b.contacto ? String(b.contacto).trim() : null,
      telefono_wsp: telefonoWsp,
      email: b.email ? String(b.email).trim() : null,
      categoria: String(b.categoria || 'Licores y Destilados').trim(),
      rut: b.rut ? String(b.rut).trim() : null,
      notas: b.notas ? String(b.notas).trim() : null,
    });
    if (!ok) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json({ ok: true });
  })
);

app.delete(
  '/api/proveedores/:id',
  auth,
  adminOnly,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID inválido' });
    const ok = await repo.updateProveedor(id, EMPRESA_ID, { activo: false });
    if (!ok) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json({ ok: true });
  })
);

// ============================================================================
// CATEGORÍAS DINÁMICAS (PARA TODOS LOS ÍTEMS)
// ============================================================================

app.post(
  '/api/categorias',
  auth,
  wrap(async (req, res) => {
    if (req.user!.rol !== 'Gerencia') {
      const snap = await repo.getSnapshot(EMPRESA_ID);
      if (!snap.insumoControl?.permitir_crear_items_bar) {
        return res.status(403).json({
          error: 'Solo Gerencia puede crear nuevas categorías (restringido por política de control)',
        });
      }
    }
    const nombre = String(req.body?.nombre || '').trim();
    if (!nombre || nombre.length < 2) {
      return res.status(400).json({ error: 'Ingresa un nombre válido para la categoría' });
    }
    const cat = await repo.ensureCategoria(EMPRESA_ID, nombre);
    res.json({ ok: true, categoria: cat });
  })
);

app.patch(
  '/api/categorias',
  auth,
  wrap(async (req, res) => {
    if (req.user!.rol !== 'Gerencia') {
      const snap = await repo.getSnapshot(EMPRESA_ID);
      if (!snap.insumoControl?.permitir_crear_items_bar) {
        return res.status(403).json({
          error: 'Solo Gerencia puede renombrar categorías (restringido por política de control)',
        });
      }
    }
    const oldNombre = String(req.body?.oldNombre || '').trim();
    const newNombre = String(req.body?.newNombre || '').trim();
    if (!oldNombre || !newNombre || newNombre.length < 2) {
      return res.status(400).json({ error: 'Indica el nombre actual y el nuevo nombre de la categoría' });
    }
    await repo.renameCategoria(EMPRESA_ID, oldNombre, newNombre);
    await repo.ensureCategoria(EMPRESA_ID, newNombre);
    res.json({ ok: true });
  })
);

app.delete(
  '/api/categorias/:nombre',
  auth,
  adminOnly,
  wrap(async (req, res) => {
    const nombre = decodeURIComponent(String(req.params.nombre || '')).trim();
    if (!nombre) return res.status(400).json({ error: 'Nombre inválido' });
    await repo.deleteCategoria(EMPRESA_ID, nombre);
    res.json({ ok: true });
  })
);

// ============================================================================
// MAESTRO DE INSUMOS, LÍMITES DE CONTROL Y SOLICITUDES
// ============================================================================

app.put(
  '/api/insumos/control',
  auth,
  adminOnly,
  wrap(async (req, res) => {
    const b = req.body || {};
    const maxItemsRaw = b.max_items_por_solicitud;
    const maxItems =
      maxItemsRaw === null || maxItemsRaw === undefined || String(maxItemsRaw).trim() === ''
        ? null
        : npos(maxItemsRaw);
    if (maxItemsRaw !== null && maxItemsRaw !== undefined && String(maxItemsRaw).trim() !== '' && (!maxItems || !Number.isInteger(maxItems))) {
      return res.status(400).json({ error: 'El máximo de líneas por solicitud debe ser un número entero mayor a 0' });
    }

    const catsPermitidas = Array.isArray(b.categorias_permitidas_bar)
      ? b.categorias_permitidas_bar.map((c: unknown) => String(c || '').trim()).filter(Boolean)
      : [];
    const criteriosPermitidos = Array.isArray(b.criterios_permitidos_bar)
      ? b.criterios_permitidos_bar.map((c: unknown) => String(c || '').trim()).filter(Boolean)
      : [];

    const saved = await repo.saveInsumoControl(EMPRESA_ID, {
      permitir_crear_items_bar: Boolean(b.permitir_crear_items_bar),
      restringir_categorias_bar: Boolean(b.restringir_categorias_bar),
      categorias_permitidas_bar: catsPermitidas,
      solo_bajo_minimo: Boolean(b.solo_bajo_minimo),
      bloquear_duplicados_pendientes: Boolean(b.bloquear_duplicados_pendientes),
      max_items_por_solicitud: maxItems,
      permitir_criterio_personalizado_bar: Boolean(b.permitir_criterio_personalizado_bar),
      criterios_permitidos_bar: criteriosPermitidos,
    });

    res.json({ ok: true, insumoControl: saved });
  })
);

app.post(
  '/api/insumos',
  auth,
  wrap(async (req, res) => {
    if (req.user!.rol !== 'Gerencia') {
      const snap = await repo.getSnapshot(EMPRESA_ID);
      if (!snap.insumoControl?.permitir_crear_items_bar) {
        return res.status(403).json({
          error: 'Solo Gerencia puede incorporar nuevos ítems al maestro (control activo)',
        });
      }
    }

    const b = req.body || {};
    const rawCodigo = String(b.codigo || '').trim().toUpperCase();
    const codigo = rawCodigo || `INS-${String(Date.now()).slice(-5)}`;
    const nombre = String(b.nombre || '').trim().toUpperCase();
    const categoria = normalizeCategory(b.categoria, 'Insumos de Barra');
    const criterio = b.criterio ? String(b.criterio).trim() : null;
    const unidad = String(b.unidad || 'unidad').trim();
    const stockActual = nnonneg(b.stock_actual ?? 0);
    const stockMinimo = nnonneg(b.stock_minimo ?? 0);
    const costoUnitario = req.user!.rol === 'Gerencia' ? (nnonneg(b.costo_unitario ?? 0) ?? 0) : 0;
    const proveedorId = b.proveedor_id ? Number(b.proveedor_id) : null;
    const solicitablePorBar =
      req.user!.rol === 'Gerencia' && b.solicitable_por_bar !== undefined
        ? Boolean(b.solicitable_por_bar)
        : true;
    const maxPorSolicitud =
      req.user!.rol === 'Gerencia' && b.max_por_solicitud !== undefined && b.max_por_solicitud !== null && String(b.max_por_solicitud).trim() !== ''
        ? npos(b.max_por_solicitud)
        : null;

    if (!nombre || stockActual === null || stockMinimo === null) {
      return res.status(400).json({ error: 'Verifica nombre, stock inicial y stock mínimo del ítem' });
    }

    await repo.ensureCategoria(EMPRESA_ID, categoria);

    const ins = await repo.insertInsumo({
      empresa_id: EMPRESA_ID,
      codigo,
      nombre,
      categoria,
      criterio,
      unidad,
      stock_actual: stockActual,
      stock_minimo: stockMinimo,
      costo_unitario: costoUnitario,
      proveedor_id: proveedorId,
      solicitable_por_bar: solicitablePorBar,
      max_por_solicitud: maxPorSolicitud,
      notas: b.notas ? String(b.notas).trim() : null,
      activo: true,
    });
    res.json({ ok: true, id: ins.id });
  })
);

app.patch(
  '/api/insumos/:id',
  auth,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID inválido' });
    const existing = await repo.findInsumoById(EMPRESA_ID, id);
    if (!existing) return res.status(404).json({ error: 'Ítem no encontrado' });

    if (req.user!.rol !== 'Gerencia') {
      const snap = await repo.getSnapshot(EMPRESA_ID);
      if (!snap.insumoControl?.permitir_crear_items_bar) {
        return res.status(403).json({
          error: 'Solo Gerencia puede editar o mover ítems del maestro (control activo)',
        });
      }
    }

    const b = req.body || {};
    const nombre = b.nombre !== undefined ? String(b.nombre).trim().toUpperCase() : existing.nombre;
    const categoria =
      b.categoria !== undefined
        ? normalizeCategory(b.categoria, 'Insumos de Barra')
        : existing.categoria || 'Insumos de Barra';
    const criterio = b.criterio !== undefined ? (b.criterio ? String(b.criterio).trim() : null) : existing.criterio ?? null;
    const unidad = b.unidad !== undefined ? String(b.unidad).trim() : existing.unidad;
    const stockActual = b.stock_actual !== undefined ? nnonneg(b.stock_actual) : existing.stock_actual;
    const stockMinimo = b.stock_minimo !== undefined ? nnonneg(b.stock_minimo) : existing.stock_minimo;
    const costoUnitario =
      req.user!.rol === 'Gerencia' && b.costo_unitario !== undefined
        ? nnonneg(b.costo_unitario)
        : existing.costo_unitario;
    const proveedorId =
      b.proveedor_id !== undefined ? (b.proveedor_id ? Number(b.proveedor_id) : null) : existing.proveedor_id;
    const solicitablePorBar =
      req.user!.rol === 'Gerencia' && b.solicitable_por_bar !== undefined
        ? Boolean(b.solicitable_por_bar)
        : (existing.solicitable_por_bar ?? true);
    let maxPorSolicitud = existing.max_por_solicitud ?? null;
    if (req.user!.rol === 'Gerencia' && b.max_por_solicitud !== undefined) {
      if (b.max_por_solicitud === null || String(b.max_por_solicitud).trim() === '') {
        maxPorSolicitud = null;
      } else {
        const parsedMax = npos(b.max_por_solicitud);
        if (!parsedMax) return res.status(400).json({ error: 'El límite máximo por solicitud debe ser mayor a 0' });
        maxPorSolicitud = parsedMax;
      }
    }
    const notas = b.notas !== undefined ? (b.notas ? String(b.notas).trim() : null) : existing.notas;

    if (!nombre || !unidad || stockActual === null || stockMinimo === null || costoUnitario === null) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }

    await repo.ensureCategoria(EMPRESA_ID, categoria);

    const ok = await repo.updateInsumo(id, EMPRESA_ID, {
      nombre,
      categoria,
      criterio,
      unidad,
      stock_actual: stockActual,
      stock_minimo: stockMinimo,
      costo_unitario: costoUnitario,
      proveedor_id: proveedorId,
      solicitable_por_bar: solicitablePorBar,
      max_por_solicitud: maxPorSolicitud,
      notas,
    });
    if (!ok) return res.status(404).json({ error: 'Ítem no encontrado' });
    res.json({ ok: true });
  })
);

app.delete(
  '/api/insumos/:id',
  auth,
  wrap(async (req, res) => {
    if (req.user!.rol !== 'Gerencia') {
      const snap = await repo.getSnapshot(EMPRESA_ID);
      if (!snap.insumoControl?.permitir_crear_items_bar) {
        return res.status(403).json({
          error: 'Solo Gerencia puede eliminar ítems del maestro (control activo)',
        });
      }
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID inválido' });
    const ok = await repo.updateInsumo(id, EMPRESA_ID, { activo: false });
    if (!ok) return res.status(404).json({ error: 'Ítem no encontrado' });
    res.json({ ok: true });
  })
);

app.post(
  '/api/insumos/:id/movimiento',
  auth,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const tipo = String(req.body?.tipo || 'Consumo'); // 'Ingreso' | 'Consumo'
    const cantidad = npos(req.body?.cantidad);
    if (!Number.isInteger(id) || id < 1 || !cantidad || !['Ingreso', 'Consumo'].includes(tipo)) {
      return res.status(400).json({ error: 'Movimiento de insumo inválido' });
    }
    const ins = await repo.findInsumoById(EMPRESA_ID, id);
    if (!ins) return res.status(404).json({ error: 'Insumo no encontrado' });

    const nuevoStock =
      tipo === 'Ingreso'
        ? Math.round((ins.stock_actual + cantidad) * 1000) / 1000
        : Math.round((ins.stock_actual - cantidad) * 1000) / 1000;

    if (nuevoStock < 0) {
      return res.status(409).json({ error: `Stock insuficiente del insumo (${ins.stock_actual} ${ins.unidad})` });
    }

    await repo.updateInsumo(id, EMPRESA_ID, { stock_actual: nuevoStock });
    res.json({ ok: true, stock_actual: nuevoStock });
  })
);

app.post(
  '/api/insumos/solicitudes',
  auth,
  wrap(async (req, res) => {
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const fallbackProvId = req.body?.proveedor_id ? Number(req.body.proveedor_id) : null;
    const fallbackObs = req.body?.observacion ? String(req.body.observacion).trim() : null;
    if (rawItems.length === 0) {
      return res.status(400).json({ error: 'Agrega al menos un ítem con cantidad a solicitar' });
    }

    const isGerencia = req.user!.rol === 'Gerencia';
    const snap = await repo.getSnapshot(EMPRESA_ID);
    const ctrl = snap.insumoControl || { empresa_id: EMPRESA_ID, ...DEFAULT_INSUMO_CONTROL };
    const insById = new Map(snap.insumos.map((i) => [i.id, i]));
    const pendingInsumoIds = new Set(
      (snap.solicitudesInsumos || [])
        .filter((s) => s.estado === 'Pendiente' && s.insumo_id != null)
        .map((s) => s.insumo_id as number)
    );
    const allowedCatsLower = new Set(
      (ctrl.categorias_permitidas_bar || []).map((c) => c.trim().toLowerCase())
    );
    const allowedCriteriosLower = new Set(
      (ctrl.criterios_permitidos_bar || []).map((c) => c.trim().toLowerCase())
    );

    if (!isGerencia && ctrl.max_items_por_solicitud != null && rawItems.length > ctrl.max_items_por_solicitud) {
      return res.status(403).json({
        error: `Gerencia limitó las solicitudes de Barra a un máximo de ${ctrl.max_items_por_solicitud} ítems por envío`,
      });
    }

    const validatedToInsert: Array<Parameters<typeof repo.insertSolicitudInsumo>[0]> = [];

    for (const item of rawItems) {
      const insumoId = item.insumo_id ? Number(item.insumo_id) : null;
      const ins = insumoId ? insById.get(insumoId) || (await repo.findInsumoById(EMPRESA_ID, insumoId)) : null;
      const nombreItem = String(item.nombre_item || ins?.nombre || '').trim().toUpperCase();
      const categoria = normalizeCategory(item.categoria || ins?.categoria || 'Insumos de Barra', 'Insumos de Barra');
      const unidad = String(item.unidad || ins?.unidad || 'unidad').trim();
      const cantidadSolicitada = npos(item.cantidad_solicitada ?? item.cantidad);
      const criterio = String(item.criterio || ins?.criterio || 'Reposición bajo mínimo').trim();
      const proveedorId = item.proveedor_id ? Number(item.proveedor_id) : (ins?.proveedor_id ?? fallbackProvId);

      if (!nombreItem || !cantidadSolicitada) continue;

      if (!isGerencia) {
        if (!ins) {
          return res.status(403).json({
            error: 'Solo puedes solicitar ítems habilitados en el maestro de Gerencia',
          });
        }
        if (ins.solicitable_por_bar === false) {
          return res.status(403).json({
            error: `El ítem "${ins.nombre}" está bloqueado por Gerencia para solicitudes de Barra`,
          });
        }
        if (ctrl.restringir_categorias_bar && !allowedCatsLower.has(categoria.toLowerCase())) {
          return res.status(403).json({
            error: `La categoría "${categoria}" está restringida por Gerencia para solicitudes de Barra`,
          });
        }
        if (ctrl.solo_bajo_minimo && Number(ins.stock_actual || 0) >= Number(ins.stock_minimo || 0)) {
          return res.status(403).json({
            error: `Gerencia solo autoriza solicitar ítems bajo mínimo (${ins.nombre} tiene stock suficiente)`,
          });
        }
        if (ctrl.bloquear_duplicados_pendientes && pendingInsumoIds.has(ins.id)) {
          return res.status(403).json({
            error: `Ya existe una solicitud pendiente para "${ins.nombre}". Espera aprobación de Gerencia`,
          });
        }
        if (ins.max_por_solicitud != null && ins.max_por_solicitud > 0 && cantidadSolicitada > ins.max_por_solicitud) {
          return res.status(403).json({
            error: `La cantidad solicitada de "${ins.nombre}" (${cantidadSolicitada}) supera el máximo de ${ins.max_por_solicitud} ${ins.unidad} autorizado por Gerencia`,
          });
        }
        if (!ctrl.permitir_criterio_personalizado_bar && allowedCriteriosLower.size > 0 && !allowedCriteriosLower.has(criterio.toLowerCase())) {
          return res.status(403).json({
            error: `El criterio "${criterio}" no está dentro de los criterios autorizados por Gerencia`,
          });
        }
      }

      validatedToInsert.push({
        empresa_id: EMPRESA_ID,
        fecha: nowISO(),
        insumo_id: ins?.id ?? null,
        nombre_item: nombreItem,
        categoria,
        unidad,
        cantidad_solicitada: cantidadSolicitada,
        criterio,
        proveedor_id: proveedorId,
        estado: 'Pendiente',
        solicitante: req.user!.email,
        observacion: item.observacion ? String(item.observacion).trim() : fallbackObs,
      });
    }

    if (validatedToInsert.length === 0) {
      return res.status(400).json({ error: 'No se encontraron ítems válidos con cantidad mayor a 0' });
    }

    for (const row of validatedToInsert) {
      await repo.insertSolicitudInsumo(row);
    }

    res.json({ ok: true, creados: validatedToInsert.length });
  })
);

app.patch(
  '/api/insumos/solicitudes/:id',
  auth,
  adminOnly,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const estado = String(req.body?.estado || '');
    if (!Number.isInteger(id) || id < 1 || !['Pendiente', 'Aprobada', 'Comprada', 'Rechazada'].includes(estado)) {
      return res.status(400).json({ error: 'Estado de solicitud inválido' });
    }
    const patch: Partial<{
      estado: 'Pendiente' | 'Aprobada' | 'Comprada' | 'Rechazada';
      cantidad_solicitada: number;
      observacion: string | null;
    }> = {
      estado: estado as 'Pendiente' | 'Aprobada' | 'Comprada' | 'Rechazada',
    };
    if (req.body?.cantidad_solicitada !== undefined) {
      const qty = npos(req.body.cantidad_solicitada);
      if (!qty) return res.status(400).json({ error: 'Cantidad ajustada inválida' });
      patch.cantidad_solicitada = qty;
    }
    if (req.body?.observacion !== undefined) {
      patch.observacion = req.body.observacion ? String(req.body.observacion).trim() : null;
    }

    const ok = await repo.updateSolicitudInsumo(id, EMPRESA_ID, patch);
    if (!ok) return res.status(404).json({ error: 'Solicitud no encontrada' });
    res.json({ ok: true });
  })
);

// ============================================================================
// FICHA DE COSTEO DE CÓCTELES Y DESCUENTOS DE BARRA
// ============================================================================

app.post(
  '/api/recetas',
  auth,
  adminOnly,
  wrap(async (req, res) => {
    const b = req.body || {};
    const codigo = String(b.codigo || '').trim().toUpperCase();
    const nombre = String(b.nombre || '').trim();
    const categoria = String(b.categoria || 'Cóctel Clásico').trim();
    const precioVenta = nnonneg(b.precio_venta ?? 0);
    const notas = b.notas ? String(b.notas).trim() : null;
    const rawIngs = Array.isArray(b.ingredientes) ? b.ingredientes : [];

    if (!codigo || !nombre || precioVenta === null || rawIngs.length === 0) {
      return res.status(400).json({ error: 'Completa código, nombre, precio de venta y al menos 1 ingrediente' });
    }

    const ingredientes: Array<{ producto_id: number; cantidad_ml_o_unidad: number; unidad_medida: string }> = [];
    for (const ing of rawIngs) {
      const pid = Number(ing.producto_id);
      const qty = npos(ing.cantidad_ml_o_unidad);
      const u = String(ing.unidad_medida || 'ml').trim();
      if (!Number.isInteger(pid) || !qty) {
        return res.status(400).json({ error: 'Todos los ingredientes deben tener producto y dosis positiva' });
      }
      const p = await repo.findProductoById(EMPRESA_ID, pid);
      if (!p) return res.status(404).json({ error: `Ingrediente producto #${pid} no encontrado` });
      ingredientes.push({ producto_id: pid, cantidad_ml_o_unidad: qty, unidad_medida: u });
    }

    const rec = await repo.insertReceta(
      {
        empresa_id: EMPRESA_ID,
        codigo,
        nombre,
        categoria,
        precio_venta: precioVenta,
        notas,
        activo: true,
      },
      ingredientes
    );

    res.json({ ok: true, id: rec.id });
  })
);

app.delete(
  '/api/recetas/:id',
  auth,
  adminOnly,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID inválido' });
    const ok = await repo.deactivateReceta(id, EMPRESA_ID);
    if (!ok) return res.status(404).json({ error: 'Receta no encontrada' });
    res.json({ ok: true });
  })
);

app.post(
  '/api/recetas/:id/descontar',
  auth,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const porciones = npos(req.body?.cantidad ?? 1);
    const fecha = String(req.body?.fecha || todayDate()).slice(0, 10);
    const turnoRaw = String(req.body?.turno || 'PM').trim().toUpperCase();
    const turno = (VALID_TURNOS.includes(turnoRaw as 'AM' | 'PM') ? turnoRaw : 'PM') as 'AM' | 'PM';
    const motivoExtra = String(req.body?.motivo || '').trim();

    if (!Number.isInteger(id) || id < 1 || !porciones) {
      return res.status(400).json({ error: 'Cantidad de tragos a descontar inválida' });
    }

    const rec = await repo.findRecetaById(EMPRESA_ID, id);
    if (!rec) return res.status(404).json({ error: 'Receta no encontrada' });

    const ings = await repo.getRecetaIngredientes(EMPRESA_ID, id);
    if (ings.length === 0) {
      return res.status(400).json({ error: 'La receta no tiene ingredientes configurados' });
    }

    const plan: Array<{ prod: DbProducto; stockUnits: number; rawQty: number; unit: string }> = [];
    for (const ing of ings) {
      const prod = await repo.findProductoById(EMPRESA_ID, ing.producto_id);
      if (!prod) continue;
      const totalRaw = Math.round(Number(ing.cantidad_ml_o_unidad) * porciones * 1000) / 1000;
      const stockUnits = convertIngredientToStockUnits(prod, totalRaw, ing.unidad_medida);
      const lotesBar = await repo.getActiveLotesForProductBodega(EMPRESA_ID, prod.id, 3);
      const avail = lotesBar.reduce((s, l) => s + Number(l.cantidad_disponible || 0), 0);
      if (avail + 0.0005 < stockUnits) {
        return res.status(409).json({
          error: `Stock insuficiente en Barra de ${prod.nombre}: requiere ${stockUnits} ${prod.unidad}, disponible ${Math.round(avail * 1000) / 1000}`,
        });
      }
      plan.push({ prod, stockUnits, rawQty: totalRaw, unit: ing.unidad_medida });
    }

    let costoTotal = 0;
    const detalleParts: string[] = [];
    for (const item of plan) {
      const deducted = await deductLotsFEFO(item.prod.id, 3, item.stockUnits);
      for (const d of deducted) {
        costoTotal += d.qty * d.costo;
        await repo.insertMovimiento({
          empresa_id: EMPRESA_ID,
          fecha: nowISO(),
          tipo: 'Descuento Cóctel',
          producto_id: item.prod.id,
          bodega_id: 3,
          lote_id: d.loteId,
          cantidad: d.qty,
          costo_unitario: d.costo,
          motivo: `${porciones}x ${rec.nombre} (${fecha} · Turno ${turno} · ${item.rawQty} ${item.unit})${motivoExtra ? ' · ' + motivoExtra : ''}`,
          responsable: req.user!.email,
        });
      }
      detalleParts.push(`${item.prod.nombre}: -${Math.round(item.stockUnits * 1000) / 1000} ${item.prod.unidad}`);
    }

    await repo.insertConsumoTurno({
      empresa_id: EMPRESA_ID,
      fecha,
      turno,
      tipo: 'Cóctel Compuesto',
      receta_id: rec.id,
      producto_id: null,
      nombre: rec.nombre,
      cantidad_porciones: porciones,
      detalle_descuento: detalleParts.join(' | '),
      costo_total: Math.round(costoTotal),
      responsable: req.user!.email,
      observacion: motivoExtra || null,
    });

    res.json({ ok: true, receta: rec.nombre, porciones, fecha, turno });
  })
);

app.post(
  '/api/turno/descontar-lote',
  auth,
  wrap(async (req, res) => {
    const fecha = String(req.body?.fecha || todayDate()).slice(0, 10);
    const turnoRaw = String(req.body?.turno || 'PM').trim().toUpperCase();
    const turno = (VALID_TURNOS.includes(turnoRaw as 'AM' | 'PM') ? turnoRaw : 'PM') as 'AM' | 'PM';
    const observacion = String(req.body?.observacion || '').trim().slice(0, 200);
    const recetasRaw = Array.isArray(req.body?.recetas) ? req.body.recetas : [];
    const cortosRaw = Array.isArray(req.body?.cortos) ? req.body.cortos : [];

    if (recetasRaw.length === 0 && cortosRaw.length === 0) {
      return res.status(400).json({ error: 'Ingresa al menos una receta de cóctel o corto para descontar en el turno' });
    }

    const aggregateByProduct = new Map<number, number>();
    const recetaEntries: Array<{
      rec: NonNullable<Awaited<ReturnType<typeof repo.findRecetaById>>>;
      porciones: number;
      items: Array<{ prod: DbProducto; stockUnits: number; rawQty: number; unit: string }>;
    }> = [];

    for (const r of recetasRaw) {
      const recetaId = Number(r?.receta_id);
      const porciones = npos(r?.cantidad);
      if (!Number.isInteger(recetaId) || !porciones) {
        return res.status(400).json({ error: 'Datos inválidos en las recetas seleccionadas' });
      }
      const rec = await repo.findRecetaById(EMPRESA_ID, recetaId);
      if (!rec) return res.status(404).json({ error: `Receta #${recetaId} no encontrada` });
      const ings = await repo.getRecetaIngredientes(EMPRESA_ID, recetaId);
      if (ings.length === 0) {
        return res.status(400).json({ error: `La receta ${rec.nombre} no tiene ingredientes configurados` });
      }
      const items: Array<{ prod: DbProducto; stockUnits: number; rawQty: number; unit: string }> = [];
      for (const ing of ings) {
        const prod = await repo.findProductoById(EMPRESA_ID, ing.producto_id);
        if (!prod) continue;
        const rawQty = Math.round(Number(ing.cantidad_ml_o_unidad) * porciones * 1000) / 1000;
        const stockUnits = convertIngredientToStockUnits(prod, rawQty, ing.unidad_medida);
        aggregateByProduct.set(prod.id, Math.round(((aggregateByProduct.get(prod.id) || 0) + stockUnits) * 10000) / 10000);
        items.push({ prod, stockUnits, rawQty, unit: ing.unidad_medida });
      }
      recetaEntries.push({ rec, porciones, items });
    }

    const cortoEntries: Array<{
      prod: DbProducto;
      porciones: number;
      rendimientoUsado: number;
      stockUnits: number;
    }> = [];

    for (const c of cortosRaw) {
      const productoId = Number(c?.producto_id);
      const porciones = npos(c?.cantidad);
      if (!Number.isInteger(productoId) || !porciones) {
        return res.status(400).json({ error: 'Datos inválidos en los cortos por botella' });
      }
      const prod = await repo.findProductoById(EMPRESA_ID, productoId);
      if (!prod) return res.status(404).json({ error: `Producto #${productoId} no encontrado` });
      const overrideYield = c?.porciones_por_botella !== undefined && c?.porciones_por_botella !== '' ? npos(c.porciones_por_botella) : null;
      const rendimiento = overrideYield || Number(prod.porciones_corto || 0);
      if (!rendimiento || rendimiento <= 0) {
        return res.status(400).json({
          error: `${prod.nombre} no tiene rendimiento de cortos configurado. Configúralo desde Gerencia o indica cuántas porciones rinde la botella.`,
        });
      }
      const stockUnits = Math.round((porciones / rendimiento) * 10000) / 10000;
      aggregateByProduct.set(prod.id, Math.round(((aggregateByProduct.get(prod.id) || 0) + stockUnits) * 10000) / 10000);
      cortoEntries.push({ prod, porciones, rendimientoUsado: rendimiento, stockUnits });
    }

    // Validar stock agregado disponible en Barra Principal antes de descontar
    for (const [pid, reqQty] of aggregateByProduct.entries()) {
      const prod = await repo.findProductoById(EMPRESA_ID, pid);
      if (!prod) continue;
      const lotesBar = await repo.getActiveLotesForProductBodega(EMPRESA_ID, pid, 3);
      const avail = lotesBar.reduce((s, l) => s + Number(l.cantidad_disponible || 0), 0);
      if (avail + 0.0005 < reqQty) {
        return res.status(409).json({
          error: `Stock insuficiente en Barra de ${prod.nombre}: requiere ${Math.round(reqQty * 1000) / 1000} ${prod.unidad}, disponible ${Math.round(avail * 1000) / 1000}`,
        });
      }
    }

    // Ejecutar descuentos FEFO y registrar trazabilidad de turno
    for (const entry of recetaEntries) {
      let costoTotal = 0;
      const detalleParts: string[] = [];
      for (const item of entry.items) {
        const deducted = await deductLotsFEFO(item.prod.id, 3, item.stockUnits);
        for (const d of deducted) {
          costoTotal += d.qty * d.costo;
          await repo.insertMovimiento({
            empresa_id: EMPRESA_ID,
            fecha: nowISO(),
            tipo: 'Descuento Cóctel',
            producto_id: item.prod.id,
            bodega_id: 3,
            lote_id: d.loteId,
            cantidad: d.qty,
            costo_unitario: d.costo,
            motivo: `${entry.porciones}x ${entry.rec.nombre} (${fecha} · Turno ${turno} · ${item.rawQty} ${item.unit})${observacion ? ' · ' + observacion : ''}`,
            responsable: req.user!.email,
          });
        }
        detalleParts.push(`${item.prod.nombre}: -${Math.round(item.stockUnits * 1000) / 1000} ${item.prod.unidad}`);
      }
      await repo.insertConsumoTurno({
        empresa_id: EMPRESA_ID,
        fecha,
        turno,
        tipo: 'Cóctel Compuesto',
        receta_id: entry.rec.id,
        producto_id: null,
        nombre: entry.rec.nombre,
        cantidad_porciones: entry.porciones,
        detalle_descuento: detalleParts.join(' | '),
        costo_total: Math.round(costoTotal),
        responsable: req.user!.email,
        observacion: observacion || null,
      });
    }

    for (const c of cortoEntries) {
      let costoTotal = 0;
      const deducted = await deductLotsFEFO(c.prod.id, 3, c.stockUnits);
      for (const d of deducted) {
        costoTotal += d.qty * d.costo;
        await repo.insertMovimiento({
          empresa_id: EMPRESA_ID,
          fecha: nowISO(),
          tipo: 'Descuento Corto',
          producto_id: c.prod.id,
          bodega_id: 3,
          lote_id: d.loteId,
          cantidad: d.qty,
          costo_unitario: d.costo,
          motivo: `${c.porciones} corto(s) ${c.prod.nombre} (Rend: ${c.rendimientoUsado}/bot · ${fecha} Turno ${turno})${observacion ? ' · ' + observacion : ''}`,
          responsable: req.user!.email,
        });
      }
      await repo.insertConsumoTurno({
        empresa_id: EMPRESA_ID,
        fecha,
        turno,
        tipo: 'Corto / Botella',
        receta_id: null,
        producto_id: c.prod.id,
        nombre: `Corto ${c.prod.nombre}`,
        cantidad_porciones: c.porciones,
        detalle_descuento: `${c.porciones} cortos (${c.rendimientoUsado}/bot) = -${Math.round(c.stockUnits * 1000) / 1000} ${c.prod.unidad}`,
        costo_total: Math.round(costoTotal),
        responsable: req.user!.email,
        observacion: observacion || null,
      });
    }

    res.json({
      ok: true,
      recetas_procesadas: recetaEntries.length,
      cortos_procesados: cortoEntries.length,
      fecha,
      turno,
    });
  })
);

// ============================================================================
// MAESTRO INDEPENDIENTE DE CONTROL DE VASOS
// ============================================================================

app.post(
  '/api/vasos',
  auth,
  adminOnly,
  wrap(async (req, res) => {
    const b = req.body || {};
    const codigo = String(b.codigo || '').trim().toUpperCase();
    const nombre = String(b.nombre || '').trim();
    const capacidadMl = npos(b.capacidad_ml ?? 350);
    const stockInicial = nnonneg(b.stock_inicial ?? 0);
    const stockMinimo = nnonneg(b.stock_minimo ?? 12);
    const costoReposicion = nnonneg(b.costo_reposicion ?? 0);

    if (!codigo || !nombre || !capacidadMl || stockInicial === null || stockMinimo === null || costoReposicion === null) {
      return res.status(400).json({ error: 'Verifica los datos del vaso/cristalería' });
    }

    const v = await repo.insertVaso({
      empresa_id: EMPRESA_ID,
      codigo,
      nombre,
      capacidad_ml: capacidadMl,
      stock_inicial: stockInicial,
      stock_disponible: stockInicial,
      stock_minimo: stockMinimo,
      roturas_acumuladas: 0,
      costo_reposicion: costoReposicion,
      activo: true,
    });

    if (stockInicial > 0) {
      await repo.insertVasoMovimiento({
        empresa_id: EMPRESA_ID,
        vaso_id: v.id,
        fecha: nowISO(),
        turno: 'AM',
        tipo: 'Stock Inicial',
        cantidad: stockInicial,
        motivo: 'Stock inicial de cristalería en sistema',
        responsable: req.user!.email,
      });
    }

    res.json({ ok: true, id: v.id });
  })
);

app.patch(
  '/api/vasos/:id',
  auth,
  adminOnly,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID inválido' });
    const b = req.body || {};
    const nombre = String(b.nombre || '').trim();
    const capacidadMl = npos(b.capacidad_ml ?? 350);
    const stockMinimo = nnonneg(b.stock_minimo ?? 12);
    const costoReposicion = nnonneg(b.costo_reposicion ?? 0);
    if (!nombre || !capacidadMl || stockMinimo === null || costoReposicion === null) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }
    const ok = await repo.updateVaso(id, EMPRESA_ID, {
      nombre,
      capacidad_ml: capacidadMl,
      stock_minimo: stockMinimo,
      costo_reposicion: costoReposicion,
    });
    if (!ok) return res.status(404).json({ error: 'Vaso no encontrado' });
    res.json({ ok: true });
  })
);

app.post(
  '/api/vasos/:id/movimiento',
  auth,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const tipo = String(req.body?.tipo || 'Rotura'); // 'Compra / Ingreso' | 'Rotura' | 'Pérdida Evento' | 'Ajuste'
    const cantidad = npos(req.body?.cantidad);
    const turnoRaw = String(req.body?.turno || 'PM').trim().toUpperCase();
    const motivo = String(req.body?.motivo || '').slice(0, 180);

    if (!Number.isInteger(id) || id < 1 || !cantidad || !VALID_TURNOS.includes(turnoRaw as 'AM' | 'PM')) {
      return res.status(400).json({ error: 'Datos inválidos (cantidad > 0 y turno AM/PM)' });
    }
    if (!['Compra / Ingreso', 'Rotura', 'Pérdida Evento', 'Ajuste'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo de movimiento inválido' });
    }
    if (tipo === 'Compra / Ingreso' && req.user!.rol !== 'Gerencia') {
      return res.status(403).json({ error: 'Solo Gerencia puede registrar compras de cristalería' });
    }

    const vaso = await repo.findVasoById(EMPRESA_ID, id);
    if (!vaso) return res.status(404).json({ error: 'Tipo de vaso no encontrado' });

    let nuevoDisponible = vaso.stock_disponible;
    let nuevasRoturas = vaso.roturas_acumuladas;

    if (tipo === 'Compra / Ingreso') {
      nuevoDisponible = Math.round((vaso.stock_disponible + cantidad) * 1000) / 1000;
    } else {
      if (vaso.stock_disponible < cantidad) {
        return res.status(409).json({
          error: `Stock disponible insuficiente (${vaso.stock_disponible} unidades)`,
        });
      }
      nuevoDisponible = Math.round((vaso.stock_disponible - cantidad) * 1000) / 1000;
      if (tipo === 'Rotura' || tipo === 'Pérdida Evento') {
        nuevasRoturas = Math.round((vaso.roturas_acumuladas + cantidad) * 1000) / 1000;
      }
    }

    await repo.updateVaso(id, EMPRESA_ID, {
      stock_disponible: nuevoDisponible,
      roturas_acumuladas: nuevasRoturas,
    });

    await repo.insertVasoMovimiento({
      empresa_id: EMPRESA_ID,
      vaso_id: id,
      fecha: nowISO(),
      turno: turnoRaw as 'AM' | 'PM',
      tipo,
      cantidad,
      motivo: motivo || tipo,
      responsable: req.user!.email,
    });

    res.json({ ok: true, stock_disponible: nuevoDisponible });
  })
);

// ============================================================================
// REPORTE GERENCIAL EXCEL MULTI-HOJA
// ============================================================================

app.get(
  '/api/exportar/reporte-gerencial.xlsx',
  auth,
  adminOnly,
  wrap(async (_req, res) => {
    const estado = await buildEstado(true);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'BarFlow Gerencia';

    const styleHeader = (sheet: ExcelJS.Worksheet, cols: number) => {
      const row = sheet.getRow(1);
      row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(2, sheet.rowCount), column: cols },
      };
    };

    const s1 = wb.addWorksheet('Stock_Valorizado', { views: [{ state: 'frozen', ySplit: 1 }] });
    s1.columns = [
      { key: 'codigo', header: 'Código', width: 14 },
      { key: 'nombre', header: 'Producto', width: 36 },
      { key: 'categoria', header: 'Categoría', width: 18 },
      { key: 'unidad', header: 'Unidad', width: 12 },
      { key: 'stock_ini', header: 'Stock Inicial Sist.', width: 17 },
      { key: 'bar', header: 'Stock Barra', width: 14 },
      { key: 'central', header: 'Stock Central', width: 15 },
      { key: 'minimo', header: 'Mínimo Barra', width: 14 },
      { key: 'costo', header: 'Costo Ref. ($)', width: 15 },
      { key: 'valor_bar', header: 'Valor Barra ($)', width: 17 },
      { key: 'valor_central', header: 'Valor Central ($)', width: 18 },
      { key: 'estado', header: 'Estado Barra', width: 16 },
    ];
    for (const p of estado.productos) {
      const pp = p as typeof p & { costo_referencia?: number; valor_bar?: number; valor_central?: number };
      s1.addRow({
        codigo: pp.codigo,
        nombre: pp.nombre,
        categoria: pp.categoria,
        unidad: pp.unidad,
        stock_ini: pp.stock_inicial_sistema,
        bar: pp.bar,
        central: pp.central,
        minimo: pp.stock_minimo,
        costo: pp.costo_referencia || 0,
        valor_bar: pp.valor_bar || 0,
        valor_central: pp.valor_central || 0,
        estado: pp.bar <= 0 ? 'SIN STOCK' : pp.bar < pp.stock_minimo ? 'BAJO MÍNIMO' : 'OK',
      });
    }
    styleHeader(s1, 12);

    const s2 = wb.addWorksheet('Comparativa_Cierres_AM_PM', { views: [{ state: 'frozen', ySplit: 1 }] });
    s2.columns = [
      { key: 'fecha', header: 'Fecha', width: 14 },
      { key: 'turno', header: 'Turno', width: 10 },
      { key: 'codigo', header: 'Código', width: 13 },
      { key: 'producto', header: 'Producto', width: 34 },
      { key: 'inicio', header: 'Stock Inicio', width: 14 },
      { key: 'ingresos', header: 'Ingresos', width: 12 },
      { key: 'mermas', header: 'Mermas', width: 12 },
      { key: 'teorico', header: 'Teórico Esperado', width: 17 },
      { key: 'cierre', header: 'Cierre Manual', width: 15 },
      { key: 'diferencia', header: 'Dif. Comparativa', width: 17 },
      { key: 'dif_valor', header: 'Impacto ($)', width: 15 },
      { key: 'responsable', header: 'Responsable', width: 26 },
    ];
    for (const c of estado.cierres) {
      const cc = c as typeof c & { diferencia_valor?: number };
      s2.addRow({
        fecha: cc.fecha,
        turno: cc.turno,
        codigo: cc.codigo,
        producto: cc.producto,
        inicio: cc.stock_inicio,
        ingresos: cc.ingresos,
        mermas: cc.mermas,
        teorico: cc.stock_teorico_esperado,
        cierre: cc.stock_cierre,
        diferencia: cc.diferencia_comparativa,
        dif_valor: cc.diferencia_valor || 0,
        responsable: cc.responsable,
      });
    }
    styleHeader(s2, 12);

    const s3 = wb.addWorksheet('Costeo_Cocteles', { views: [{ state: 'frozen', ySplit: 1 }] });
    s3.columns = [
      { key: 'codigo', header: 'Código', width: 12 },
      { key: 'nombre', header: 'Cóctel / Trago', width: 30 },
      { key: 'categoria', header: 'Categoría', width: 20 },
      { key: 'ingredientes', header: 'Composición', width: 45 },
      { key: 'costo', header: 'Costo Receta ($)', width: 16 },
      { key: 'precio', header: 'Precio Venta ($)', width: 16 },
      { key: 'margen', header: 'Margen Bruto ($)', width: 16 },
      { key: 'pct', header: 'Margen (%)', width: 14 },
    ];
    for (const r of estado.recetas) {
      const rr = r as typeof r & { costo_total?: number; precio_venta?: number; margen_bruto?: number; margen_pct?: number };
      s3.addRow({
        codigo: rr.codigo,
        nombre: rr.nombre,
        categoria: rr.categoria,
        ingredientes: rr.ingredientes.map((i) => `${i.cantidad_ml_o_unidad}${i.unidad_medida} ${i.producto_nombre}`).join(' + '),
        costo: rr.costo_total || 0,
        precio: rr.precio_venta || 0,
        margen: rr.margen_bruto || 0,
        pct: rr.margen_pct || 0,
      });
    }
    styleHeader(s3, 8);

    const s4 = wb.addWorksheet('Insumos_y_Proveedores', { views: [{ state: 'frozen', ySplit: 1 }] });
    s4.columns = [
      { key: 'codigo', header: 'Código', width: 12 },
      { key: 'nombre', header: 'Insumo', width: 34 },
      { key: 'unidad', header: 'Unidad', width: 12 },
      { key: 'stock', header: 'Stock Actual', width: 14 },
      { key: 'minimo', header: 'Stock Mínimo', width: 14 },
      { key: 'costo', header: 'Costo Unit. ($)', width: 15 },
      { key: 'proveedor', header: 'Proveedor Asignado', width: 30 },
      { key: 'wsp', header: 'WhatsApp', width: 18 },
    ];
    for (const i of estado.insumos) {
      const ii = i as typeof i & { costo_unitario?: number };
      s4.addRow({
        codigo: ii.codigo,
        nombre: ii.nombre,
        unidad: ii.unidad,
        stock: ii.stock_actual,
        minimo: ii.stock_minimo,
        costo: ii.costo_unitario || 0,
        proveedor: ii.proveedor_nombre || 'Sin asignar',
        wsp: ii.proveedor_wsp || '',
      });
    }
    styleHeader(s4, 8);

    const s5 = wb.addWorksheet('Control_Vasos', { views: [{ state: 'frozen', ySplit: 1 }] });
    s5.columns = [
      { key: 'codigo', header: 'Código', width: 12 },
      { key: 'nombre', header: 'Tipo de Vaso / Copa', width: 32 },
      { key: 'cap', header: 'Capacidad (ml)', width: 15 },
      { key: 'inicial', header: 'Stock Inicial', width: 14 },
      { key: 'disponible', header: 'Stock Disponible', width: 16 },
      { key: 'roturas', header: 'Roturas Acum.', width: 15 },
      { key: 'minimo', header: 'Mínimo', width: 12 },
      { key: 'costo', header: 'Costo Reposición ($)', width: 18 },
    ];
    for (const v of estado.vasos) {
      const vv = v as typeof v & { costo_reposicion?: number };
      s5.addRow({
        codigo: vv.codigo,
        nombre: vv.nombre,
        cap: vv.capacidad_ml,
        inicial: vv.stock_inicial,
        disponible: vv.stock_disponible,
        roturas: vv.roturas_acumuladas,
        minimo: vv.stock_minimo,
        costo: vv.costo_reposicion || 0,
      });
    }
    styleHeader(s5, 8);

    const s6 = wb.addWorksheet('Auditoria_Movimientos', { views: [{ state: 'frozen', ySplit: 1 }] });
    s6.columns = [
      { key: 'fecha', header: 'Fecha / Hora', width: 21 },
      { key: 'tipo', header: 'Tipo Evento', width: 18 },
      { key: 'codigo', header: 'Código', width: 13 },
      { key: 'producto', header: 'Producto', width: 34 },
      { key: 'bodega', header: 'Bodega', width: 18 },
      { key: 'cantidad', header: 'Cantidad', width: 12 },
      { key: 'costo', header: 'Costo Unit. ($)', width: 15 },
      { key: 'motivo', header: 'Detalle / Auditoría', width: 38 },
      { key: 'responsable', header: 'Responsable', width: 28 },
    ];
    for (const m of estado.movimientos) {
      const mm = m as typeof m & { costo_unitario?: number };
      s6.addRow({
        fecha: mm.fecha,
        tipo: mm.tipo,
        codigo: mm.codigo,
        producto: mm.producto,
        bodega: mm.bodega,
        cantidad: mm.cantidad,
        costo: mm.costo_unitario || 0,
        motivo: mm.motivo || '',
        responsable: mm.responsable,
      });
    }
    styleHeader(s6, 9);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Reporte_Gerencial_Bar_${todayDate()}.xlsx"`);
    const buf = await wb.xlsx.writeBuffer();
    res.end(Buffer.from(buf));
  })
);

async function startServer() {
  await repo.initAndSeed(EMPRESA_ID, ADMIN_EMAIL, BAR_EMAIL);

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BarFlow servidor activo en http://localhost:${PORT} [${repo.mode}]`);
  });
}

startServer().catch((err) => {
  console.error('Error iniciando servidor:', err);
  process.exit(1);
});
