import React, { useEffect, useRef, useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import type { EstadoApp, Producto } from '../types';
import { apiRequest, fmtQty } from '../lib/api';

interface SolicitudPedidosViewProps {
  token: string;
  estado: EstadoApp;
  preselectedProducto?: Producto | null;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

export const SolicitudPedidosView: React.FC<SolicitudPedidosViewProps> = ({
  token,
  estado,
  preselectedProducto,
  onRefresh,
  onNotify,
}) => {
  const [prodId, setProdId] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [tipoSolicitud, setTipoSolicitud] = useState('Libre / Evento');
  const [observacion, setObservacion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [generatingMin, setGeneratingMin] = useState(false);
  const lastPreselectedIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (preselectedProducto) {
      if (lastPreselectedIdRef.current !== preselectedProducto.id) {
        lastPreselectedIdRef.current = preselectedProducto.id;
        setProdId(String(preselectedProducto.id));
        setCantidad('');
      }
      return;
    }
    lastPreselectedIdRef.current = null;
    if (estado.productos.length > 0) {
      setProdId((prev) => (prev ? prev : String(estado.productos[0].id)));
    }
  }, [preselectedProducto, estado.productos]);

  const handleCrearLibre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodId) return onNotify('Selecciona un producto', true);
    const cantNum = Number(cantidad);
    if (!cantidad.trim() || !Number.isFinite(cantNum) || cantNum <= 0) {
      return onNotify('Ingresa una cantidad válida mayor a 0', true);
    }
    setSubmitting(true);
    try {
      await apiRequest('/solicitudes', {
        method: 'POST',
        token,
        body: {
          producto_id: Number(prodId),
          cantidad: cantNum,
          tipo_solicitud: tipoSolicitud,
          observacion: observacion || 'Solicitud encargada de barra',
        },
      });
      await onRefresh();
      setCantidad('');
      setObservacion('');
      onNotify('Pedido enviado a Bodega Central / Gerencia');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error al enviar solicitud', true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerarSugeridos = async () => {
    setGeneratingMin(true);
    try {
      const res = await apiRequest<{ ok: boolean; creados: number }>('/solicitudes/sugerido-minimo', {
        method: 'POST',
        token,
      });
      await onRefresh();
      if (res.creados === 0) {
        onNotify('Todos los productos bajo mínimo ya tienen una solicitud activa');
      } else {
        onNotify(`Se generaron ${res.creados} solicitudes sugeridas por stock mínimo`);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'No se pudieron generar sugeridos', true);
    } finally {
      setGeneratingMin(false);
    }
  };

  const bajoMinimo = estado.productos.filter((p) => p.bar < p.stock_minimo);

  const renderEstadoSolicitud = (s: EstadoApp['solicitudes'][number]) => {
    if (s.estado === 'Pendiente') {
      return <span className="text-xs font-semibold text-amber-700">Pendiente despacho</span>;
    }
    if (s.estado === 'Despachada') {
      return <span className="text-xs font-semibold text-sky-700">En tránsito a Barra</span>;
    }
    if (s.estado === 'Recibida') {
      return <span className="text-xs font-semibold text-emerald-700">Recibida en Barra</span>;
    }
    return <span className="text-xs font-semibold text-rose-700">Rechazada</span>;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-slate-900">Nueva Solicitud de Pedido a Bodega</h2>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            Solicita reposición de turno o mercadería para matrimonios y eventos directamente a Bodega Central.
          </p>

          <form onSubmit={handleCrearLibre} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Producto</label>
              <select
                value={prodId}
                onChange={(e) => setProdId(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {estado.productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} ({p.unidad} · Barra: {fmtQty(p.bar)})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cantidad a pedir</label>
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  required
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  placeholder="Ej. 4"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de pedido</label>
                <select
                  value={tipoSolicitud}
                  onChange={(e) => setTipoSolicitud(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Libre / Evento">Libre / Evento</option>
                  <option value="Reposición">Reposición turno</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Motivo o Nombre del Evento</label>
              <input
                type="text"
                maxLength={250}
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder="Ej. Matrimonio Salón Principal sábado, refuerzo barra terraza..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? 'Enviando pedido...' : 'Enviar Solicitud de Pedido'}</span>
            </button>
          </form>
        </div>

        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Sugeridos por Stock Mínimo</h2>
              <p className="text-xs text-slate-500 mt-1">
                Productos en Barra por debajo de su mínimo configurado.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerarSugeridos}
              disabled={generatingMin || bajoMinimo.length === 0}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{generatingMin ? 'Generando...' : 'Pedir Sugeridos'}</span>
            </button>
          </div>

          {bajoMinimo.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
              Todos los productos de Barra cumplen con su stock mínimo.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2 px-3 text-left">Producto</th>
                    <th className="py-2 px-3 text-right">Actual</th>
                    <th className="py-2 px-3 text-right">Mínimo</th>
                    <th className="py-2 px-3 text-right">Sugerido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {bajoMinimo.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 px-3 font-medium text-slate-900">{p.nombre}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-rose-700 font-semibold">
                        {fmtQty(p.bar)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                        {fmtQty(p.stock_minimo)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                        +{fmtQty(Math.max(0, p.stock_minimo - p.bar))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Request History */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Historial de Solicitudes de Pedidos</h3>
        </div>
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2.5 px-4 text-left">Fecha</th>
                <th className="py-2.5 px-4 text-left">Producto</th>
                <th className="py-2.5 px-4 text-left">Tipo / Motivo</th>
                <th className="py-2.5 px-4 text-right">Pedida</th>
                <th className="py-2.5 px-4 text-right">Despachada</th>
                <th className="py-2.5 px-4 text-right">Recibida</th>
                <th className="py-2.5 px-4 text-left">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {estado.solicitudes.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-mono text-slate-500 whitespace-nowrap">{s.fecha}</td>
                  <td className="py-2.5 px-4 font-medium text-slate-900">{s.producto}</td>
                  <td className="py-2.5 px-4 text-slate-600">
                    {s.tipo_solicitud}
                    {s.observacion ? ` · ${s.observacion}` : ''}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                    {fmtQty(s.cantidad_solicitada)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                    {s.cantidad_despachada != null ? fmtQty(s.cantidad_despachada) : '—'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                    {s.cantidad_entregada != null ? fmtQty(s.cantidad_entregada) : '—'}
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap">{renderEstadoSolicitud(s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
