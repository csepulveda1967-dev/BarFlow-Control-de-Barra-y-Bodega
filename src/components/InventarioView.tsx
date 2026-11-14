import React, { useMemo, useState } from 'react';
import { Search, AlertTriangle, CheckCircle2, XCircle, ArrowUpRight } from 'lucide-react';
import { PRODUCT_CATEGORIES, type EstadoApp, type Producto } from '../types';
import { fmtCLP, fmtQty } from '../lib/api';

interface InventarioViewProps {
  estado: EstadoApp;
  onQuickSalida: (producto: Producto) => void;
  onQuickSolicitar: (producto: Producto) => void;
}

export const InventarioView: React.FC<InventarioViewProps> = ({
  estado,
  onQuickSalida,
  onQuickSolicitar,
}) => {
  const isGerencia = estado.rol === 'Gerencia';
  const [search, setSearch] = useState('');
  const [categoriaFilter, setCategoriaFilter] = useState('Todas');
  const [statusFilter, setStatusFilter] = useState<'all' | 'low' | 'zero'>('all');

  const categorias = useMemo(() => {
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
    return ['Todas', ...ordered];
  }, [estado.productos, estado.categorias]);

  const alertasBar = useMemo(
    () => estado.productos.filter((p) => p.bar < p.stock_minimo),
    [estado.productos]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return estado.productos.filter((p) => {
      if (categoriaFilter !== 'Todas' && p.categoria !== categoriaFilter) return false;
      if (statusFilter === 'low' && p.bar >= p.stock_minimo) return false;
      if (statusFilter === 'zero' && p.bar > 0) return false;
      if (q && !p.nombre.toLowerCase().includes(q) && !p.codigo.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [estado.productos, search, categoriaFilter, statusFilter]);

  const renderStatus = (p: Producto) => {
    if (p.bar <= 0) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          Sin stock
        </span>
      );
    }
    if (p.bar < p.stock_minimo) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Bajo mínimo
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        Operativo
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Alerta de Baja de Stock exclusiva para el Encargado de Barra */}
      {!isGerencia && alertasBar.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
              <div>
                <h2 className="text-sm font-semibold text-amber-950">
                  Alerta de Baja de Stock en Barra ({alertasBar.length} productos)
                </h2>
                <p className="text-xs text-amber-800">
                  Los siguientes licores o bebidas están por debajo del mínimo operativo. Solicita reposición a Bodega Central.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setStatusFilter('low')}
              className="px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Ver solo alertas en tabla
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {alertasBar.slice(0, 6).map((p) => (
              <div
                key={p.id}
                className="bg-white border border-amber-200/80 rounded-lg px-3.5 py-2.5 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate">{p.nombre}</p>
                  <p className="text-xs font-mono tabular-nums text-rose-700 mt-0.5">
                    Actual: {fmtQty(p.bar)} · Mín: {fmtQty(p.stock_minimo)} {p.unidad}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onQuickSolicitar(p)}
                  className="px-2.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Pedir
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Strip */}
      <div className={`grid gap-4 ${isGerencia ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-3'}`}>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Catálogo activo de Barra</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {estado.kpis.totalProductos}
          </p>
          <p className="mt-1 text-xs text-slate-500">{Math.max(0, categorias.length - 1)} categorías activas</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Alertas bajo mínimo</p>
          <p className={`mt-2 text-2xl font-bold font-mono tabular-nums ${estado.kpis.alertasMinimo > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
            {estado.kpis.alertasMinimo}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {estado.kpis.sinStock} sin existencias en barra
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Pedidos por recibir en Barra</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {estado.kpis.porRecibirBar}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {estado.kpis.solicitudesPendientes} pendientes de despacho
          </p>
        </div>

        {isGerencia && (
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-500">Valorizado Barra / Central</p>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {fmtCLP(estado.kpis.valorBar)}
            </p>
            <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
              Central: {fmtCLP(estado.kpis.valorCentral)}
            </p>
          </div>
        )}
      </div>

      {/* Category quick selector */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {categorias.map((c) => {
          const active = categoriaFilter === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCategoriaFilter(c)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {c}
            </button>
          );
        })}
      </div>

      {/* Filters & Data Grid */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o código..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start lg:self-auto">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos ({estado.productos.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('low')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                statusFilter === 'low' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Bajo mínimo ({estado.kpis.alertasMinimo})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('zero')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                statusFilter === 'zero' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sin stock ({estado.kpis.sinStock})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4 text-left">Código</th>
                <th className="py-3 px-4 text-left">Producto / Categoría</th>
                {isGerencia && <th className="py-3 px-4 text-right">Stock Inicial</th>}
                <th className="py-3 px-4 text-right">Stock Barra</th>
                <th className="py-3 px-4 text-right">Mínimo</th>
                {isGerencia && <th className="py-3 px-4 text-right">Bodega Central</th>}
                {isGerencia && <th className="py-3 px-4 text-right">Valor Barra</th>}
                <th className="py-3 px-4 text-left">Estado</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isGerencia ? 9 : 6} className="py-12 px-4 text-center text-slate-500">
                    No se encontraron productos con los filtros actuales.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {p.codigo}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{p.nombre}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <span className="font-medium text-slate-700">{p.categoria}</span>
                        <span aria-hidden="true">·</span>
                        <span>{p.unidad}</span>
                        {p.tipo_envase && p.contenido_envase && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>
                              {p.contenido_envase} {p.unidad_contenido} ({p.tipo_envase})
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                    {isGerencia && (
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                        {fmtQty(p.stock_inicial_sistema)}
                      </td>
                    )}
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {fmtQty(p.bar)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {fmtQty(p.stock_minimo)}
                    </td>
                    {isGerencia && (
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {fmtQty(p.central)}
                      </td>
                    )}
                    {isGerencia && (
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                        {fmtCLP(p.valor_bar)}
                      </td>
                    )}
                    <td className="py-3 px-4">{renderStatus(p)}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onQuickSalida(p)}
                          disabled={p.bar <= 0}
                          className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Salida / Merma
                        </button>
                        <button
                          type="button"
                          onClick={() => onQuickSolicitar(p)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <span>Pedir</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
