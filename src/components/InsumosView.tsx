import React, { useState } from 'react';
import { AlertTriangle, Boxes, CheckCircle2, Edit3, MessageCircle, Plus, X } from 'lucide-react';
import type { EstadoApp, Insumo } from '../types';
import { apiRequest, buildWhatsAppUrl, fmtCLP, fmtQty } from '../lib/api';

interface InsumosViewProps {
  token: string;
  estado: EstadoApp;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

export const InsumosView: React.FC<InsumosViewProps> = ({
  token,
  estado,
  onRefresh,
  onNotify,
}) => {
  const isGerencia = estado.rol === 'Gerencia';

  const [movQtys, setMovQtys] = useState<Record<number, string>>({});
  const [processingId, setProcessingId] = useState<number | null>(null);

  // Create/Edit Insumo modal (Gerencia)
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Insumo | null>(null);
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [unidad, setUnidad] = useState('kg');
  const [stockActual, setStockActual] = useState('5');
  const [stockMinimo, setStockMinimo] = useState('3');
  const [costoUnitario, setCostoUnitario] = useState('1800');
  const [proveedorId, setProveedorId] = useState<string>('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setCodigo('');
    setNombre('');
    setUnidad('kg');
    setStockActual('5');
    setStockMinimo('3');
    setCostoUnitario('1800');
    setProveedorId(estado.proveedores[0] ? String(estado.proveedores[0].id) : '');
    setNotas('');
    setShowModal(true);
  };

  const openEdit = (ins: Insumo) => {
    setEditing(ins);
    setCodigo(ins.codigo);
    setNombre(ins.nombre);
    setUnidad(ins.unidad);
    setStockActual(String(ins.stock_actual));
    setStockMinimo(String(ins.stock_minimo));
    setCostoUnitario(String(ins.costo_unitario ?? 0));
    setProveedorId(ins.proveedor_id ? String(ins.proveedor_id) : '');
    setNotas(ins.notas || '');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await apiRequest(`/insumos/${editing.id}`, {
          method: 'PATCH',
          token,
          body: {
            nombre,
            unidad,
            stock_minimo: Number(stockMinimo),
            costo_unitario: Number(costoUnitario),
            proveedor_id: proveedorId ? Number(proveedorId) : null,
            notas: notas || null,
          },
        });
        onNotify('Ficha de insumo actualizada');
      } else {
        await apiRequest('/insumos', {
          method: 'POST',
          token,
          body: {
            codigo,
            nombre,
            unidad,
            stock_actual: Number(stockActual),
            stock_minimo: Number(stockMinimo),
            costo_unitario: Number(costoUnitario),
            proveedor_id: proveedorId ? Number(proveedorId) : null,
            notas: notas || null,
          },
        });
        onNotify('Insumo creado en maestro con ficha de proveedor');
      }
      await onRefresh();
      setShowModal(false);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error guardando insumo', true);
    } finally {
      setSaving(false);
    }
  };

  const handleMov = async (ins: Insumo, tipo: 'Ingreso' | 'Consumo') => {
    const qty = Number(movQtys[ins.id] || '1');
    if (!Number.isFinite(qty) || qty <= 0) {
      return onNotify('Ingresa una cantidad válida mayor a 0', true);
    }
    setProcessingId(ins.id);
    try {
      await apiRequest(`/insumos/${ins.id}/movimiento`, {
        method: 'POST',
        token,
        body: { tipo, cantidad: qty },
      });
      await onRefresh();
      onNotify(`${tipo} de ${fmtQty(qty)} ${ins.unidad} en ${ins.nombre}`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error ajustando stock de insumo', true);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Maestro de Insumos con Ficha de Proveedor</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Controla limón, hielo, jarabes y descartables de barra con ficha de proveedor vinculada para pedidos rápidos.
            </p>
          </div>
        </div>

        {isGerencia && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Insumo</span>
          </button>
        )}
      </div>

      {/* Cards Grid showing Insumo + Assigned Supplier Card */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {estado.insumos.map((ins) => {
          const bajo = ins.stock_actual < ins.stock_minimo;
          const prov = estado.proveedores.find((pr) => pr.id === ins.proveedor_id);
          const falta = Math.max(1, ins.stock_minimo - ins.stock_actual);
          const wspUrl = prov
            ? buildWhatsAppUrl(
                prov.telefono_wsp,
                `Hola ${prov.contacto || prov.nombre}, necesitamos pedir ${fmtQty(falta)} ${ins.unidad} de ${ins.nombre} para Barra.`
              )
            : null;

          return (
            <div key={ins.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
              <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
                    <span>{ins.codigo}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-sans">{ins.unidad}</span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mt-1">{ins.nombre}</h3>
                  {ins.notas && <p className="text-xs text-slate-500 mt-0.5">{ins.notas}</p>}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {bajo ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 whitespace-nowrap">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Bajo mínimo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 whitespace-nowrap">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Stock OK
                    </span>
                  )}
                  {isGerencia && (
                    <button
                      type="button"
                      onClick={() => openEdit(ins)}
                      title="Editar insumo"
                      className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Stock metrics */}
              <div className={`grid divide-x divide-slate-200 border-b border-slate-200 ${isGerencia ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <div className="p-3.5">
                  <p className="text-[11px] text-slate-500">Stock Actual</p>
                  <p className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${bajo ? 'text-rose-700' : 'text-slate-900'}`}>
                    {fmtQty(ins.stock_actual)} <span className="text-xs font-normal text-slate-500">{ins.unidad}</span>
                  </p>
                </div>
                <div className="p-3.5">
                  <p className="text-[11px] text-slate-500">Stock Mínimo</p>
                  <p className="text-lg font-bold font-mono tabular-nums text-slate-700 mt-0.5">
                    {fmtQty(ins.stock_minimo)} <span className="text-xs font-normal text-slate-500">{ins.unidad}</span>
                  </p>
                </div>
                {isGerencia && (
                  <div className="p-3.5">
                    <p className="text-[11px] text-slate-500">Costo Unitario</p>
                    <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                      {fmtCLP(ins.costo_unitario)}
                    </p>
                  </div>
                )}
              </div>

              {/* Linked Supplier Card */}
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    Ficha de Proveedor Asignado
                  </p>
                  {prov ? (
                    <div className="mt-1">
                      <p className="text-xs font-bold text-slate-900 truncate">{prov.nombre}</p>
                      <p className="text-xs text-slate-600">
                        {prov.contacto ? `${prov.contacto} · ` : ''}
                        <span className="font-mono">{prov.telefono_wsp}</span>
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 mt-1">Sin proveedor asignado</p>
                  )}
                </div>

                {isGerencia && wspUrl && (
                  <a
                    href={wspUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Pedir por WSP</span>
                  </a>
                )}
              </div>

              {/* Quick Stock Adjustment */}
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-slate-600">Movimiento rápido:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    value={movQtys[ins.id] ?? '1'}
                    onChange={(e) => setMovQtys((prev) => ({ ...prev, [ins.id]: e.target.value }))}
                    className="w-16 px-2.5 py-1.5 text-xs text-right border border-slate-300 rounded-lg font-mono tabular-nums font-bold"
                  />
                  <button
                    type="button"
                    disabled={processingId === ins.id}
                    onClick={() => handleMov(ins, 'Consumo')}
                    className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                  >
                    − Consumo
                  </button>
                  <button
                    type="button"
                    disabled={processingId === ins.id}
                    onClick={() => handleMov(ins, 'Ingreso')}
                    className="px-2.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    + Ingreso
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create/Edit Insumo Modal (Gerencia) */}
      {showModal && isGerencia && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                {editing ? `Editar Insumo · ${editing.codigo}` : 'Nuevo Insumo en Maestro'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Código</label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editing)}
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    placeholder="INS-005"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono uppercase disabled:bg-slate-100"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre del Insumo</label>
                  <input
                    type="text"
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="MENTA FRESCA (ATADO)"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Unidad</label>
                  <input
                    type="text"
                    required
                    value={unidad}
                    onChange={(e) => setUnidad(e.target.value)}
                    placeholder="kg / bolsa / un"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                {!editing && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Stock Inicial</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={stockActual}
                      onChange={(e) => setStockActual(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Stock Mínimo</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={stockMinimo}
                    onChange={(e) => setStockMinimo(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Costo Unit. ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={costoUnitario}
                    onChange={(e) => setCostoUnitario(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Proveedor Asignado (Ficha)</label>
                <select
                  value={proveedorId}
                  onChange={(e) => setProveedorId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Sin asignar</option>
                  {estado.proveedores.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.nombre} ({pr.telefono_wsp})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notas</label>
                <input
                  type="text"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Guardando...' : 'Guardar Insumo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
