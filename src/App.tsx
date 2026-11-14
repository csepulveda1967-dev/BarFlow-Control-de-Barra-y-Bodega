import React, { useCallback, useEffect, useState } from 'react';
import {
  Boxes,
  ClipboardList,
  Download,
  GlassWater,
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
  clearStoredSession,
  downloadExcelReport,
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

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(() => getStoredSession());
  const [estado, setEstado] = useState<EstadoApp | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(session));
  const [section, setSection] = useState<SectionId>(() =>
    getStoredSession()?.rol === 'Gerencia' ? 'gerencia' : 'inventario'
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [selectedForSalida, setSelectedForSalida] = useState<Producto | null>(null);
  const [selectedForPedido, setSelectedForPedido] = useState<Producto | null>(null);

  const [toast, setToast] = useState<{ msg: string; isError?: boolean } | null>(null);

  const notify = useCallback((msg: string, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => {
      setToast((curr) => (curr?.msg === msg ? null : curr));
    }, 3800);
  }, []);

  const loadData = useCallback(
    async (activeSession: AuthSession) => {
      try {
        const data = await fetchEstado(activeSession.token);
        setEstado(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error cargando datos';
        if (message.toLowerCase().includes('sesión') || message.toLowerCase().includes('expirada')) {
          clearStoredSession();
          setSession(null);
          setEstado(null);
        } else {
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
    saveStoredSession(newSession);
    setSession(newSession);
    setSection(newSession.rol === 'Gerencia' ? 'gerencia' : 'inventario');
  };

  const handleLogout = () => {
    const logoutPath = session?.rol === 'Gerencia' ? '/gerencia' : '/barra';
    clearStoredSession();
    setSession(null);
    setEstado(null);
    setMobileMenuOpen(false);
    window.history.replaceState(null, '', logoutPath);
  };

  const handleRefresh = async () => {
    if (!session) return;
    await loadData(session);
  };

  if (!session) {
    return <LoginView onSuccess={handleLoginSuccess} />;
  }

  const isGerencia = session.rol === 'Gerencia';

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
      label: 'Maestro Insumos',
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
    insumos: 'Maestro de Insumos con Ficha de Proveedores',
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
            const active = section === item.id;
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
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${
                    section === item.id
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
            <div className="p-4 border-t border-slate-200">
              <p className="text-xs font-semibold text-slate-900 truncate">{session.nombre}</p>
              <p className="text-xs text-slate-500 truncate mb-3">{session.email}</p>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg"
              >
                Cerrar Sesión
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-6 shrink-0">
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
              {sectionTitles[section]}
            </h1>
          </div>

          <div className="hidden md:flex items-center gap-4 text-xs text-slate-500 whitespace-nowrap shrink-0">
            <span>Control Comercial de Barra</span>
            <span aria-hidden="true">·</span>
            <span>Rol: {session.rol}</span>
          </div>

          <div className="shrink-0">
            {isGerencia ? (
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
                <span>Exportar Excel</span>
              </button>
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
          {loading || !estado ? (
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
              {section === 'inventario' && (
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

              {section === 'turno' && (
                <TurnoDiarioView
                  token={session.token}
                  estado={estado}
                  preselectedProducto={selectedForSalida}
                  onRefresh={handleRefresh}
                  onNotify={notify}
                />
              )}

              {section === 'solicitudes' && (
                <SolicitudPedidosView
                  token={session.token}
                  estado={estado}
                  preselectedProducto={selectedForPedido}
                  onRefresh={handleRefresh}
                  onNotify={notify}
                />
              )}

              {section === 'recepcion' && (
                <RecepcionBodegaView
                  token={session.token}
                  estado={estado}
                  onRefresh={handleRefresh}
                  onNotify={notify}
                />
              )}

              {section === 'cocteles' && (
                <CoctelesView
                  token={session.token}
                  estado={estado}
                  onRefresh={handleRefresh}
                  onNotify={notify}
                />
              )}

              {section === 'vasos' && (
                <VasosView
                  token={session.token}
                  estado={estado}
                  onRefresh={handleRefresh}
                  onNotify={notify}
                />
              )}

              {section === 'insumos' && (
                <InsumosView
                  token={session.token}
                  estado={estado}
                  onRefresh={handleRefresh}
                  onNotify={notify}
                />
              )}

              {section === 'proveedores' && isGerencia && (
                <ProveedoresView
                  token={session.token}
                  estado={estado}
                  onRefresh={handleRefresh}
                  onNotify={notify}
                />
              )}

              {section === 'gerencia' && isGerencia && (
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
