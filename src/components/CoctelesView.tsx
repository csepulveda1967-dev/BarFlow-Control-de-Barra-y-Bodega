import React, { useState } from 'react';
import { Martini, MinusCircle, Plus, Trash2, X } from 'lucide-react';
import type { EstadoApp, TurnoTipo } from '../types';
import { apiRequest, fmtCLP, fmtQty } from '../lib/api';

interface CoctelesViewProps {
  token: string;
  estado: EstadoApp;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

interface IngredientDraft {
  producto_id: string;
  cantidad_ml_o_unidad: string;
  unidad_medida: string;
}

export const CoctelesView: React.FC<CoctelesViewProps> = ({
  token,
  estado,
  onRefresh,
  onNotify,
}) => {
  const isGerencia = estado.rol === 'Gerencia';

  // Deduction per recipe
  const [deductQtys, setDeductQtys] = useState<Record<number, string>>({});
  const [deductFecha, setDeductFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [deductTurno, setDeductTurno] = useState<TurnoTipo>('PM');
  const [deductingId, setDeductingId] = useState<number | null>(null);

  // Create cocktail modal (Gerencia)
  const [showCreate, setShowCreate] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('Cóctel Clásico');
  const [precioVenta, setPrecioVenta] = useState('');
  const [notas, setNotas] = useState('');
  const [ings, setIngs] = useState<IngredientDraft[]>(() => [
    {
      producto_id: estado.productos[0] ? String(estado.productos[0].id) : '',
      cantidad_ml_o_unidad: '',
      unidad_medida: 'ml',
    },
  ]);
  const [saving, setSaving] = useState(false);

  const handleDescontar = async (recetaId: number, recetaNombre: string) => {
    const raw = (deductQtys[recetaId] || '').trim();
    const qty = raw === '' ? 1 : Number(raw);
    if (!Number.isFinite(qty) || qty <= 0) {
      return onNotify('Ingresa una cantidad de cócteles válida mayor a 0', true);
    }
    setDeductingId(recetaId);
    try {
      await apiRequest(`/recetas/${recetaId}/descontar`, {
        method: 'POST',
        token,
        body: { cantidad: qty, fecha: deductFecha, turno: deductTurno },
      });
      await onRefresh();
      setDeductQtys((prev) => ({ ...prev, [recetaId]: '' }));
      onNotify(`Descuento aplicado en Barra: ${qty}x ${recetaNombre} (${deductFecha} · Turno ${deductTurno})`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error al descontar ingredientes', true);
    } finally {
      setDeductingId(null);
    }
  };

  const handleAddIngRow = () => {
    setIngs((prev) => [
      ...prev,
      {
        producto_id: estado.productos[0] ? String(estado.productos[0].id) : '',
        cantidad_ml_o_unidad: '',
        unidad_medida: 'ml',
      },
    ]);
  };

  const handleRemoveIngRow = (idx: number) => {
    setIngs((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCrearReceta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      ings.length === 0 ||
      ings.some((i) => !i.producto_id || !Number.isFinite(Number(i.cantidad_ml_o_unidad)) || Number(i.cantidad_ml_o_unidad) <= 0)
    ) {
      return onNotify('Agrega al menos 1 ingrediente con dosis válida mayor a 0', true);
    }
    setSaving(true);
    try {
      await apiRequest('/recetas', {
        method: 'POST',
        token,
        body: {
          codigo,
          nombre,
          categoria,
          precio_venta: Number(precioVenta) || 0,
          notas,
          ingredientes: ings.map((i) => ({
            producto_id: Number(i.producto_id),
            cantidad_ml_o_unidad: Number(i.cantidad_ml_o_unidad),
            unidad_medida: i.unidad_medida,
          })),
        },
      });
      await onRefresh();
      setShowCreate(false);
      setCodigo('');
      setNombre('');
      setPrecioVenta('');
      setNotas('');
      setIngs([
        {
          producto_id: estado.productos[0] ? String(estado.productos[0].id) : '',
          cantidad_ml_o_unidad: '',
          unidad_medida: 'ml',
        },
      ]);
      onNotify('Ficha de costeo de cóctel creada correctamente');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error al crear ficha de cóctel', true);
    } finally {
      setSaving(false);
    }
  };

  const handleEliminarReceta = async (id: number) => {
    try {
      await apiRequest(`/recetas/${id}`, { method: 'DELETE', token });
      await onRefresh();
      onNotify('Ficha de cóctel eliminada');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error al eliminar ficha', true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
            <Martini className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {isGerencia
                ? 'Ficha de Costeo de Cócteles y Descuento Automático'
                : 'Recetas de Barra y Descuento de Preparaciones'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isGerencia
                ? 'Calcula el costo exacto por ml/unidad según tus envases, revisa márgenes y genera descuentos automáticos sobre el stock de Barra.'
                : 'Selecciona la cantidad de tragos preparados en tu turno (AM/PM) para descontar automáticamente los ml/botellas desde Barra Principal.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">Fecha / Turno:</label>
            <input
              type="date"
              value={deductFecha}
              onChange={(e) => setDeductFecha(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            />
            <select
              value={deductTurno}
              onChange={(e) => setDeductTurno(e.target.value as TurnoTipo)}
              className="px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white"
            >
              <option value="AM">Turno AM</option>
              <option value="PM">Turno PM</option>
            </select>
          </div>

          {isGerencia && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nueva Ficha Cóctel</span>
            </button>
          )}
        </div>
      </div>

      {/* Recipes Grid */}
      {estado.recetas.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-500">
          No hay fichas de cócteles registradas todavía.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {estado.recetas.map((rec) => {
            const marginColor =
              (rec.margen_pct ?? 0) >= 65
                ? 'text-emerald-700'
                : (rec.margen_pct ?? 0) >= 45
                ? 'text-amber-700'
                : 'text-rose-700';

            return (
              <div key={rec.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
                <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                      <span>{rec.codigo}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-sans font-medium text-slate-700">{rec.categoria}</span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mt-1">{rec.nombre}</h3>
                    {rec.notas && <p className="text-xs text-slate-500 mt-0.5">{rec.notas}</p>}
                  </div>

                  {isGerencia && (
                    <button
                      type="button"
                      onClick={() => handleEliminarReceta(rec.id)}
                      title="Eliminar ficha"
                      className="p-1.5 text-slate-400 hover:text-rose-700 rounded-md transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Gerencia Costing Strip */}
                {isGerencia && (
                  <div className="grid grid-cols-4 divide-x divide-slate-200 bg-slate-50 border-b border-slate-200">
                    <div className="p-3">
                      <p className="text-[11px] text-slate-500">Costo Receta</p>
                      <p className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                        {fmtCLP(rec.costo_total)}
                      </p>
                    </div>
                    <div className="p-3">
                      <p className="text-[11px] text-slate-500">Precio Venta</p>
                      <p className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                        {fmtCLP(rec.precio_venta)}
                      </p>
                    </div>
                    <div className="p-3">
                      <p className="text-[11px] text-slate-500">Margen Bruto</p>
                      <p className="text-sm font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
                        {fmtCLP(rec.margen_bruto)}
                      </p>
                    </div>
                    <div className="p-3">
                      <p className="text-[11px] text-slate-500">Rentabilidad</p>
                      <p className={`text-sm font-bold font-mono tabular-nums mt-0.5 ${marginColor}`}>
                        {rec.margen_pct ?? 0}%
                      </p>
                    </div>
                  </div>
                )}

                {/* Ingredients Table */}
                <div className="p-4 flex-1">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="text-slate-500 border-b border-slate-200">
                        <th className="py-1.5 text-left font-semibold">Ingrediente</th>
                        <th className="py-1.5 text-right font-semibold">Dosis</th>
                        <th className="py-1.5 text-right font-semibold">Stock Barra</th>
                        {isGerencia && <th className="py-1.5 text-right font-semibold">Costo</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rec.ingredientes.map((ing) => (
                        <tr key={ing.id}>
                          <td className="py-2 font-medium text-slate-800">{ing.producto_nombre}</td>
                          <td className="py-2 text-right font-mono tabular-nums text-slate-700">
                            {fmtQty(ing.cantidad_ml_o_unidad)} {ing.unidad_medida}
                          </td>
                          <td
                            className={`py-2 text-right font-mono tabular-nums ${
                              ing.stock_bar_actual <= 0 ? 'text-rose-700 font-semibold' : 'text-slate-600'
                            }`}
                          >
                            {fmtQty(ing.stock_bar_actual)} {ing.producto_unidad}
                          </td>
                          {isGerencia && (
                            <td className="py-2 text-right font-mono tabular-nums text-slate-900">
                              {fmtCLP(ing.costo_ingrediente)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Action Footer: Generate Stock Deduction */}
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-slate-600">
                    Descontar por ventas / preparación:
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={deductQtys[rec.id] ?? ''}
                      onChange={(e) =>
                        setDeductQtys((prev) => ({ ...prev, [rec.id]: e.target.value }))
                      }
                      placeholder="1"
                      aria-label={`Cantidad de ${rec.nombre}`}
                      className="w-16 px-2.5 py-1.5 text-xs text-right border border-slate-300 rounded-lg bg-white font-mono tabular-nums font-bold"
                    />
                    <button
                      type="button"
                      disabled={deductingId === rec.id}
                      onClick={() => handleDescontar(rec.id, rec.nombre)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <MinusCircle className="w-3.5 h-3.5" />
                      <span>{deductingId === rec.id ? 'Descontando...' : 'Generar Descuento'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent Shift Recipe & Corto Deductions */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Historial de Descuentos de Recetas y Cortos Asociados al Turno (AM / PM)
            </h3>
            <p className="text-xs text-slate-500">
              Cada descuento rebaja automáticamente el stock de Barra Principal y queda vinculado a la fecha y turno correspondiente.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {estado.consumosTurno.length} registros
          </span>
        </div>
        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2.5 px-4 text-left">Fecha / Turno</th>
                <th className="py-2.5 px-4 text-left">Tipo</th>
                <th className="py-2.5 px-4 text-left">Preparación / Botella</th>
                <th className="py-2.5 px-4 text-right">Porciones</th>
                <th className="py-2.5 px-4 text-left">Detalle Descuento</th>
                {isGerencia && <th className="py-2.5 px-4 text-right">Costo</th>}
                <th className="py-2.5 px-4 text-left">Responsable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {estado.consumosTurno.length === 0 ? (
                <tr>
                  <td colSpan={isGerencia ? 7 : 6} className="py-8 text-center text-slate-500">
                    Aún no hay descuentos de tragos compuestos o cortos registrados en turno.
                  </td>
                </tr>
              ) : (
                estado.consumosTurno.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span className="font-mono text-slate-900">{c.fecha}</span>
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span className="font-semibold text-slate-700">Turno {c.turno}</span>
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-700 whitespace-nowrap">
                      {c.tipo}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{c.nombre}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                      {fmtQty(c.cantidad_porciones)}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">
                      {c.detalle_descuento || '—'}
                    </td>
                    {isGerencia && (
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {fmtCLP(c.costo_total)}
                      </td>
                    )}
                    <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">{c.responsable}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Cocktail Modal (Gerencia) */}
      {showCreate && isGerencia && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Nueva Ficha de Costeo de Cóctel</h3>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCrearReceta} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Código</label>
                  <input
                    type="text"
                    required
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    placeholder="COC-004"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono uppercase"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre del Trago / Cóctel</label>
                  <input
                    type="text"
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Mojito Clásico / Aperol Spritz"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Categoría Carta</label>
                  <input
                    type="text"
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Precio Venta Carta ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={precioVenta}
                    onChange={(e) => setPrecioVenta(e.target.value)}
                    placeholder="Ej. 6900"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">
                    Ingredientes (se convierten según ml/envase o rendimiento por botella)
                  </label>
                  <button
                    type="button"
                    onClick={handleAddIngRow}
                    className="text-xs font-semibold text-slate-900 hover:underline cursor-pointer"
                  >
                    + Agregar ingrediente
                  </button>
                </div>

                {ings.map((row, idx) => {
                  const prodSel = estado.productos.find((x) => String(x.id) === row.producto_id);
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <select
                          value={row.producto_id}
                          onChange={(e) =>
                            setIngs((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, producto_id: e.target.value } : x))
                            )
                          }
                          className="col-span-6 px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                        >
                          {estado.productos.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre} ({p.contenido_envase || 1} {p.unidad_contenido || p.unidad})
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          value={row.cantidad_ml_o_unidad}
                          onChange={(e) =>
                            setIngs((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, cantidad_ml_o_unidad: e.target.value } : x))
                            )
                          }
                          placeholder={row.unidad_medida === 'ml' ? '60' : '1'}
                          className="col-span-3 px-2.5 py-2 text-xs border border-slate-300 rounded-lg font-mono tabular-nums"
                        />
                        <select
                          value={row.unidad_medida}
                          onChange={(e) =>
                            setIngs((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, unidad_medida: e.target.value } : x))
                            )
                          }
                          className="col-span-2 px-2 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                        >
                          <option value="ml">ml</option>
                          <option value="coctel">cóctel (rend.)</option>
                          <option value="corto">corto (rend.)</option>
                          <option value="unidad">unidad</option>
                          <option value="L">L</option>
                        </select>
                        <button
                          type="button"
                          disabled={ings.length <= 1}
                          onClick={() => handleRemoveIngRow(idx)}
                          className="col-span-1 p-1.5 text-slate-400 hover:text-rose-700 disabled:opacity-30 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {prodSel && (row.unidad_medida === 'corto' || row.unidad_medida === 'coctel') && (
                        <p className="text-[11px] text-slate-500 pl-1">
                          {row.unidad_medida === 'corto'
                            ? prodSel.porciones_corto
                              ? `Rendimiento configurado: ${fmtQty(prodSel.porciones_corto)} cortos por ${prodSel.unidad}`
                              : 'Sin rendimiento de cortos configurado en Gerencia (usará 1 unidad si no se configura)'
                            : prodSel.porciones_coctel
                            ? `Rendimiento configurado: ${fmtQty(prodSel.porciones_coctel)} cócteles por ${prodSel.unidad}`
                            : 'Sin rendimiento de cóctel configurado en Gerencia (usará 1 unidad si no se configura)'}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notas de preparación / garnish</label>
                <input
                  type="text"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Ej. Servir con hielo en copa balón y rodaja de naranja"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
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
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Guardando...' : 'Guardar Ficha de Costeo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
