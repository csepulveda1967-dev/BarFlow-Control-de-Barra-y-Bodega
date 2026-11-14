import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Boxes,
  ClipboardList,
  Download,
  FolderArchive,
  GlassWater,
  Loader2,
  Lock,
  LogOut,
  Martini,
  Menu,
  Package,
  Send,
  ShieldCheck,
  Truck,
  Users,
  Wine,
  X,
} from 'lucide-react';
import type { AuthSession, EstadoApp, Producto } from './types';
import {
  ApiError,
  apiRequest,
  clearStoredSession,
  downloadExcelReport,
  downloadProjectZipBackup,
  fetchEstado,
  getStoredSession,
  saveStoredSession,
} from './lib/api';
import { LoginView } from './components/LoginView';
import { InventarioView } from './components/InventarioView';
import { TurnoDiarioView } from './components/TurnoDiarioView';
import { SolicitudPedidosView } from './components/SolicitudPedidosView';
import { RecepcionBodegaView } from './components/RecepcionBodegaView';
import { CoctelesView } from './components/CoctelesView';
import { VasosView } from './components/VasosView';
import { ProveedoresView } from './components/ProveedoresView';
import { InsumosView } from './components/InsumosView';
import { GerenciaView } from './components/GerenciaView';

type SectionId =
  | 'inventario'
  | 'turno'
  | 'solicitudes'
  | 'recepcion'
  | 'cocteles'
  | 'vasos'
  | 'insumos'
  | 'proveedores'
  | 'gerencia';

const ADMIN_LOCK_KEY = 'barflow_admin_locked_v1';

