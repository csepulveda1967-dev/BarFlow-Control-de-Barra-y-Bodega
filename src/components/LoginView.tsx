import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  KeyRound,
  Lock,
  ShieldCheck,
  Wine,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { AuthSession } from '../types';

type EntryPortal = 'portal' | 'barra' | 'gerencia';

interface LoginViewProps {
  onSuccess: (session: AuthSession) => void;
}

function getEntryFromLocation(): EntryPortal {
  if (typeof window === 'undefined') return 'portal';
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const mod = (params.get('modulo') || '').toLowerCase();

  if (
    path.includes('login_admin') ||
    path.includes('gerencia') ||
    path.includes('admin') ||
    mod === 'gerencia' ||
    mod === 'admin'
  ) {
    return 'gerencia';
  }
  if (
    path.includes('login_bar') ||
    path.includes('barra') ||
    path === '/bar' ||
    mod === 'barra' ||
    mod === 'bar'
  ) {
    return 'barra';
  }
  return 'portal';
}

export const LoginView: React.FC<LoginViewProps> = ({ onSuccess }) => {
  const [entry, setEntry] = useState<EntryPortal>(() => getEntryFromLocation());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onPopState = () => {
      setEntry(getEntryFromLocation());
      setError('');
      setEmail('');
      setPassword('');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateEntry = (next: EntryPortal) => {
    setEntry(next);
    setError('');
    setEmail('');
    setPassword('');
    const nextPath = next === 'portal' ? '/' : next === 'barra' ? '/barra' : '/gerencia';
    if (window.location.pathname !== nextPath || window.location.search) {
      window.history.pushState(null, '', nextPath);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (entry === 'portal') return;
    setError('');
    setLoading(true);
    try {
      const modulo = entry === 'gerencia' ? 'Gerencia' : 'Bar';
      const session = await apiRequest<AuthSession>('/login', {
        method: 'POST',
        body: { email, password, modulo },
      });
      onSuccess(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const fillModuleDemo = () => {
    setError('');
    if (entry === 'barra') {
      setEmail('csepulvedafuica@gmail.com');
      setPassword('123456');
    } else if (entry === 'gerencia') {
      setEmail('asesorconsultorcasf@yahoo.com');
      setPassword('123456');
    }
  };

  if (entry === 'portal') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 py-12">
        <div className="w-full max-w-3xl space-y-8">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-900 text-white mb-2">
              <Wine className="w-6 h-6" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              BarFlow — Portal de Acceso
            </h1>
            <p className="text-sm text-slate-600 max-w-xl mx-auto">
              Entradas independientes para operación diaria en barra y administración gerencial. Selecciona el módulo correspondiente a tu rol.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            {/* Entrada 1: Módulo de Barra */}
            <div className="bg-white border border-[#cce3f0] rounded-xl p-7 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="w-11 h-11 rounded-lg bg-[#eaf4fb] text-[#1b4f72] border border-[#cce3f0] flex items-center justify-center shrink-0">
                    <Wine className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-mono text-slate-500">/barra</span>
                </div>

                <div>
                  <h2 className="text-lg font-bold text-[#1b4f72]">Módulo de Barra</h2>
                  <p className="text-xs font-medium text-slate-500 mt-0.5">
                    Encargado de turno · Bartenders
                  </p>
                </div>

                <p className="text-sm text-slate-600 leading-relaxed">
                  Control de stock en barra, cierre manual de turno AM/PM, solicitud de pedidos a bodega, recepción de mercadería, cócteles y vasos.
                </p>
              </div>

              <div className="pt-6 mt-6 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => navigateEntry('barra')}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-[#1b4f72] hover:bg-[#2980b9] text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <span>Ingresar a Barra</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Entrada 2: Panel Gerencial */}
            <div className="bg-white border border-[#e8d5f0] rounded-xl p-7 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="w-11 h-11 rounded-lg bg-[#f5eef8] text-[#4a235a] border border-[#e8d5f0] flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-mono text-slate-500">/gerencia</span>
                </div>

                <div>
                  <h2 className="text-lg font-bold text-[#4a235a]">Panel Gerencial</h2>
                  <p className="text-xs font-medium text-slate-500 mt-0.5">
                    Administración · Auditoría y Costos
                  </p>
                </div>

                <p className="text-sm text-slate-600 leading-relaxed">
                  KPIs financieros, comparativa AM/PM, carga masiva de productos, maestro de stock inicial, proveedores WhatsApp, despachos FEFO y cuadratura.
                </p>
              </div>

              <div className="pt-6 mt-6 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => navigateEntry('gerencia')}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-[#4a235a] hover:bg-[#7d3c98] text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <span>Ingresar a Gerencia</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isGerenciaEntry = entry === 'gerencia';

  return (
    <div
      className={`min-h-screen flex flex-col justify-center items-center px-4 py-12 relative ${
        isGerenciaEntry ? 'bg-[#f5eef8]' : 'bg-[#eaf4fb]'
      }`}
    >
      <button
        type="button"
        onClick={() => navigateEntry('portal')}
        className={`absolute top-5 left-5 inline-flex items-center gap-1.5 text-xs font-semibold hover:underline cursor-pointer ${
          isGerenciaEntry ? 'text-[#4a235a]' : 'text-[#1b4f72]'
        }`}
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Portal principal</span>
      </button>

      <div
        className={`w-full max-w-md bg-white rounded-xl p-8 border ${
          isGerenciaEntry ? 'border-[#e8d5f0]' : 'border-[#cce3f0]'
        }`}
      >
        <div className="flex items-center gap-3 mb-5">
          <div
            className={`w-11 h-11 rounded-lg text-white flex items-center justify-center shrink-0 ${
              isGerenciaEntry ? 'bg-[#4a235a]' : 'bg-[#1b4f72]'
            }`}
          >
            {isGerenciaEntry ? <ShieldCheck className="w-5 h-5" /> : <Wine className="w-5 h-5" />}
          </div>
          <div>
            <h1
              className={`text-xl font-bold tracking-tight ${
                isGerenciaEntry ? 'text-[#4a235a]' : 'text-[#1b4f72]'
              }`}
            >
              {isGerenciaEntry ? 'Panel Gerencial' : 'Módulo de Barra'}
            </h1>
            <p className="text-xs text-slate-500">
              {isGerenciaEntry
                ? 'Acceso restringido a administración y auditoría'
                : 'Ingreso para encargados de turno y bartenders'}
            </p>
          </div>
        </div>

        <div
          className={`flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 mb-4 text-xs border ${
            isGerenciaEntry
              ? 'bg-[#f5eef8] border-[#e8d5f0] text-[#4a235a]'
              : 'bg-[#eaf4fb] border-[#cce3f0] text-[#1b4f72]'
          }`}
        >
          <KeyRound className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {isGerenciaEntry ? (
              <>
                <strong>Rol Administrador:</strong> KPIs, costos, auditoría completa y maestro de productos.
              </>
            ) : (
              <>
                <strong>Rol Operación:</strong> Apertura, cierre de turno AM/PM, pedidos y recepción de mercadería.
              </>
            )}
          </span>
        </div>

        {isGerenciaEntry && (
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2.5 mb-5 text-xs text-amber-900 font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
            <span>
              Este módulo contiene información financiera y de costos. Solo para personal autorizado.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Correo electrónico
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu-correo@dominio.com"
              className={`w-full px-3.5 py-2.5 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 ${
                isGerenciaEntry
                  ? 'border-[#e8d5f0] focus:ring-[#7d3c98] focus:border-[#7d3c98]'
                  : 'border-[#cce3f0] focus:ring-[#2980b9] focus:border-[#2980b9]'
              }`}
            />
          </div>

          <div>
            <label htmlFor="login-pass" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Contraseña
            </label>
            <input
              id="login-pass"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={`w-full px-3.5 py-2.5 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 ${
                isGerenciaEntry
                  ? 'border-[#e8d5f0] focus:ring-[#7d3c98] focus:border-[#7d3c98]'
                  : 'border-[#cce3f0] focus:ring-[#2980b9] focus:border-[#2980b9]'
              }`}
            />
          </div>

          {error && (
            <div
              role="alert"
              className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-2.5"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors cursor-pointer ${
              isGerenciaEntry
                ? 'bg-[#4a235a] hover:bg-[#7d3c98]'
                : 'bg-[#1b4f72] hover:bg-[#2980b9]'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>
              {loading
                ? 'Verificando...'
                : isGerenciaEntry
                ? 'Ingresar a Gerencia'
                : 'Ingresar a Barra'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-5 pt-5 border-t border-slate-200 space-y-3">
          <button
            type="button"
            onClick={fillModuleDemo}
            className="w-full px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            {isGerenciaEntry
              ? 'Autocompletar acceso demo Gerencia'
              : 'Autocompletar acceso demo Encargado de Barra'}
          </button>

          <p className="text-center text-xs text-slate-500">
            {isGerenciaEntry ? '¿Eres de barra? ' : '¿Eres administrador? '}
            <button
              type="button"
              onClick={() => navigateEntry(isGerenciaEntry ? 'barra' : 'gerencia')}
              className={`font-semibold hover:underline cursor-pointer ${
                isGerenciaEntry ? 'text-[#4a235a]' : 'text-[#1b4f72]'
              }`}
            >
              {isGerenciaEntry ? 'Accede al Módulo de Barra' : 'Accede al Panel Gerencial'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
