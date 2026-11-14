import type { AuthSession, EstadoApp } from '../types';
import { ApiError } from './apiError';
import {
  browserDownloadExcelReport,
  browserDownloadImportTemplate,
  browserDownloadProjectZip,
  handleBrowserApiRequest,
  signOutBrowserClient,
} from './browserClient';

export { ApiError };

const SESSION_KEY = 'barflow_session_v1';
const API_BASE = String((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE || '').replace(/\/$/, '');

let backendAvailablePromise: Promise<boolean> | null = null;

async function hasBackendServer(): Promise<boolean> {
  if (API_BASE) return true;
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('.github.io')) {
    return false;
  }
  if (!backendAvailablePromise) {
    backendAvailablePromise = (async () => {
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 1800) : null;
        const res = await fetch('/api/health', {
          cache: 'no-store',
          signal: controller?.signal,
        });
        if (timer) clearTimeout(timer);
        if (!res.ok) return false;
        const ct = res.headers.get('content-type') || '';
        if (!ct.toLowerCase().includes('application/json')) return false;
        const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
        return Boolean(data?.ok);
      } catch {
        return false;
      }
    })();
  }
  return backendAvailablePromise;
}

export function getStoredSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthSession> | null;
    if (
      !parsed ||
      typeof parsed.token !== 'string' ||
      !parsed.token ||
      (parsed.rol !== 'Gerencia' && parsed.rol !== 'Bar') ||
      typeof parsed.email !== 'string'
    ) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return {
      token: parsed.token,
      rol: parsed.rol,
      email: parsed.email,
      nombre: typeof parsed.nombre === 'string' && parsed.nombre ? parsed.nombre : parsed.rol,
    };
  } catch {
    return null;
  }
}

export function saveStoredSession(session: AuthSession): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearStoredSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  void signOutBrowserClient();
}

export async function apiRequest<T>(
  route: string,
  options: { method?: string; body?: unknown; token?: string } = {}
): Promise<T> {
  const backendAvailable = await hasBackendServer();
  if (!backendAvailable || options.token?.startsWith('local:')) {
    return handleBrowserApiRequest<T>(route, options);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const res = await fetch(`${API_BASE}/api${route}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || 'Error de comunicación con el servidor', res.status);
  }
  return data as T;
}

export async function fetchEstado(token: string): Promise<EstadoApp> {
  return apiRequest<EstadoApp>('/estado', { token });
}

export async function downloadExcelReport(token: string): Promise<void> {
  const backendAvailable = await hasBackendServer();
  if (!backendAvailable || token.startsWith('local:')) {
    await browserDownloadExcelReport(token);
    return;
  }

  const res = await fetch(`${API_BASE}/api/exportar/reporte-gerencial.xlsx`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'No se pudo generar el reporte Excel');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Reporte_Gerencial_Bar_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function downloadImportTemplate(token: string): Promise<void> {
  const backendAvailable = await hasBackendServer();
  if (!backendAvailable || token.startsWith('local:')) {
    await browserDownloadImportTemplate(token);
    return;
  }

  const res = await fetch(`${API_BASE}/api/productos/plantilla.xlsx`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'No se pudo descargar la plantilla Excel');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Plantilla_Carga_Productos_BarFlow.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function downloadProjectZipBackup(token: string): Promise<void> {
  const backendAvailable = await hasBackendServer();
  if (!backendAvailable || token.startsWith('local:')) {
    await browserDownloadProjectZip(token);
    return;
  }

  const res = await fetch(`${API_BASE}/api/respaldo/proyecto.zip`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(err.error || 'No se pudo generar el respaldo ZIP del proyecto', res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BarFlow_Proyecto_Completo_${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const cleanDigits = String(phone || '').replace(/[^\d]/g, '');
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${cleanDigits}?text=${encoded}`;
}

export function fmtQty(val: number | null | undefined): string {
  return Number(val || 0).toLocaleString('es-CL', { maximumFractionDigits: 3 });
}

export function fmtCLP(val: number | null | undefined): string {
  return '$' + Math.round(Number(val || 0)).toLocaleString('es-CL');
}