function readStoredAdminLock(activeSession: AuthSession | null): boolean {
  if (!activeSession || activeSession.rol !== 'Gerencia') return false;
  try {
    return sessionStorage.getItem(ADMIN_LOCK_KEY) === activeSession.email;
  } catch {
    return false;
  }
}

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(() => getStoredSession());
  const [estado, setEstado] = useState<EstadoApp | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(session));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [section, setSection] = useState<SectionId>(() =>
    getStoredSession()?.rol === 'Gerencia' ? 'gerencia' : 'inventario'
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [adminLocked, setAdminLocked] = useState<boolean>(() => readStoredAdminLock(getStoredSession()));
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);

  const [selectedForSalida, setSelectedForSalida] = useState<Producto | null>(null);
  const [selectedForPedido, setSelectedForPedido] = useState<Producto | null>(null);

  const [toast, setToast] = useState<{ msg: string; isError?: boolean } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const notify = useCallback((msg: string, isError = false) => {
    setToast({ msg, isError });
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3800);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const loadData = useCallback(
    async (activeSession: AuthSession) => {
      setLoadError(null);
      try {
        const data = await fetchEstado(activeSession.token);
        setEstado(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error cargando datos';
        const isAuthFailure =
          (err instanceof ApiError && err.status === 401) ||
          message.toLowerCase().includes('sesión') ||
          message.toLowerCase().includes('expirada');
        if (isAuthFailure) {
          clearStoredSession();
          setSession(null);
          setEstado(null);
          setLoadError(null);
        } else {
          setLoadError(message);
          notify(message, true);
        }
      } finally {
        setLoading(false);
      }
    },
    [notify]
  );

  useEffect(() => {
    if (session) {
      setLoading(true);
      loadData(session);
    }
  }, [session, loadData]);

  const handleLoginSuccess = (newSession: AuthSession) => {
    try {
      sessionStorage.removeItem(ADMIN_LOCK_KEY);
    } catch {
      // ignore storage errors
    }
    saveStoredSession(newSession);
    setLoadError(null);
    setAdminLocked(false);
    setUnlockPassword('');
    setUnlockError(null);
    setSession(newSession);
    setSection(newSession.rol === 'Gerencia' ? 'gerencia' : 'inventario');
  };

  const handleLogout = () => {
    const baseUrl = import.meta.env.BASE_URL || '/';
    const modulo = session?.rol === 'Gerencia' ? 'gerencia' : 'barra';
    const logoutPath = baseUrl !== '/' ? `${baseUrl}?modulo=${modulo}` : `/${modulo}`;
    try {
      sessionStorage.removeItem(ADMIN_LOCK_KEY);
    } catch {
      // ignore storage errors
    }
    clearStoredSession();
    setSession(null);
    setEstado(null);
    setLoadError(null);
    setAdminLocked(false);
    setUnlockPassword('');
    setUnlockError(null);
    setMobileMenuOpen(false);
    window.history.replaceState(null, '', logoutPath);
  };

  const handleLockAdmin = () => {
    if (!session || session.rol !== 'Gerencia') return;
    try {
      sessionStorage.setItem(ADMIN_LOCK_KEY, session.email);
    } catch {
      // ignore storage errors
    }
    setAdminLocked(true);
    setMobileMenuOpen(false);
    setUnlockPassword('');
    setUnlockError(null);
  };

  const handleUnlockAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    if (!unlockPassword) {
      setUnlockError('Ingresa la contraseña de Administrador');
      return;
    }
    setUnlocking(true);
    setUnlockError(null);
    try {
      const verified = await apiRequest<AuthSession>('/login', {
        method: 'POST',
        body: {
          email: session.email,
          password: unlockPassword,
          modulo: 'gerencia',
        },
      });
      saveStoredSession(verified);
      setSession(verified);
      try {
        sessionStorage.removeItem(ADMIN_LOCK_KEY);
      } catch {
        // ignore storage errors
      }
      setAdminLocked(false);
      setUnlockPassword('');
      notify('Modo Administrador desbloqueado');
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : 'Contraseña incorrecta');
    } finally {
      setUnlocking(false);
    }
  };

  const handleDownloadProjectZip = async () => {
    if (!session || downloadingZip) return;
    setDownloadingZip(true);
    try {
      await downloadProjectZipBackup(session.token);
      notify('Respaldo completo (.zip) descargado en tu PC');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo generar el respaldo ZIP', true);
    } finally {
      setDownloadingZip(false);
    }
  };

  const handleRefresh = async () => {
    if (!session) return;
    setLoading(true);
    await loadData(session);
  };

  if (!session) {
    return <LoginView onSuccess={handleLoginSuccess} />;
  }

  const isGerencia = session.rol === 'Gerencia';

  if (isGerencia && adminLocked) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-slate-900">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                Modo Administrador Bloqueado
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Pantalla protegida con candado. Ingresa la clave de Gerencia para continuar operando.
              </p>
            </div>
          </div>

          <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <p className="text-[11px] font-medium text-slate-500">Cuenta bloqueada</p>
            <p className="text-sm font-mono font-medium text-slate-900 truncate mt-0.5">{session.email}</p>
          </div>

          <form onSubmit={handleUnlockAdmin} className="space-y-4">
            <div>
              <label htmlFor="admin-unlock-password" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Contraseña de Gerencia
              </label>
              <input
                id="admin-unlock-password"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={unlockPassword}
                onChange={(e) => {
                  setUnlockPassword(e.target.value);
                  if (unlockError) setUnlockError(null);
                }}
                placeholder="Ingresa tu contraseña"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
              />
            </div>

            {unlockError && (
              <p role="alert" className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {unlockError}
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button
                type="submit"
                disabled={unlocking}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                {unlocking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                <span>{unlocking ? 'Verificando...' : 'Desbloquear Gerencia'}</span>
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const activeSection: SectionId =
    !isGerencia && (section === 'proveedores' || section === 'gerencia') ? 'inventario' : section;

  const navItems: Array<{
    id: SectionId;
    label: string;
    icon: React.ReactNode;
    badgeCount?: number;
  }> = [
    {
      id: 'inventario',
      label: isGerencia ? 'Inventario Barra' : 'Inventario y Alertas',
      icon: <Package className="w-4 h-4 shrink-0" />,
      badgeCount: estado?.kpis.alertasMinimo || undefined,
    },
    {
      id: 'turno',
      label: 'Cierre Turno (AM/PM)',
      icon: <ClipboardList className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'solicitudes',
      label: 'Solicitud de Pedidos',
      icon: <Send className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'recepcion',
      label: 'Recepción Bodega',
      icon: <Truck className="w-4 h-4 shrink-0" />,
      badgeCount: estado?.kpis.porRecibirBar || undefined,
    },
    {
      id: 'cocteles',
      label: isGerencia ? 'Cócteles y Costeo' : 'Cócteles / Descuento',
      icon: <Martini className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'vasos',
      label: 'Control de Vasos',
      icon: <GlassWater className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'insumos',
      label: 'Insumos y Solicitudes',
      icon: <Boxes className="w-4 h-4 shrink-0" />,
      badgeCount: estado?.kpis.insumosBajoMinimo || undefined,
    },
    ...(isGerencia
      ? [
          {
            id: 'proveedores' as const,
            label: 'Proveedores (WSP)',
            icon: <Users className="w-4 h-4 shrink-0" />,
          },
          {
            id: 'gerencia' as const,
            label: 'Gerencia y Carga',
            icon: <ShieldCheck className="w-4 h-4 shrink-0" />,
            badgeCount: estado?.kpis.solicitudesPendientes || undefined,
          },
        ]
      : []),
  ];

  const sectionTitles: Record<SectionId, string> = {
    inventario: isGerencia ? 'Inventario de Barra Principal' : 'Inventario de Barra y Alertas de Stock',
    turno: 'Cierre Manual de Turno (AM / PM) y Salidas FEFO',
    solicitudes: 'Solicitud de Pedidos a Bodega Central',
    recepcion: 'Recepción de Despachos desde Bodega',
    cocteles: isGerencia ? 'Ficha de Costeo de Cócteles y Descuentos' : 'Recetas de Barra y Descuento de Stock',
    vasos: 'Maestro Independiente de Control de Vasos',
    insumos: 'Insumos, Categorías y Solicitudes a Proveedores',
    proveedores: 'Proveedores y Pedidos Directos por WhatsApp',
    gerencia: 'Gerencia, Carga Masiva, Comparativa y Auditoría',
  };

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-white border-r border-slate-200 shrink-0">
        <div className="h-16 px-6 flex items-center gap-2.5 border-b border-slate-200">
          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
            <Wine className="w-4 h-4" />
          </div>
          <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            BarFlow
          </span>
        </div>

        <nav className="flex-1 p-3.5 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSection(item.id);
                  setSelectedForSalida(null);
                  setSelectedForPedido(null);
                }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badgeCount !== undefined && item.badgeCount > 0 && (
                  <span
                    className={`font-mono tabular-nums text-xs font-semibold ${
                      active ? 'text-slate-300' : 'text-amber-700'
                    }`}
                  >
                    {item.badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div>
            <p className="text-xs font-semibold text-slate-900 truncate">{session.nombre}</p>
            <p className="text-xs text-slate-500 truncate">{session.email}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-full bg-white h-full flex flex-col border-r border-slate-200 z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
              <span className="text-base font-bold text-slate-900">BarFlow</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-600 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSection(item.id);
                    setSelectedForSalida(null);
                    setSelectedForPedido(null);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${
                    activeSection === item.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
                  {item.badgeCount !== undefined && item.badgeCount > 0 && (
                    <span className="font-mono tabular-nums text-xs">{item.badgeCount}</span>
                  )}
                </button>
              ))}
            </nav>
            <div className="p-4 border-t border-slate-200 space-y-2">
              <p className="text-xs font-semibold text-slate-900 truncate">{session.nombre}</p>
              <p className="text-xs text-slate-500 truncate mb-2">{session.email}</p>
              {isGerencia && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={downloadingZip}
                    onClick={handleDownloadProjectZip}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 rounded-lg cursor-pointer"
                  >
                    {downloadingZip ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FolderArchive className="w-3.5 h-3.5" />
                    )}
                    <span>Respaldo ZIP</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLockAdmin}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded-lg cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Candado</span>
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="w-full py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Cerrar Sesión
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menú"
              className="lg:hidden p-2 -ml-2 text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate">
              {sectionTitles[activeSection]}
            </h1>
          </div>

          <div className="hidden xl:flex items-center gap-4 text-xs text-slate-500 whitespace-nowrap shrink-0">
            <span>Control Comercial de Barra</span>
            <span aria-hidden="true">·</span>
            <span>Rol: {session.rol}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isGerencia ? (
              <>
                <button
                  type="button"
                  disabled={downloadingZip}
                  onClick={handleDownloadProjectZip}
                  title="Descargar proyecto completo y respaldo de datos en ZIP"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white hover:bg-slate-100 disabled:opacity-60 text-slate-800 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {downloadingZip ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FolderArchive className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">
                    {downloadingZip ? 'Empaquetando...' : 'Respaldo ZIP'}
                  </span>
                  <span className="sm:hidden">ZIP</span>
                </button>
                <button
                  type="button"
                  onClick={handleLockAdmin}
                  title="Bloquear aplicación en modo Administrador con candado"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Candado Adm.</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadExcelReport(session.token).catch((e) =>
                      notify(e instanceof Error ? e.message : 'Error descargando Excel', true)
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Exportar Excel</span>
                  <span className="sm:hidden">Excel</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setSection('turno')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>Cierre AM/PM</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {loadError && !estado ? (
            <div className="bg-white border border-rose-200 rounded-xl p-6 max-w-lg mx-auto my-8 space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">No se pudo cargar el estado de Barra</h2>
                <p className="text-sm text-rose-700 mt-1">{loadError}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg cursor-pointer"
                >
                  Reintentar
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-4 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer"
                >
                  Cerrar Sesión
                </button>
              </div>
            </div>
          ) : loading || !estado ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
                ))}
              </div>
              <div className="h-80 bg-white border border-slate-200 rounded-xl animate-pulse" />
            </div>
          ) : (
            <>
              {activeSection === 'inventario' && (
                <InventarioView
                  estado={estado}
                  onQuickSalida={(p) => {
                    setSelectedForSalida(p);
                    setSection('turno');
                  }}
                  onQuickSolicitar={(p) => {
                    setSelectedForPedido(p);
                    setSection('solicitudes');
                  }}
                />
              )}

              {activeSection === 'turno' && (
                <TurnoDiarioView
                  token={session.token}
                  estado={estado}
                  preselectedProducto={selectedForSalida}
                  onRefresh={handleRefresh}
                  onNotify={notify}
                />
              )}

              {activeSection === 'solicitudes' && (
                <SolicitudPedidosView
                  token={session.token}
                  estado={estado}
                  preselectedProducto={selectedForPedido}
                  onRefresh={handleRefresh}
                  onNotify={notify}
                />
              )}

              {activeSection === 'recepcion' && (
                <RecepcionBodegaView
                  token={session.token}
                  estado={estado}
                  onRefresh={handleRefresh}
                  onNotify={notify}
                />
              )}

              {activeSection === 'cocteles' && (
                <CoctelesView
                  token={session.token}
                  estado={estado}
                  onRefresh={handleRefresh}
                  onNotify={notify}
                />
              )}

              {activeSection === 'vasos' && (
                <VasosView
                  token={session.token}
                  estado={estado}
                  onRefresh={handleRefresh}
                  onNotify={notify}
                />
              )}

              {activeSection === 'insumos' && (
                <InsumosView
                  token={session.token}
                  estado={estado}
                  onRefresh={handleRefresh}
                  onNotify={notify}
                />
              )}

              {activeSection === 'proveedores' && isGerencia && (
                <ProveedoresView
                  token={session.token}
                  estado={estado}
                  onRefresh={handleRefresh}
                  onNotify={notify}
                />
              )}

              {activeSection === 'gerencia' && isGerencia && (
                <GerenciaView
                  token={session.token}
                  estado={estado}
                  onRefresh={handleRefresh}
                  onNotify={notify}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Toast Feedback */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-lg text-sm font-medium border shadow-sm ${
            toast.isError
              ? 'bg-rose-900 text-white border-rose-800'
              : 'bg-slate-900 text-white border-slate-800'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
