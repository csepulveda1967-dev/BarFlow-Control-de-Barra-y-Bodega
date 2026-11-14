import React, { useState } from 'react';
import { Edit3, MessageCircle, Plus, Search, Trash2, Users, X } from 'lucide-react';
import type { EstadoApp, Proveedor } from '../types';
import { apiRequest, buildWhatsAppUrl } from '../lib/api';

interface ProveedoresViewProps {
  token: string;
  estado: EstadoApp;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

export const ProveedoresView: React.FC<ProveedoresViewProps> = ({
  token,
  estado,
  onRefresh,
  onNotify,
}) => {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Proveedor | null>(null);

  const [nombre, setNombre] = useState('');
  const [contacto, setContacto] = useState('');
  const [telefonoWsp, setTelefonoWsp] = useState('');
  const [email, setEmail] = useState('');
  const [categoria, setCategoria] = useState('Licores y Destilados');
  const [rut, setRut] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = estado.proveedores.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.nombre.toLowerCase().includes(q) ||
      p.categoria.toLowerCase().includes(q) ||
      (p.contacto || '').toLowerCase().includes(q)
    );
  });

  const openCreate = () => {
    setEditing(null);
    setNombre('');
    setContacto('');
    setTelefonoWsp('+569');
    setEmail('');
    setCategoria('Licores y Destilados');
    setRut('');
    setNotas('');
    setShowModal(true);
  };

  const openEdit = (p: Proveedor) => {
    setEditing(p);
    setNombre(p.nombre);
    setContacto(p.contacto || '');
    setTelefonoWsp(p.telefono_wsp);
    setEmail(p.email || '');
    setCategoria(p.categoria);
    setRut(p.rut || '');
    setNotas(p.notas || '');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        nombre,
        contacto: contacto || null,
        telefono_wsp: telefonoWsp,
        email: email || null,
        categoria,
        rut: rut || null,
        notas: notas || null,
      };
      if (editing) {
        await apiRequest(`/proveedores/${editing.id}`, { method: 'PATCH', token, body: payload });
        onNotify('Proveedor actualizado');
      } else {
        await apiRequest('/proveedores', { method: 'POST', token, body: payload });
        onNotify('Proveedor creado en directorio');
      }
      await onRefresh();
      setShowModal(false);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error guardando proveedor', true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiRequest(`/proveedores/${id}`, { method: 'DELETE', token });
      await onRefresh();
      onNotify('Proveedor eliminado del directorio');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error eliminando proveedor', true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Directorio de Proveedores y Pedidos WhatsApp</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Administra tus distribuidores de licores, cervezas e insumos y envía órdenes de reposición directo por WSP.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar proveedor..."
              className="pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            />
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Proveedor</span>
          </button>
        </div>
      </div>

      {/* Supplier Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((p) => {
          const wspMessage = `Hola ${p.contacto || p.nombre}, te escribimos de Barra / Centro de Eventos para solicitar cotización y despacho de reposición.`;
          const wspUrl = buildWhatsAppUrl(p.telefono_wsp, wspMessage);

          return (
            <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-slate-500">{p.categoria}</p>
                    <h3 className="text-sm font-bold text-slate-900 mt-0.5">{p.nombre}</h3>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      title="Editar proveedor"
                      className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id)}
                      title="Eliminar proveedor"
                      className="p-1.5 text-slate-400 hover:text-rose-700 rounded-md cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="text-xs text-slate-600 space-y-1 pt-1">
                  {p.contacto && (
                    <p>
                      <span className="font-semibold text-slate-800">Contacto:</span> {p.contacto}
                    </p>
                  )}
                  <p className="font-mono">
                    <span className="font-sans font-semibold text-slate-800">WhatsApp:</span> {p.telefono_wsp}
                  </p>
                  {p.email && (
                    <p className="truncate">
                      <span className="font-semibold text-slate-800">Correo:</span> {p.email}
                    </p>
                  )}
                  {p.rut && (
                    <p className="font-mono">
                      <span className="font-sans font-semibold text-slate-800">RUT:</span> {p.rut}
                    </p>
                  )}
                  {p.notas && <p className="text-slate-500 pt-1">{p.notas}</p>}
                </div>
              </div>

              <a
                href={wspUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg transition-colors whitespace-nowrap"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Enviar Pedido por WSP</span>
              </a>
            </div>
          );
        })}
      </div>

      {/* Create/Edit Supplier Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                {editing ? 'Editar Proveedor' : 'Nuevo Proveedor'}
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
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Razón Social / Nombre</label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Ejecutivo / Contacto</label>
                  <input
                    type="text"
                    value={contacto}
                    onChange={(e) => setContacto(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Teléfono WhatsApp (+569...)</label>
                  <input
                    type="text"
                    required
                    value={telefonoWsp}
                    onChange={(e) => setTelefonoWsp(e.target.value)}
                    placeholder="+56984123456"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Rubro / Categoría</label>
                  <input
                    type="text"
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">RUT</label>
                  <input
                    type="text"
                    value={rut}
                    onChange={(e) => setRut(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Correo electrónico</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notas de despacho</label>
                <input
                  type="text"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Días de reparto, pedido mínimo..."
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
                  {saving ? 'Guardando...' : 'Guardar Proveedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
