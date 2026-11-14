import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calculator,
  ClipboardCheck,
  Eraser,
  Flame,
  Martini,
  Search,
  TableProperties,
} from 'lucide-react';
import { PRODUCT_CATEGORIES, type EstadoApp, type Producto, type TurnoTipo } from '../types';
import { apiRequest, fmtQty } from '../lib/api';

interface TurnoDiarioViewProps {
  token: string;
  estado: EstadoApp;
  preselectedProducto?: Producto | null;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

interface PlanillaRowDraft {
  ingresos: string;
  mermas: string;
  cierre: string;
}

export const TurnoDiarioView: React.FC<TurnoDiarioViewProps> = ({
  token,
  estado,
  preselectedProducto,
  onRefresh,
  onNotify,
}) => {
  const [mode, setMode] = useState<'planilla' | 'recetas' | 'cierre' | 'salida'>('planilla');
  const lastPreselectedIdRef = useRef<number | null>(null);

  // Shared Date / Shift (strictly AM or PM)
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [turno, setTurno] = useState<TurnoTipo>('AM');

  // Planilla Masiva de Cierre / Inventario (multi-producto con celdas limpias)
  const [planillaSearch, setPlanillaSearch] = useState('');
  const [planillaCat, setPlanillaCat] = useState<string>('Todas');
  const [planillaObs, setPlanillaObs] = useState('');
  const [planillaDrafts, setPlanillaDrafts] = useState<Record<number, PlanillaRowDraft>>({});
  const [savingPlanilla, setSavingPlanilla] = useState(false);

  // Descuento Masivo de Recetas Compuestas y Cortos por Botella (Turno AM / PM)
  const [recetaDrafts, setRecetaDrafts] = useState<Record<number, string>>({});
  const [cortoDrafts, setCortoDrafts] = useState<Record<number, { cantidad: string; rendimiento?: string }>>({});
  const [cortoCat, setCortoCat] = useState<string>('Licores');
  const [cortoSearch, setCortoSearch] = useState('');
  const [recetasObs, setRecetasObs] = useState('');
  const [savingRecetasLote, setSavingRecetasLote] = useState(false);

  // Cierre Manual Individual (celdas vacías para permitir ingreso directo)
  const [productoId, setProductoId] = useState<string>('');
  const [ingresos, setIngresos] = useState<string>('');
  const [mermas, setMermas] = useState<string>('');
  const [stockCierre, setStockCierre] = useState<string>('');
  const [observacion, setObservacion] = useState('');
  const [savingCierre, setSavingCierre] = useState(false);

  // Salida o Merma Rápida FEFO/FIFO
  const [salProdId, setSalProdId] = useState<string>('');
  const [salTipo, setSalTipo] = useState<'Salida' | 'Merma'>('Salida');
  const [salCant, setSalCant] = useState<string>('');
  const [salMotivo, setSalMotivo] = useState('');
  const [savingSalida, setSavingSalida] = useState(false);

  useEffect(() => {
    if (preselectedProducto) {
      if (lastPreselectedIdRef.current !== preselectedProducto.id) {
        lastPreselectedIdRef.current = preselectedProducto.id;
        setProductoId(String(preselectedProducto.id));
        setSalProdId(String(preselectedProducto.id));
        setIngresos('');
        setMermas('');
        setStockCierre('');
        setSalCant('');
        setMode('salida');
      }
      return;
    }

    lastPreselectedIdRef.current = null;
    if (estado.productos.length > 0) {
      setProductoId((prev) => (prev ? prev : String(estado.productos[0].id)));
      setSalProdId((prev) => (prev ? prev : String(estado.productos[0].id)));
    }
  }, [preselectedProducto, estado.productos]);

  const dynamicCategories = useMemo(() => {
    const ordered: string[] = [];
    const seen = new Set<string>();
    const add = (cat: string) => {
      const clean = cat.trim();
      if (!clean) return;
      const key = clean.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push(clean);
      }
    };
    for (const c of PRODUCT_CATEGORIES) add(c);
    for (const c of estado.categorias || []) add(c);
    for (const p of estado.productos) add(p.categoria);
    return ordered;
  }, [estado.productos, estado.categorias]);

