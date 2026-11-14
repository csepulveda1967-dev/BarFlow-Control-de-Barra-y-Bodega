import React, { useEffect, useState } from 'react';
import { PackageCheck, Truck } from 'lucide-react';
import type { EstadoApp } from '../types';
import { apiRequest, fmtQty } from '../lib/api';

interface RecepcionBodegaViewProps {
  token: string;
  estado: EstadoApp;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

export const RecepcionBodegaView: React.FC<RecepcionBodegaViewProps> = ({
  token,
  estado,
  onRefresh,
  onNotify,
}) => {
  const [cantidadesRecibidas, setCantidadesRecibidas] = useState<Record<number, string>>({});
  const [receivingId, setReceivingId] = useState<number | null>(null);

  useEffect(() => {
    const next: Record<number, string> = {};
    for (const s of estado.solicitudes) {
      if (s.estado === 'Despachada') {
        next[s.id] = String(s.cantidad_despachada ?? s.cantidad_solicitada);
      }
    }
    setCantidadesRecibidas(next);
  }, [estado.solicitudes]);

  const handleRecibir = async (id: number) => {
    const val = Number(cantidadesRecibidas[id]);
    if (!Number.isFinite(val) || val < 0) {
      return onNotify('Ingresa una cantidad real válida', true);
    }
    setReceivingId(id);
    try {
      await apiRequest(`/solicitudes/${id}/recibir`, {
        method: 'POST',
        token,
        body: { cantidad_recibida: val },
      });
      await onRefresh();
      onNotify(`Recepción confirmada: +${fmtQty(val)} ingresados a Barra Principal`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error al confirmar recepción', true);
    } finally {
      setReceivingId(null);
    }
  };

  const despachadas = estado.solicitudes.filter((s) => s.estado === 'Despachada');
  const recibidas = estado.solicitudes.filter((s) => s.estado === 'Recibida');

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Truck className="w-5 h-5 text-slate-700 shrink-0" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">Recepción de Mercadería en Barra (Ajustable)</h2>
              <p className="text-xs text-slate-500">
                Verifica las unidades recibidas desde Bodega Central antes de ingresar el lote a Barra Principal.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono tabular-nums font-semibold text-slate-700 whitespace-nowrap">
            {despachadas.length} por recibir
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4 text-left">ID / Fecha</th>
                <th className="py-3 px-4 text-left">Producto</th>
                <th className="py-3 px-4 text-left">Tipo / Motivo</th>
                <th className="py-3 px-4 text-right">Despachado</th>
                <th className="py-3 px-4 text-right">Cantidad Real Recibida</th>
                <th className="py-3 px-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {despachadas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 px-4 text-center text-sm text-slate-500">
                    No hay despachos en tránsito pendientes de recepción.
                  </td>
                </tr>
              ) : (
                despachadas.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                      #{s.id} · {s.fecha_despacho || s.fecha}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {s.producto} <span className="text-xs text-slate-500">({s.unidad})</span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      <span className="font-semibold text-slate-800">{s.tipo_solicitud}</span>
                      {s.observacion && <span> · {s.observacion}</span>}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {fmtQty(s.cantidad_despachada ?? s.cantidad_solicitada)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={cantidadesRecibidas[s.id] ?? ''}
                        onChange={(e) =>
                          setCantidadesRecibidas((prev) => ({ ...prev, [s.id]: e.target.value }))
                        }
                        className="w-24 px-2.5 py-1.5 text-sm text-right border border-amber-400 bg-amber-50 rounded-lg font-mono tabular-nums font-bold"
                      />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        disabled={receivingId === s.id}
                        onClick={() => handleRecibir(s.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <PackageCheck className="w-3.5 h-3.5" />
                        <span>{receivingId === s.id ? 'Recibiendo...' : 'Recibir Real'}</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Received History */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Recepciones Confirmadas en Barra</h3>
        </div>
        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2.5 px-4 text-left">Fecha Recepción</th>
                <th className="py-2.5 px-4 text-left">Producto</th>
                <th className="py-2.5 px-4 text-right">Despachado</th>
                <th className="py-2.5 px-4 text-right">Recibido Real</th>
                <th className="py-2.5 px-4 text-left">Observación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {recibidas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    Aún no hay recepciones confirmadas.
                  </td>
                </tr>
              ) : (
                recibidas.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                      {s.fecha_recepcion || s.fecha}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{s.producto}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                      {fmtQty(s.cantidad_despachada ?? s.cantidad_solicitada)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                      {fmtQty(s.cantidad_entregada)}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">{s.observacion || '—'}</td>
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
