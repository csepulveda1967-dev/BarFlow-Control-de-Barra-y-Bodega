import React, { useState } from 'react';
import { GlassWater, Plus, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import type { EstadoApp, TurnoTipo, Vaso } from '../types';
import { apiRequest, fmtCLP, fmtQty } from '../lib/api';

interface VasosViewProps {
  token: string;
  estado: EstadoApp;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

export const VasosView: React.FC<VasosViewProps> = ({
  token,
  estado,
  onRefresh,
  onNotify,
}) => {
  const isGerencia = estado.rol === 'Gerencia';

  // Log movement modal/panel
  const [movVasoId, setMovVasoId] = useState<string>(() => (estado.vasos[0] ? String(estado.vasos[0].id) : ''));
  const [movTipo, setMovTipo] = useState<string>('Rotura');
  const [movTurno, setMovTurno] = useState<TurnoTipo>('PM');
  const [movCant, setMovCant] = useState<string>('');
  const [movMotivo, setMovMotivo] = useState('');
  const [savingMov, setSavingMov] = useState(false);

  // Create glass modal (Gerencia)
  const [showCreate, setShowCreate] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [capacidadMl, setCapacidadMl] = useState('');
  const [stockInicial, setStockInicial] = useState('');
  const [stockMinimo, setStockMinimo] = useState('');
  const [costoReposicion, setCostoReposicion] = useState('');
  const [savingVaso, setSavingVaso] = useState(false);

  const bajoMinimoCount = estado.vasos.filter((v) => v.stock_disponible < v.stock_minimo).length;
  const costoRoturasTotal = estado.vasos.reduce(
    (s, v) => s + v.roturas_acumuladas * (v.costo_reposicion || 0),
    0
  );

  const handleRegistrarMov = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetId = movVasoId || (estado.vasos[0] ? String(estado.vasos[0].id) : '');
    if (!targetId) return onNotify('Selecciona un tipo de vaso', true);
    const cantNum = Number(movCant);
    if (!movCant.trim() || !Number.isFinite(cantNum) || cantNum <= 0) {
      return onNotify('Ingresa una cantidad válida mayor a 0', true);
    }
    setSavingMov(true);
    try {
      await apiRequest(`/vasos/${targetId}/movimiento`, {
        method: 'POST',
        token,
        body: {
          tipo: movTipo,
          turno: movTurno,
          cantidad: cantNum,
          motivo: movMotivo || movTipo,
        },
      });
      await onRefresh();
      setMovCant('');
      setMovMotivo('');
      onNotify(`Movimiento de cristalería (${movTipo} · Turno ${movTurno}) registrado`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error registrando movimiento de vasos', true);
    } finally {
      setSavingMov(false);
    }
  };

  const handleCrearVaso = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingVaso(true);
    try {
      await apiRequest('/vasos', {
        method: 'POST',
        token,
        body: {
          codigo,
          nombre,
          capacidad_ml: Number(capacidadMl) || 350,
          stock_inicial: Number(stockInicial) || 0,
          stock_minimo: Number(stockMinimo) || 0,
          costo_reposicion: Number(costoReposicion) || 0,
        },
      });
      await onRefresh();
      setShowCreate(false);
      setCodigo('');
      setNombre('');
      setCapacidadMl('');
      setStockInicial('');
      setStockMinimo('');
      setCostoReposicion('');
      onNotify('Tipo de vaso creado en maestro independiente');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error creando vaso', true);
    } finally {
      setSavingVaso(false);
    }
  };

  const selectForAction = (v: Vaso) => {
    setMovVasoId(String(v.id));
  };

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className={`grid gap-4 ${isGerencia ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-3'}`}>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Total Vasos Disponibles</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {fmtQty(estado.kpis.vasosDisponibles)}
          </p>
          <p className="mt-1 text-xs text-slate-500">{estado.vasos.length} modelos de cristalería</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Roturas / Pérdidas Acum.</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-rose-700">
            {fmtQty(estado.kpis.vasosRoturas)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Control independiente de barra</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Modelos bajo Mínimo</p>
          <p className={`mt-2 text-2xl font-bold font-mono tabular-nums ${bajoMinimoCount > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
            {bajoMinimoCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">Requieren reposición</p>
        </div>

        {isGerencia && (
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-500">Costo Roturas Acumulado</p>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {fmtCLP(costoRoturasTotal)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Valorizado de reposición</p>
          </div>
        )}
      </div>

      {/* Main Split: Movement Form + Glassware Master Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <GlassWater className="w-4 h-4 text-slate-700" />
              <h2 className="text-base font-semibold text-slate-900">Registrar Control de Vasos</h2>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Maestro independiente para registrar roturas en turno AM/PM, pérdidas en eventos o reposiciones.
          </p>

          <form onSubmit={handleRegistrarMov} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de Vaso / Copa</label>
              <select
                value={movVasoId || (estado.vasos[0] ? String(estado.vasos[0].id) : '')}
                onChange={(e) => setMovVasoId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {estado.vasos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nombre} (Disp: {fmtQty(v.stock_disponible)})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo Evento</label>
                <select
                  value={movTipo}
                  onChange={(e) => setMovTipo(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Rotura">Rotura en Barra</option>
                  <option value="Pérdida Evento">Pérdida Evento</option>
                  <option value="Ajuste">Ajuste Conteo</option>
                  {isGerencia && <option value="Compra / Ingreso">Compra / Ingreso (+)</option>}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Turno</label>
                <select
                  value={movTurno}
                  onChange={(e) => setMovTurno(e.target.value as TurnoTipo)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-semibold"
                >
                  <option value="AM">Turno AM</option>
                  <option value="PM">Turno PM</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Cantidad de unidades</label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={movCant}
                onChange={(e) => setMovCant(e.target.value)}
                placeholder="Ej. 1"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Detalle / Motivo</label>
              <input
                type="text"
                maxLength={180}
                value={movMotivo}
                onChange={(e) => setMovMotivo(e.target.value)}
                placeholder="Ej. Quiebre en lavado PM, evento salón..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <button
              type="submit"
              disabled={savingMov}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
            >
              {savingMov ? 'Registrando...' : 'Guardar Control de Vasos'}
            </button>
          </form>
        </div>

        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Maestro Independiente de Cristalería</h3>
                <p className="text-xs text-slate-500">Stock inicial, disponible operativo y roturas acumuladas</p>
              </div>
              {isGerencia && (
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nuevo Modelo</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4 text-left">Código / Modelo</th>
                    <th className="py-3 px-4 text-right">Cap.</th>
                    <th className="py-3 px-4 text-right">Inicial</th>
                    <th className="py-3 px-4 text-right">Disponible</th>
                    <th className="py-3 px-4 text-right">Roturas</th>
                    <th className="py-3 px-4 text-right">Mín.</th>
                    {isGerencia && <th className="py-3 px-4 text-right">Reposición ($)</th>}
                    <th className="py-3 px-4 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {estado.vasos.map((v) => {
                    const low = v.stock_disponible < v.stock_minimo;
                    return (
                      <tr
                        key={v.id}
                        onClick={() => selectForAction(v)}
                        className="hover:bg-slate-50 cursor-pointer"
                      >
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{v.nombre}</div>
                          <div className="text-xs font-mono text-slate-500">{v.codigo}</div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                          {v.capacidad_ml} ml
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">
                          {fmtQty(v.stock_inicial)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                          {fmtQty(v.stock_disponible)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-rose-700 font-semibold">
                          {fmtQty(v.roturas_acumuladas)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                          {fmtQty(v.stock_minimo)}
                        </td>
                        {isGerencia && (
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                            {fmtCLP(v.costo_reposicion)}
                          </td>
                        )}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {low ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Bajo mínimo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Operativo
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Glassware Movements History */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">Bitácora de Movimientos y Roturas de Vasos</h3>
            </div>
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4 text-left">Fecha</th>
                    <th className="py-2.5 px-4 text-left">Turno</th>
                    <th className="py-2.5 px-4 text-left">Tipo</th>
                    <th className="py-2.5 px-4 text-left">Modelo</th>
                    <th className="py-2.5 px-4 text-right">Cant.</th>
                    <th className="py-2.5 px-4 text-left">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {estado.vasosMovimientos.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        Sin movimientos registrados aún.
                      </td>
                    </tr>
                  ) : (
                    estado.vasosMovimientos.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="py-2 px-4 font-mono text-slate-500 whitespace-nowrap">{m.fecha}</td>
                        <td className="py-2 px-4 font-semibold text-slate-700">{m.turno}</td>
                        <td className="py-2 px-4 font-semibold text-slate-900 whitespace-nowrap">{m.tipo}</td>
                        <td className="py-2 px-4 text-slate-900">{m.vaso_nombre}</td>
                        <td className="py-2 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {fmtQty(m.cantidad)}
                        </td>
                        <td className="py-2 px-4 text-slate-600">{m.motivo || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Create Glass Modal (Gerencia) */}
      {showCreate && isGerencia && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Nuevo Modelo de Vaso / Copa</h3>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCrearVaso} className="space-y-3.5">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Código</label>
                  <input
                    type="text"
                    required
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    placeholder="VAS-005"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono uppercase"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre del Vaso</label>
                  <input
                    type="text"
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Copa Flauta Espumante"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Capacidad (ml)</label>
                  <input
                    type="number"
                    min="10"
                    required
                    value={capacidadMl}
                    onChange={(e) => setCapacidadMl(e.target.value)}
                    placeholder="350"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Stock Inicial</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={stockInicial}
                    onChange={(e) => setStockInicial(e.target.value)}
                    placeholder="48"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Stock Mínimo</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={stockMinimo}
                    onChange={(e) => setStockMinimo(e.target.value)}
                    placeholder="24"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Costo Reposición ($)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={costoReposicion}
                    onChange={(e) => setCostoReposicion(e.target.value)}
                    placeholder="2500"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingVaso}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {savingVaso ? 'Guardando...' : 'Crear Vaso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