  const filteredPlanillaProds = useMemo(() => {
    const q = planillaSearch.trim().toLowerCase();
    return estado.productos.filter((p) => {
      if (planillaCat !== 'Todas' && p.categoria !== planillaCat) return false;
      if (q && !p.nombre.toLowerCase().includes(q) && !p.codigo.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [estado.productos, planillaSearch, planillaCat]);

  const updatePlanillaCell = (id: number, field: keyof PlanillaRowDraft, value: string) => {
    setPlanillaDrafts((prev) => {
      const current = prev[id] || { ingresos: '', mermas: '', cierre: '' };
      return {
        ...prev,
        [id]: { ...current, [field]: value },
      };
    });
  };

  const planillaListos = useMemo(() => {
    const items: Array<{
      producto_id: number;
      ingresos: number;
      mermas: number;
      stock_cierre: number;
      observacion: string;
    }> = [];
    for (const p of estado.productos) {
      const d = planillaDrafts[p.id];
      if (!d || d.cierre.trim() === '') continue;
      const cierreNum = Number(d.cierre);
      const ingNum = d.ingresos.trim() === '' ? 0 : Number(d.ingresos);
      const merNum = d.mermas.trim() === '' ? 0 : Number(d.mermas);
      if (!Number.isFinite(cierreNum) || cierreNum < 0) continue;
      items.push({
        producto_id: p.id,
        ingresos: Number.isFinite(ingNum) && ingNum >= 0 ? ingNum : 0,
        mermas: Number.isFinite(merNum) && merNum >= 0 ? merNum : 0,
        stock_cierre: cierreNum,
        observacion: planillaObs,
      });
    }
    return items;
  }, [estado.productos, planillaDrafts, planillaObs]);

  const handleGuardarPlanilla = async (e: React.FormEvent) => {
    e.preventDefault();
    if (planillaListos.length === 0) {
      return onNotify('Ingresa el conteo de cierre en al menos un producto', true);
    }
    setSavingPlanilla(true);
    try {
      const res = await apiRequest<{ ok: boolean; procesados: number }>('/cierres/lote', {
        method: 'POST',
        token,
        body: {
          fecha,
          turno,
          items: planillaListos,
        },
      });
      await onRefresh();
      setPlanillaDrafts({});
      setPlanillaObs('');
      onNotify(
        `Planilla Turno ${turno} guardada (${res.procesados} productos) y celdas limpiadas para el siguiente ingreso`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error guardando planilla de cierre', true);
    } finally {
      setSavingPlanilla(false);
    }
  };

  const selectedProd = estado.productos.find((p) => String(p.id) === productoId);
  const stockInicio = selectedProd ? selectedProd.bar : 0;
  const numIngresos = ingresos.trim() === '' ? 0 : Math.max(0, Number(ingresos) || 0);
  const numMermas = mermas.trim() === '' ? 0 : Math.max(0, Number(mermas) || 0);
  const disponibleTeorico = Math.max(0, Math.round((stockInicio + numIngresos - numMermas) * 1000) / 1000);
  const hasCierreInput = stockCierre.trim() !== '';
  const numCierre = hasCierreInput ? Math.max(0, Number(stockCierre) || 0) : null;
  const consumoCalculado = numCierre !== null ? Math.round((disponibleTeorico - numCierre) * 1000) / 1000 : null;
  const difComparativa = numCierre !== null ? Math.round((numCierre - disponibleTeorico) * 1000) / 1000 : null;

  const handleSelectCierreProd = (id: string) => {
    setProductoId(id);
    setIngresos('');
    setMermas('');
    setStockCierre('');
    setObservacion('');
  };

  const handleGuardarCierre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productoId) return onNotify('Selecciona un producto para cerrar turno', true);
    if (!hasCierreInput || numCierre === null || !Number.isFinite(Number(stockCierre)) || Number(stockCierre) < 0) {
      return onNotify('Ingresa el conteo manual de cierre para este producto', true);
    }
    setSavingCierre(true);
    try {
      await apiRequest('/cierres', {
        method: 'POST',
        token,
        body: {
          fecha,
          turno,
          producto_id: Number(productoId),
          ingresos: numIngresos,
          mermas: numMermas,
          stock_cierre: numCierre,
          observacion,
        },
      });
      await onRefresh();
      setIngresos('');
      setMermas('');
      setStockCierre('');
      setObservacion('');
      onNotify(`Cierre manual Turno ${turno} registrado. Puedes seleccionar otro producto o ingresar uno nuevo.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error al guardar cierre', true);
    } finally {
      setSavingCierre(false);
    }
  };

  const liquorCategories = new Set(['Whisky', 'Piscos', 'Otros Licores']);

  const filteredCortosProds = useMemo(() => {
    const q = cortoSearch.trim().toLowerCase();
    return estado.productos.filter((p) => {
      if (cortoCat === 'Licores') {
        if (!liquorCategories.has(p.categoria) && !p.porciones_corto) return false;
      } else if (cortoCat !== 'Todas' && p.categoria !== cortoCat) {
        return false;
      }
      if (q && !p.nombre.toLowerCase().includes(q) && !p.codigo.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [estado.productos, cortoCat, cortoSearch]);

  const recetasListas = useMemo(() => {
    const items: Array<{ receta_id: number; cantidad: number }> = [];
    for (const r of estado.recetas) {
      const raw = (recetaDrafts[r.id] || '').trim();
      if (!raw) continue;
      const num = Number(raw);
      if (Number.isFinite(num) && num > 0) {
        items.push({ receta_id: r.id, cantidad: num });
      }
    }
    return items;
  }, [estado.recetas, recetaDrafts]);

  const cortosListos = useMemo(() => {
    const items: Array<{ producto_id: number; cantidad: number; porciones_por_botella?: number }> = [];
    for (const p of estado.productos) {
      const d = cortoDrafts[p.id];
      if (!d || d.cantidad.trim() === '') continue;
      const cantNum = Number(d.cantidad);
      if (!Number.isFinite(cantNum) || cantNum <= 0) continue;
      const rendOverride =
        d.rendimiento !== undefined && d.rendimiento.trim() !== ''
          ? Number(d.rendimiento)
          : undefined;
      items.push({
        producto_id: p.id,
        cantidad: cantNum,
        ...(rendOverride && Number.isFinite(rendOverride) && rendOverride > 0
          ? { porciones_por_botella: rendOverride }
          : {}),
      });
    }
    return items;
  }, [estado.productos, cortoDrafts]);

  const handleDescontarTurnoLote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (recetasListas.length === 0 && cortosListos.length === 0) {
      return onNotify('Ingresa al menos una cantidad en Recetas Compuestas o Cortos por Botella', true);
    }
    setSavingRecetasLote(true);
    try {
      const res = await apiRequest<{ ok: boolean; recetas_procesadas: number; cortos_procesados: number }>(
        '/turno/descontar-lote',
        {
          method: 'POST',
          token,
          body: {
            fecha,
            turno,
            observacion: recetasObs,
            recetas: recetasListas,
            cortos: cortosListos,
          },
        }
      );
      await onRefresh();
      setRecetaDrafts({});
      setCortoDrafts({});
      setRecetasObs('');
      onNotify(
        `Descuento Turno ${turno} aplicado: ${res.recetas_procesadas} recetas y ${res.cortos_procesados} líneas de cortos rebajadas del stock de Barra.`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error descontando recetas/cortos del turno', true);
    } finally {
      setSavingRecetasLote(false);
    }
  };

  const handleRegistrarSalida = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salProdId) return onNotify('Selecciona un producto', true);
    const cantNum = Number(salCant);
    if (!salCant.trim() || !Number.isFinite(cantNum) || cantNum <= 0) {
      return onNotify('Ingresa una cantidad válida mayor a 0', true);
    }
    setSavingSalida(true);
    try {
      await apiRequest('/salidas', {
        method: 'POST',
        token,
        body: {
          producto_id: Number(salProdId),
          tipo: salTipo,
          cantidad: cantNum,
          motivo: salMotivo,
        },
      });
      await onRefresh();
      setSalCant('');
      setSalMotivo('');
      onNotify(`${salTipo} registrada con rebaja automática FEFO/FIFO`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error al registrar salida', true);
    } finally {
      setSavingSalida(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Mode selector */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setMode('planilla')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            mode === 'planilla' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <TableProperties className="w-4 h-4" />
          Planilla de Cierre / Inventario (AM / PM)
        </button>
        <button
          type="button"
          onClick={() => setMode('recetas')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            mode === 'recetas' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Martini className="w-4 h-4" />
          Descuento Recetas y Cortos (AM / PM)
        </button>
        <button
          type="button"
          onClick={() => setMode('cierre')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            mode === 'cierre' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          Cierre Individual
        </button>
        <button
          type="button"
          onClick={() => setMode('salida')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            mode === 'salida' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Flame className="w-4 h-4" />
          Salida o Merma Rápida (FEFO/FIFO)
        </button>
      </div>

      {/* MODE 1: PLANILLA MASIVA DE CIERRE / INVENTARIO */}
      {mode === 'planilla' && (
        <form onSubmit={handleGuardarPlanilla} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Planilla de Cierre e Inventario de Barra (AM / PM)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Las celdas inician vacías para digitar directamente varios productos a la vez. Al guardar, solo se procesan los productos con conteo ingresado y se limpian las celdas.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPlanillaDrafts({})}
                  disabled={Object.keys(planillaDrafts).length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span>Limpiar celdas</span>
                </button>
                <button
                  type="submit"
                  disabled={savingPlanilla || planillaListos.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <ClipboardCheck className="w-4 h-4" />
                  <span>
                    {savingPlanilla
                      ? 'Guardando planilla...'
                      : `Guardar Cierres Ingresados (${planillaListos.length})`}
                  </span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Fecha</label>
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Turno (AM / PM)</label>
                <select
                  value={turno}
                  onChange={(e) => setTurno(e.target.value as TurnoTipo)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-semibold"
                >
                  <option value="AM">Turno AM</option>
                  <option value="PM">Turno PM</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Categoría</label>
                <select
                  value={planillaCat}
                  onChange={(e) => setPlanillaCat(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todas">Todas las categorías</option>
                  {dynamicCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Buscar Producto</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={planillaSearch}
                    onChange={(e) => setPlanillaSearch(e.target.value)}
                    placeholder="Nombre o código..."
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Observación General</label>
                <input
                  type="text"
                  maxLength={200}
                  value={planillaObs}
                  onChange={(e) => setPlanillaObs(e.target.value)}
                  placeholder="Ej. Cierre barra salón..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[28rem]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600 z-10">
                <tr>
                  <th className="py-2.5 px-4 text-left">Producto / Categoría</th>
                  <th className="py-2.5 px-3 text-right">Stock Sistema</th>
                  <th className="py-2.5 px-3 text-right">Ingresos Directos</th>
                  <th className="py-2.5 px-3 text-right">Mermas</th>
                  <th className="py-2.5 px-3 text-right">Conteo Cierre</th>
                  <th className="py-2.5 px-4 text-right">Teórico / Dif.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredPlanillaProds.map((p) => {
                  const draft = planillaDrafts[p.id] || { ingresos: '', mermas: '', cierre: '' };
                  const ing = draft.ingresos.trim() === '' ? 0 : Math.max(0, Number(draft.ingresos) || 0);
                  const mer = draft.mermas.trim() === '' ? 0 : Math.max(0, Number(draft.mermas) || 0);
                  const teorico = Math.max(0, Math.round((p.bar + ing - mer) * 1000) / 1000);
                  const hasVal = draft.cierre.trim() !== '';
                  const cierreVal = hasVal ? Number(draft.cierre) : null;
                  const dif =
                    cierreVal !== null && Number.isFinite(cierreVal)
                      ? Math.round((cierreVal - teorico) * 1000) / 1000
                      : null;

                  return (
                    <tr key={p.id} className={hasVal ? 'bg-emerald-50/40' : 'hover:bg-slate-50'}>
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-900">{p.nombre}</div>
                        <div className="text-[11px] text-slate-500">
                          <span className="font-mono">{p.codigo}</span> · {p.categoria} · {p.unidad}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-700">
                        {fmtQty(p.bar)}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={draft.ingresos}
                          onChange={(e) => updatePlanillaCell(p.id, 'ingresos', e.target.value)}
                          placeholder="0"
                          className="w-24 px-2.5 py-1.5 text-xs text-right border border-slate-300 rounded-md bg-white font-mono tabular-nums focus:border-slate-900 focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={draft.mermas}
                          onChange={(e) => updatePlanillaCell(p.id, 'mermas', e.target.value)}
                          placeholder="0"
                          className="w-24 px-2.5 py-1.5 text-xs text-right border border-slate-300 rounded-md bg-white font-mono tabular-nums focus:border-slate-900 focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={draft.cierre}
                          onChange={(e) => updatePlanillaCell(p.id, 'cierre', e.target.value)}
                          placeholder="Ingresar..."
                          className="w-28 px-2.5 py-1.5 text-xs text-right border border-slate-900 rounded-md bg-amber-50/60 font-mono tabular-nums font-bold focus:bg-white focus:outline-none"
                        />
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <span className="text-slate-500">Teór: {fmtQty(teorico)}</span>
                        {dif !== null && (
                          <span
                            className={`ml-2 font-bold ${
                              dif < 0 ? 'text-rose-700' : dif > 0 ? 'text-amber-700' : 'text-emerald-700'
                            }`}
                          >
                            ({dif > 0 ? `+${fmtQty(dif)}` : fmtQty(dif)})
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </form>
      )}

      {/* MODE 1B: DESCUENTO DE RECETAS COMPUESTAS Y CORTOS POR BOTELLA (TURNO AM / PM) */}
      {mode === 'recetas' && (
        <form onSubmit={handleDescontarTurnoLote} className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Descuento de Tragos Compuestos y Cortos Asociado al Turno ({turno})
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Digita los cócteles preparados y cortos servidos durante tu turno. El sistema calcula la fracción exacta de cada botella según el rendimiento configurado en Gerencia y descuenta del stock de Barra.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRecetaDrafts({});
                    setCortoDrafts({});
                  }}
                  disabled={Object.keys(recetaDrafts).length === 0 && Object.keys(cortoDrafts).length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span>Limpiar celdas</span>
                </button>
                <button
                  type="submit"
                  disabled={savingRecetasLote || (recetasListas.length === 0 && cortosListos.length === 0)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Martini className="w-4 h-4" />
                  <span>
                    {savingRecetasLote
                      ? 'Descontando...'
                      : `Aplicar Descuento Turno ${turno} (${recetasListas.length + cortosListos.length})`}
                  </span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Fecha Operación</label>
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Turno Barra (AM / PM)</label>
                <select
                  value={turno}
                  onChange={(e) => setTurno(e.target.value as TurnoTipo)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-semibold"
                >
                  <option value="AM">Turno AM</option>
                  <option value="PM">Turno PM</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Observación (Opcional)</label>
                <input
                  type="text"
                  maxLength={200}
                  value={recetasObs}
                  onChange={(e) => setRecetasObs(e.target.value)}
                  placeholder="Ej. Venta barra terraza y salón..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            {/* Section A: Compound Recipes */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">1. Tragos Compuestos (Recetas de Barra)</h3>
                  <p className="text-xs text-slate-500">Descuenta todos los ingredientes de cada cóctel</p>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {recetasListas.length} seleccionados
                </span>
              </div>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600 z-10">
                    <tr>
                      <th className="py-2.5 px-4 text-left">Cóctel / Ingredientes</th>
                      <th className="py-2.5 px-4 text-right">Cantidad Turno</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {estado.recetas.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="py-8 text-center text-slate-500">
                          No hay recetas registradas.
                        </td>
                      </tr>
                    ) : (
                      estado.recetas.map((rec) => {
                        const val = recetaDrafts[rec.id] ?? '';
                        const hasVal = val.trim() !== '' && Number(val) > 0;
                        return (
                          <tr key={rec.id} className={hasVal ? 'bg-emerald-50/40' : 'hover:bg-slate-50'}>
                            <td className="py-2.5 px-4">
                              <div className="font-semibold text-slate-900">
                                {rec.nombre} <span className="font-mono text-slate-400">({rec.codigo})</span>
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {rec.ingredientes
                                  .map((i) => `${i.producto_nombre} (${fmtQty(i.cantidad_ml_o_unidad)} ${i.unidad_medida})`)
                                  .join(' + ')}
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={val}
                                onChange={(e) =>
                                  setRecetaDrafts((prev) => ({ ...prev, [rec.id]: e.target.value }))
                                }
                                placeholder="0"
                                className="w-24 px-2.5 py-1.5 text-xs text-right border border-slate-900 rounded-md bg-amber-50/60 font-mono tabular-nums font-bold focus:bg-white focus:outline-none"
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section B: Cortos por Botella */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-200 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      2. Cortos por Botella (Whisky, Ron, Pisco, Licores)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Calculado según porciones por botella configuradas en Gerencia
                    </p>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    {cortosListos.length} seleccionados
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={cortoCat}
                    onChange={(e) => setCortoCat(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Licores">Destilados y Licores</option>
                    <option value="Todas">Todas las categorías</option>
                    {dynamicCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={cortoSearch}
                    onChange={(e) => setCortoSearch(e.target.value)}
                    placeholder="Buscar botella..."
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  />
                </div>
              </div>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600 z-10">
                    <tr>
                      <th className="py-2.5 px-3 text-left">Botella / Stock Barra</th>
                      <th className="py-2.5 px-3 text-right">Cortos / Bot.</th>
                      <th className="py-2.5 px-3 text-right">Cortos Servidos</th>
                      <th className="py-2.5 px-3 text-right">Desc. Botellas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredCortosProds.map((p) => {
                      const d = cortoDrafts[p.id] || { cantidad: '' };
                      const rendVal =
                        d.rendimiento !== undefined
                          ? d.rendimiento
                          : p.porciones_corto != null
                          ? String(p.porciones_corto)
                          : '';
                      const cantNum = d.cantidad.trim() !== '' ? Number(d.cantidad) : 0;
                      const rendNum = rendVal.trim() !== '' ? Number(rendVal) : 0;
                      const equiv =
                        cantNum > 0 && rendNum > 0 ? Math.round((cantNum / rendNum) * 1000) / 1000 : null;

                      return (
                        <tr key={p.id} className={cantNum > 0 ? 'bg-emerald-50/40' : 'hover:bg-slate-50'}>
                          <td className="py-2 px-3">
                            <div className="font-medium text-slate-900">{p.nombre}</div>
                            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                              Disp: {fmtQty(p.bar)} {p.unidad}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              min="0.1"
                              step="any"
                              value={rendVal}
                              onChange={(e) =>
                                setCortoDrafts((prev) => ({
                                  ...prev,
                                  [p.id]: {
                                    cantidad: prev[p.id]?.cantidad ?? '',
                                    rendimiento: e.target.value,
                                  },
                                }))
                              }
                              placeholder="15"
                              title="Porciones por botella (configurable en Gerencia)"
                              className="w-16 px-2 py-1 text-xs text-right border border-slate-300 rounded-md bg-white font-mono tabular-nums"
                            />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={d.cantidad}
                              onChange={(e) =>
                                setCortoDrafts((prev) => ({
                                  ...prev,
                                  [p.id]: {
                                    ...prev[p.id],
                                    cantidad: e.target.value,
                                  },
                                }))
                              }
                              placeholder="0"
                              className="w-20 px-2 py-1.5 text-xs text-right border border-slate-900 rounded-md bg-amber-50/60 font-mono tabular-nums font-bold focus:bg-white focus:outline-none"
                            />
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                            {equiv !== null ? `-${fmtQty(equiv)}` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* MODE 2 & 3 + HISTORIAL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {(mode === 'cierre' || mode === 'salida') && (
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
            {mode === 'cierre' ? (
              <form onSubmit={handleGuardarCierre} className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Cierre Manual Individual (AM / PM)</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Registra tu conteo físico al finalizar el turno AM o PM. Al guardar, las celdas se limpian para continuar con otro producto.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Fecha de Operación</label>
                    <input
                      type="date"
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Turno (Solo AM / PM)</label>
                    <select
                      value={turno}
                      onChange={(e) => setTurno(e.target.value as TurnoTipo)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-semibold"
                    >
                      <option value="AM">Turno AM</option>
                      <option value="PM">Turno PM</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Producto de Barra</label>
                  <select
                    value={productoId}
                    onChange={(e) => handleSelectCierreProd(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {estado.productos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} (Sistema: {fmtQty(p.bar)} {p.unidad})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Stock Apertura Sistema</label>
                    <input
                      type="text"
                      readOnly
                      value={`${fmtQty(stockInicio)} ${selectedProd?.unidad || ''}`}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-100 text-slate-600 font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Ingresos Directos</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={ingresos}
                      onChange={(e) => setIngresos(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 text-sm border border-amber-300 rounded-lg bg-amber-50/50 font-mono tabular-nums font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Mermas / Roturas</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={mermas}
                      onChange={(e) => setMermas(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 text-sm border border-amber-300 rounded-lg bg-amber-50/50 font-mono tabular-nums font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Conteo Manual Cierre</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={stockCierre}
                      onChange={(e) => setStockCierre(e.target.value)}
                      placeholder="Ingresar conteo..."
                      className="w-full px-3 py-2 text-sm border border-slate-900 rounded-lg bg-amber-50/60 font-mono tabular-nums font-bold"
                    />
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <Calculator className="w-3.5 h-3.5" />
                    <span>Resumen para comparativa ({turno})</span>
                  </div>
                  <p className="text-xs text-slate-600 font-mono tabular-nums">
                    Teórico esperado ({fmtQty(stockInicio)} + {fmtQty(numIngresos)} - {fmtQty(numMermas)}) ={' '}
                    {fmtQty(disponibleTeorico)}
                  </p>
                  {consumoCalculado !== null && difComparativa !== null ? (
                    <>
                      <p className="text-xs font-semibold text-slate-900 font-mono tabular-nums">
                        Consumo / Venta turno:{' '}
                        {consumoCalculado >= 0
                          ? fmtQty(consumoCalculado)
                          : `+${fmtQty(Math.abs(consumoCalculado))} (Sobrante)`}{' '}
                        {selectedProd?.unidad}
                      </p>
                      <p className="text-xs text-slate-500 font-mono tabular-nums">
                        Variación vs teórico:{' '}
                        {difComparativa > 0 ? `+${fmtQty(difComparativa)}` : fmtQty(difComparativa)}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-400">
                      Digita el conteo manual para calcular consumo y variación.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Observación (opcional)</label>
                  <input
                    type="text"
                    maxLength={200}
                    value={observacion}
                    onChange={(e) => setObservacion(e.target.value)}
                    placeholder="Ej. Cierre turno PM sin novedades, evento salón..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingCierre}
                  className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {savingCierre ? 'Guardando cierre...' : `Registrar Cierre Manual (${turno})`}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegistrarSalida} className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Registrar Salida o Merma (FEFO/FIFO)</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Descuenta automáticamente del lote más próximo a vencer o más antiguo en Barra Principal.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Producto</label>
                  <select
                    value={salProdId}
                    onChange={(e) => {
                      setSalProdId(e.target.value);
                      setSalCant('');
                    }}
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {estado.productos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} (Disponible: {fmtQty(p.bar)} {p.unidad})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de movimiento</label>
                    <select
                      value={salTipo}
                      onChange={(e) => setSalTipo(e.target.value as 'Salida' | 'Merma')}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="Salida">Salida (Consumo)</option>
                      <option value="Merma">Merma (Rotura / Pérdida)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Cantidad</label>
                    <input
                      type="number"
                      min="0.001"
                      step="any"
                      required
                      value={salCant}
                      onChange={(e) => setSalCant(e.target.value)}
                      placeholder="Ej. 1"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Motivo / Detalle</label>
                  <input
                    type="text"
                    maxLength={200}
                    value={salMotivo}
                    onChange={(e) => setSalMotivo(e.target.value)}
                    placeholder="Ej. Servicio terraza, botella quebrada, cortesía..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingSalida}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {savingSalida ? 'Procesando rebaja...' : 'Confirmar Salida / Merma'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* History Tables */}
        <div
          className={`${
            mode === 'planilla' || mode === 'recetas'
              ? 'lg:col-span-12 grid grid-cols-1 lg:grid-cols-2 gap-6'
              : 'lg:col-span-7 space-y-6'
          }`}
        >
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden lg:col-span-2">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Descuentos de Recetas Compuestas y Cortos por Turno (AM / PM)
                </h3>
                <p className="text-xs text-slate-500">
                  Trazabilidad de cócteles y cortos descontados del stock de Barra Principal
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {estado.consumosTurno.length} registros
              </span>
            </div>
            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3 text-left">Fecha / Turno</th>
                    <th className="py-2.5 px-3 text-left">Tipo</th>
                    <th className="py-2.5 px-3 text-left">Trago / Botella</th>
                    <th className="py-2.5 px-3 text-right">Porciones</th>
                    <th className="py-2.5 px-3 text-left">Detalle Descontado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {estado.consumosTurno.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500">
                        Sin descuentos de recetas o cortos registrados todavía.
                      </td>
                    </tr>
                  ) : (
                    estado.consumosTurno.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span className="font-mono text-slate-900">{c.fecha}</span>
                          <span className="mx-1 text-slate-300">·</span>
                          <span className="font-semibold text-slate-700">Turno {c.turno}</span>
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-700 whitespace-nowrap">
                          {c.tipo}
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-900">{c.nombre}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                          {fmtQty(c.cantidad_porciones)}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {c.detalle_descuento || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Historial de Cierres Manuales (AM / PM)</h3>
                <p className="text-xs text-slate-500">Registro de apertura, mermas, teórico y conteo manual</p>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {estado.cierres.length} registros
              </span>
            </div>
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3 text-left">Fecha / Turno</th>
                    <th className="py-2.5 px-3 text-left">Producto</th>
                    <th className="py-2.5 px-3 text-right">Teórico</th>
                    <th className="py-2.5 px-3 text-right">Cierre Manual</th>
                    <th className="py-2.5 px-3 text-right">Consumo</th>
                    <th className="py-2.5 px-3 text-right">Dif.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {estado.cierres.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        Aún no se han guardado cierres de turno.
                      </td>
                    </tr>
                  ) : (
                    estado.cierres.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="font-mono text-slate-900">{c.fecha}</div>
                          <div className="font-semibold text-slate-600">Turno {c.turno}</div>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-900">{c.producto}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                          {fmtQty(c.stock_teorico_esperado)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                          {fmtQty(c.stock_cierre)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                          {fmtQty(c.consumo_calculado)}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-mono tabular-nums font-semibold ${
                            c.diferencia_comparativa < 0
                              ? 'text-rose-700'
                              : c.diferencia_comparativa > 0
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {c.diferencia_comparativa > 0
                            ? `+${fmtQty(c.diferencia_comparativa)}`
                            : fmtQty(c.diferencia_comparativa)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">Movimientos Recientes de Barra</h3>
            </div>
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3 text-left">Fecha</th>
                    <th className="py-2.5 px-3 text-left">Tipo</th>
                    <th className="py-2.5 px-3 text-left">Producto</th>
                    <th className="py-2.5 px-3 text-right">Cantidad</th>
                    <th className="py-2.5 px-3 text-left">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {estado.movimientos.slice(0, 25).map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono text-slate-500 whitespace-nowrap">{m.fecha}</td>
                      <td className="py-2 px-3 font-semibold text-slate-800 whitespace-nowrap">{m.tipo}</td>
                      <td className="py-2 px-3 text-slate-900">{m.producto}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {fmtQty(m.cantidad)}
                      </td>
                      <td className="py-2 px-3 text-slate-600">{m.motivo || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
