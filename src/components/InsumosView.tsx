import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Edit3,
  FolderPlus,
  Lock,
  MessageCircle,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import {
  DEFAULT_ALL_CATEGORIES,
  type EstadoApp,
  type Insumo,
  type InsumoControlConfig,
} from '../types';
import { apiRequest, buildWhatsAppUrl, fmtCLP, fmtQty } from '../lib/api';

interface InsumosViewProps {
  token: string;
  estado: EstadoApp;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

const CRITERIOS_INCORPORACION = [
  'Reposición bajo mínimo',
  'Evento / Fin de semana',
  'Urgencia de turno',
  'Nuevo requerimiento de carta',
  'Stock de seguridad',
  'Rotura o reposición de vajilla',
  'Personalizado...',
] as const;

const CRITERIOS_ESTANDAR = CRITERIOS_INCORPORACION.filter((c) => c !== 'Personalizado...');

export const InsumosView: React.FC<InsumosViewProps> = ({
  token,
  estado,
  onRefresh,
  onNotify,
}) => {
  const isGerencia = estado.rol === 'Gerencia';
  const control = estado.insumoControl;
  const canEditCatalog = isGerencia || Boolean(control?.permitir_crear_items_bar);

  // Gerencia Control Panel state
  const [showControlPanel, setShowControlPanel] = useState(false);
  const [ctrlDraft, setCtrlDraft] = useState<InsumoControlConfig>(() => control);
  const [ctrlMaxItemsText, setCtrlMaxItemsText] = useState<string>(() =>
    control?.max_items_por_solicitud != null ? String(control.max_items_por_solicitud) : ''
  );
  const [savingControl, setSavingControl] = useState(false);

  useEffect(() => {
    setCtrlDraft(control);
    setCtrlMaxItemsText(
      control?.max_items_por_solicitud != null ? String(control.max_items_por_solicitud) : ''
    );
  }, [control]);

  // Per-item max limit inline drafts (Gerencia)
  const [itemMaxDrafts, setItemMaxDrafts] = useState<Record<number, string>>({});
  const [solAdjustQtys, setSolAdjustQtys] = useState<Record<number, string>>({});

  // Dropdown selectors & filters
  const [selectedCatFilter, setSelectedCatFilter] = useState<string>('Todas');
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [selectedProvFilter, setSelectedProvFilter] = useState<string>('Todos');
  const [search, setSearch] = useState('');

  // Expandable / collapsible categories ("opción de abrir categorías")
  const [openCats, setOpenCats] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const ins of estado.insumos) {
      initial[ins.categoria || 'Insumos de Barra'] = true;
    }
    return initial;
  });

  // Inline category creation & rename
  const [showNewCatBar, setShowNewCatBar] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [savingCat, setSavingCat] = useState(false);
  const [renamingCat, setRenamingCat] = useState<string | null>(null);
  const [renameCatValue, setRenameCatValue] = useState('');

  // Quick stock movement & multi-item solicitud quantities (start blank)
  const [movQtys, setMovQtys] = useState<Record<number, string>>({});
  const [solicitudQtys, setSolicitudQtys] = useState<Record<number, string>>({});
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Formal multi-item Solicitud form controls
  const availableCriteriaForUser = useMemo(() => {
    if (isGerencia) return [...CRITERIOS_INCORPORACION];
    const approved =
      control?.criterios_permitidos_bar && control.criterios_permitidos_bar.length > 0
        ? control.criterios_permitidos_bar
        : [...CRITERIOS_ESTANDAR];
    return control?.permitir_criterio_personalizado_bar
      ? [...approved, 'Personalizado...']
      : approved;
  }, [isGerencia, control]);

  const [solCriterioSelect, setSolCriterioSelect] = useState<string>(
    () => availableCriteriaForUser[0] || CRITERIOS_INCORPORACION[0]
  );
  useEffect(() => {
    if (!availableCriteriaForUser.includes(solCriterioSelect)) {
      setSolCriterioSelect(availableCriteriaForUser[0] || CRITERIOS_INCORPORACION[0]);
    }
  }, [availableCriteriaForUser, solCriterioSelect]);

  const [solCriterioCustom, setSolCriterioCustom] = useState('');
  const [solProveedorId, setSolProveedorId] = useState<string>(
    estado.proveedores[0] ? String(estado.proveedores[0].id) : ''
  );
  const [solObservacion, setSolObservacion] = useState('');
  const [savingSol, setSavingSol] = useState(false);
  const [updatingSolId, setUpdatingSolId] = useState<number | null>(null);

  // Create / Edit Insumo Modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Insumo | null>(null);
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('Insumos de Barra');
  const [showModalNewCat, setShowModalNewCat] = useState(false);
  const [modalNewCatName, setModalNewCatName] = useState('');
  const [criterioSelect, setCriterioSelect] = useState<string>(CRITERIOS_INCORPORACION[0]);
  const [criterioCustom, setCriterioCustom] = useState('');
  const [unidad, setUnidad] = useState('unidad');
  const [stockActual, setStockActual] = useState('');
  const [stockMinimo, setStockMinimo] = useState('');
  const [costoUnitario, setCostoUnitario] = useState('');
  const [proveedorId, setProveedorId] = useState<string>('');
  const [solicitableBar, setSolicitableBar] = useState(true);
  const [maxPorSolicitud, setMaxPorSolicitud] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});

  // Master sorted & deduplicated categories
  const allCategories = useMemo(() => {
    const ordered: string[] = [];
    const seen = new Set<string>();
    const add = (cat?: string | null) => {
      const clean = String(cat || '').trim();
      if (!clean) return;
      const key = clean.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push(clean);
      }
    };
    for (const c of estado.categorias || []) add(c);
    for (const c of DEFAULT_ALL_CATEGORIES) add(c);
    for (const ins of estado.insumos) add(ins.categoria);
    return ordered;
  }, [estado.categorias, estado.insumos]);

  // Pending insumo IDs & allowed category set for Bar governance
  const pendingInsumoIds = useMemo(() => {
    return new Set(
      (estado.solicitudesInsumos || [])
        .filter((s) => s.estado === 'Pendiente' && s.insumo_id != null)
        .map((s) => s.insumo_id as number)
    );
  }, [estado.solicitudesInsumos]);

  const allowedCatsSet = useMemo(() => {
    return new Set((control?.categorias_permitidas_bar || []).map((c) => c.trim().toLowerCase()));
  }, [control?.categorias_permitidas_bar]);

  const getRequestBlockReason = (ins: Insumo): string | null => {
    if (isGerencia) return null;
    if (ins.solicitable_por_bar === false) return 'Bloqueado por Gerencia';
    const cat = (ins.categoria || 'Insumos de Barra').trim().toLowerCase();
    if (control?.restringir_categorias_bar && !allowedCatsSet.has(cat)) {
      return 'Categoría restringida';
    }
    if (control?.solo_bajo_minimo && ins.stock_actual >= ins.stock_minimo) {
      return 'Stock OK (solo bajo mín.)';
    }
    if (control?.bloquear_duplicados_pendientes && pendingInsumoIds.has(ins.id)) {
      return 'Solicitud pendiente';
    }
    return null;
  };

  // Filtered insumos
  const filteredInsumos = useMemo(() => {
    const q = search.trim().toLowerCase();
    return estado.insumos.filter((ins) => {
      const cat = ins.categoria || 'Insumos de Barra';
      if (selectedCatFilter !== 'Todas' && cat !== selectedCatFilter) return false;
      if (selectedProvFilter === 'SinProveedor' && ins.proveedor_id !== null) return false;
      if (
        selectedProvFilter !== 'Todos' &&
        selectedProvFilter !== 'SinProveedor' &&
        String(ins.proveedor_id || '') !== selectedProvFilter
      ) {
        return false;
      }
      if (q) {
        const hay = `${ins.nombre} ${ins.codigo} ${cat} ${ins.criterio || ''} ${ins.notas || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [estado.insumos, selectedCatFilter, selectedProvFilter, search]);

  // Categories to render as expandable accordions
  const visibleCategories = useMemo(() => {
    const cats =
      selectedCatFilter !== 'Todas'
        ? [selectedCatFilter]
        : allCategories.filter((c) => {
            if (!search.trim() && selectedProvFilter === 'Todos') return true;
            return filteredInsumos.some((i) => (i.categoria || 'Insumos de Barra') === c);
          });
    return cats;
  }, [selectedCatFilter, allCategories, filteredInsumos, search, selectedProvFilter]);

  // Selected multi-item solicitud list
  const selectedSolicitudItems = useMemo(() => {
    const items: Array<{ insumo: Insumo; cantidad: number; exceedsMax: boolean }> = [];
    for (const ins of estado.insumos) {
      if (getRequestBlockReason(ins)) continue;
      const raw = (solicitudQtys[ins.id] || '').trim();
      if (!raw) continue;
      const qty = Number(raw);
      if (Number.isFinite(qty) && qty > 0) {
        const exceedsMax =
          !isGerencia &&
          ins.max_por_solicitud != null &&
          ins.max_por_solicitud > 0 &&
          qty > ins.max_por_solicitud;
        items.push({ insumo: ins, cantidad: qty, exceedsMax });
      }
    }
    return items;
  }, [estado.insumos, solicitudQtys, isGerencia, control, pendingInsumoIds, allowedCatsSet]);

  const anyExceedsItemMax = selectedSolicitudItems.some((x) => x.exceedsMax);
  const exceedsLineLimit =
    !isGerencia &&
    control?.max_items_por_solicitud != null &&
    selectedSolicitudItems.length > control.max_items_por_solicitud;

  const effectiveSolCriterio =
    solCriterioSelect === 'Personalizado...'
      ? solCriterioCustom.trim() || 'Solicitud operativa'
      : solCriterioSelect;

  const selectedSolProv = useMemo(
    () => estado.proveedores.find((p) => String(p.id) === solProveedorId) || null,
    [estado.proveedores, solProveedorId]
  );

  const multiWspUrl = useMemo(() => {
    if (!selectedSolProv || selectedSolicitudItems.length === 0) return null;
    const lines = selectedSolicitudItems
      .map(
        ({ insumo, cantidad }) =>
          `• ${insumo.nombre} (${insumo.categoria}): ${fmtQty(cantidad)} ${insumo.unidad}`
      )
      .join('\n');
    const msg = `Hola ${selectedSolProv.contacto || selectedSolProv.nombre}, solicitamos pedido para BarFlow (${effectiveSolCriterio}):\n${lines}${
      solObservacion.trim() ? `\nNota: ${solObservacion.trim()}` : ''
    }`;
    return buildWhatsAppUrl(selectedSolProv.telefono_wsp, msg);
  }, [selectedSolProv, selectedSolicitudItems, effectiveSolCriterio, solObservacion]);

  const handleSaveControl = async (e: React.FormEvent) => {
    e.preventDefault();
    const maxLines =
      ctrlMaxItemsText.trim() === '' ? null : Math.floor(Number(ctrlMaxItemsText));
    if (maxLines !== null && (!Number.isFinite(maxLines) || maxLines <= 0)) {
      return onNotify('El máximo de líneas por solicitud debe ser un entero mayor a 0', true);
    }
    setSavingControl(true);
    try {
      await apiRequest('/insumos/control', {
        method: 'PUT',
        token,
        body: {
          ...ctrlDraft,
          max_items_por_solicitud: maxLines,
        },
      });
      await onRefresh();
      onNotify('Límites y políticas de control de Gerencia actualizados');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error guardando límites de control', true);
    } finally {
      setSavingControl(false);
    }
  };

  const handleToggleItemSolicitable = async (ins: Insumo) => {
    setProcessingId(ins.id);
    try {
      const nextVal = !(ins.solicitable_por_bar ?? true);
      await apiRequest(`/insumos/${ins.id}`, {
        method: 'PATCH',
        token,
        body: { solicitable_por_bar: nextVal },
      });
      await onRefresh();
      onNotify(
        nextVal
          ? `"${ins.nombre}" habilitado para solicitudes de Barra`
          : `"${ins.nombre}" bloqueado para solicitudes de Barra`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error actualizando permiso', true);
    } finally {
      setProcessingId(null);
    }
  };

  const handleSaveItemMax = async (ins: Insumo) => {
    const raw =
      itemMaxDrafts[ins.id] !== undefined
        ? itemMaxDrafts[ins.id].trim()
        : ins.max_por_solicitud != null
        ? String(ins.max_por_solicitud)
        : '';
    const nextMax = raw === '' ? null : Number(raw);
    if (nextMax !== null && (!Number.isFinite(nextMax) || nextMax <= 0)) {
      return onNotify('El límite máximo debe ser mayor a 0 (o dejar vacío para sin tope)', true);
    }
    setProcessingId(ins.id);
    try {
      await apiRequest(`/insumos/${ins.id}`, {
        method: 'PATCH',
        token,
        body: { max_por_solicitud: nextMax },
      });
      setItemMaxDrafts((prev) => {
        const copy = { ...prev };
        delete copy[ins.id];
        return copy;
      });
      await onRefresh();
      onNotify(
        nextMax !== null
          ? `Límite de "${ins.nombre}" fijado en máx. ${fmtQty(nextMax)} ${ins.unidad} por solicitud`
          : `Se quitó el tope de cantidad de "${ins.nombre}"`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error guardando límite máximo', true);
    } finally {
      setProcessingId(null);
    }
  };

  const handleToggleCat = (cat: string) => {
    setOpenCats((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const handleOpenAllCats = () => {
    const next: Record<string, boolean> = {};
    for (const c of allCategories) next[c] = true;
    setOpenCats(next);
  };

  const handleCloseAllCats = () => {
    setOpenCats({});
  };

  const handleSelectItemFromDropdown = (idStr: string) => {
    setSelectedItemId(idStr);
    if (!idStr) return;
    const item = estado.insumos.find((i) => String(i.id) === idStr);
    if (!item) return;
    const cat = item.categoria || 'Insumos de Barra';
    if (selectedCatFilter !== 'Todas' && selectedCatFilter !== cat) {
      setSelectedCatFilter('Todas');
    }
    if (selectedProvFilter !== 'Todos') {
      setSelectedProvFilter('Todos');
    }
    setSearch('');
    setOpenCats((prev) => ({ ...prev, [cat]: true }));
    setTimeout(() => {
      const el = rowRefs.current[item.id];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 60);
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCatName.trim();
    if (clean.length < 2) {
      return onNotify('Ingresa un nombre de categoría válido (mínimo 2 caracteres)', true);
    }
    setSavingCat(true);
    try {
      const res = await apiRequest<{ ok: boolean; categoria: { nombre: string } }>('/categorias', {
        method: 'POST',
        token,
        body: { nombre: clean },
      });
      await onRefresh();
      const created = res.categoria?.nombre || clean;
      setOpenCats((prev) => ({ ...prev, [created]: true }));
      setSelectedCatFilter(created);
      setNewCatName('');
      setShowNewCatBar(false);
      onNotify(`Categoría "${created}" creada y abierta`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error creando categoría', true);
    } finally {
      setSavingCat(false);
    }
  };

  const handleRenameCategory = async (oldName: string) => {
    const next = renameCatValue.trim();
    if (next.length < 2) {
      return onNotify('Ingresa un nuevo nombre válido (mínimo 2 caracteres)', true);
    }
    if (next === oldName) {
      setRenamingCat(null);
      return;
    }
    setSavingCat(true);
    try {
      await apiRequest('/categorias', {
        method: 'PATCH',
        token,
        body: { oldNombre: oldName, newNombre: next },
      });
      await onRefresh();
      setOpenCats((prev) => ({ ...prev, [next]: true }));
      if (selectedCatFilter === oldName) setSelectedCatFilter(next);
      setRenamingCat(null);
      onNotify(`Categoría "${oldName}" renombrada a "${next}"`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error renombrando categoría', true);
    } finally {
      setSavingCat(false);
    }
  };

  const openCreate = (preCat?: string) => {
    setEditing(null);
    setCodigo('');
    setNombre('');
    setCategoria(preCat || (selectedCatFilter !== 'Todas' ? selectedCatFilter : 'Insumos de Barra'));
    setShowModalNewCat(false);
    setModalNewCatName('');
    setCriterioSelect(CRITERIOS_INCORPORACION[0]);
    setCriterioCustom('');
    setUnidad('unidad');
    setStockActual('');
    setStockMinimo('');
    setCostoUnitario('');
    setProveedorId(estado.proveedores[0] ? String(estado.proveedores[0].id) : '');
    setSolicitableBar(true);
    setMaxPorSolicitud('');
    setNotas('');
    setShowModal(true);
  };

  const openEdit = (ins: Insumo) => {
    setEditing(ins);
    setCodigo(ins.codigo);
    setNombre(ins.nombre);
    setCategoria(ins.categoria || 'Insumos de Barra');
    setShowModalNewCat(false);
    setModalNewCatName('');
    const currentCrit = ins.criterio || CRITERIOS_INCORPORACION[0];
    if (
      (CRITERIOS_INCORPORACION as readonly string[]).includes(currentCrit) &&
      currentCrit !== 'Personalizado...'
    ) {
      setCriterioSelect(currentCrit);
      setCriterioCustom('');
    } else {
      setCriterioSelect('Personalizado...');
      setCriterioCustom(currentCrit);
    }
    setUnidad(ins.unidad);
    setStockActual(String(ins.stock_actual));
    setStockMinimo(String(ins.stock_minimo));
    setCostoUnitario(String(ins.costo_unitario ?? 0));
    setProveedorId(ins.proveedor_id ? String(ins.proveedor_id) : '');
    setSolicitableBar(ins.solicitable_por_bar ?? true);
    setMaxPorSolicitud(ins.max_por_solicitud != null ? String(ins.max_por_solicitud) : '');
    setNotas(ins.notas || '');
    setShowModal(true);
  };

  const handleCreateModalCategory = async () => {
    const clean = modalNewCatName.trim();
    if (clean.length < 2) {
      return onNotify('Ingresa un nombre válido para la nueva categoría', true);
    }
    setSavingCat(true);
    try {
      const res = await apiRequest<{ ok: boolean; categoria: { nombre: string } }>('/categorias', {
        method: 'POST',
        token,
        body: { nombre: clean },
      });
      await onRefresh();
      const created = res.categoria?.nombre || clean;
      setCategoria(created);
      setModalNewCatName('');
      setShowModalNewCat(false);
      setOpenCats((prev) => ({ ...prev, [created]: true }));
      onNotify(`Categoría "${created}" agregada`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error creando categoría', true);
    } finally {
      setSavingCat(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const critFinal =
      criterioSelect === 'Personalizado...'
        ? criterioCustom.trim() || 'Nuevo requerimiento'
        : criterioSelect;
    const stockIniNum = stockActual.trim() === '' ? 0 : Number(stockActual);
    const stockMinNum = stockMinimo.trim() === '' ? 0 : Number(stockMinimo);
    const costoNum = costoUnitario.trim() === '' ? 0 : Number(costoUnitario);
    const maxSolNum = maxPorSolicitud.trim() === '' ? null : Number(maxPorSolicitud);

    if (!nombre.trim()) return onNotify('Ingresa el nombre del ítem', true);
    if (maxSolNum !== null && (!Number.isFinite(maxSolNum) || maxSolNum <= 0)) {
      return onNotify('El tope máximo por solicitud debe ser mayor a 0', true);
    }

    setSaving(true);
    try {
      if (editing) {
        await apiRequest(`/insumos/${editing.id}`, {
          method: 'PATCH',
          token,
          body: {
            nombre,
            categoria,
            criterio: critFinal,
            unidad,
            stock_actual: stockIniNum,
            stock_minimo: stockMinNum,
            ...(isGerencia
              ? {
                  costo_unitario: costoNum,
                  solicitable_por_bar: solicitableBar,
                  max_por_solicitud: maxSolNum,
                }
              : {}),
            proveedor_id: proveedorId ? Number(proveedorId) : null,
            notas: notas || null,
          },
        });
        onNotify(`Ítem "${nombre.toUpperCase()}" actualizado en ${categoria}`);
      } else {
        await apiRequest('/insumos', {
          method: 'POST',
          token,
          body: {
            codigo: codigo.trim() || undefined,
            nombre,
            categoria,
            criterio: critFinal,
            unidad,
            stock_actual: stockIniNum,
            stock_minimo: stockMinNum,
            ...(isGerencia
              ? {
                  costo_unitario: costoNum,
                  solicitable_por_bar: solicitableBar,
                  max_por_solicitud: maxSolNum,
                }
              : {}),
            proveedor_id: proveedorId ? Number(proveedorId) : null,
            notas: notas || null,
          },
        });
        onNotify(`Ítem incorporado en categoría "${categoria}"`);
      }
      setOpenCats((prev) => ({ ...prev, [categoria]: true }));
      await onRefresh();
      setShowModal(false);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error guardando ítem', true);
    } finally {
      setSaving(false);
    }
  };

  const handleMoveCategory = async (ins: Insumo, targetCat: string) => {
    if (!targetCat || targetCat === ins.categoria) return;
    setProcessingId(ins.id);
    try {
      await apiRequest(`/insumos/${ins.id}`, {
        method: 'PATCH',
        token,
        body: { categoria: targetCat },
      });
      setOpenCats((prev) => ({ ...prev, [targetCat]: true }));
      await onRefresh();
      onNotify(`"${ins.nombre}" movido a categoría "${targetCat}"`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error moviendo ítem de categoría', true);
    } finally {
      setProcessingId(null);
    }
  };

  const handleAssignProveedor = async (ins: Insumo, nextProvId: string) => {
    setProcessingId(ins.id);
    try {
      await apiRequest(`/insumos/${ins.id}`, {
        method: 'PATCH',
        token,
        body: { proveedor_id: nextProvId ? Number(nextProvId) : null },
      });
      await onRefresh();
      onNotify(`Proveedor actualizado para ${ins.nombre}`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error actualizando proveedor', true);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteInsumo = async (ins: Insumo) => {
    setProcessingId(ins.id);
    try {
      await apiRequest(`/insumos/${ins.id}`, {
        method: 'DELETE',
        token,
      });
      setConfirmDeleteId(null);
      await onRefresh();
      onNotify(`"${ins.nombre}" eliminado del maestro`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error eliminando ítem', true);
    } finally {
      setProcessingId(null);
    }
  };

  const handleMov = async (ins: Insumo, tipo: 'Ingreso' | 'Consumo') => {
    const raw = (movQtys[ins.id] || '').trim();
    const qty = raw === '' ? 1 : Number(raw);
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
      setMovQtys((prev) => ({ ...prev, [ins.id]: '' }));
      await onRefresh();
      onNotify(`${tipo} de ${fmtQty(qty)} ${ins.unidad} en ${ins.nombre}`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error ajustando stock', true);
    } finally {
      setProcessingId(null);
    }
  };

  const handleSubmitSolicitud = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSolicitudItems.length === 0) {
      return onNotify('Ingresa la cantidad a solicitar en al menos un ítem habilitado', true);
    }
    if (exceedsLineLimit) {
      return onNotify(
        `Gerencia limitó las solicitudes a un máximo de ${control.max_items_por_solicitud} ítems por envío`,
        true
      );
    }
    if (anyExceedsItemMax) {
      return onNotify('Uno o más ítems superan la cantidad máxima permitida por Gerencia', true);
    }

    setSavingSol(true);
    try {
      const res = await apiRequest<{ ok: boolean; creados: number }>('/insumos/solicitudes', {
        method: 'POST',
        token,
        body: {
          proveedor_id: solProveedorId ? Number(solProveedorId) : null,
          observacion: solObservacion.trim() || null,
          items: selectedSolicitudItems.map(({ insumo, cantidad }) => ({
            insumo_id: insumo.id,
            nombre_item: insumo.nombre,
            categoria: insumo.categoria,
            unidad: insumo.unidad,
            cantidad_solicitada: cantidad,
            criterio: effectiveSolCriterio,
            proveedor_id: solProveedorId ? Number(solProveedorId) : insumo.proveedor_id,
          })),
        },
      });
      setSolicitudQtys({});
      setSolObservacion('');
      await onRefresh();
      onNotify(`Solicitud formal registrada (${res.creados} ítems bajo criterio "${effectiveSolCriterio}")`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error registrando solicitud', true);
    } finally {
      setSavingSol(false);
    }
  };

  const handleUpdateSolicitudEstado = async (
    id: number,
    nextEstado: 'Aprobada' | 'Comprada' | 'Rechazada'
  ) => {
    setUpdatingSolId(id);
    const adjustedRaw = (solAdjustQtys[id] || '').trim();
    const adjustedQty = adjustedRaw !== '' ? Number(adjustedRaw) : undefined;
    if (adjustedQty !== undefined && (!Number.isFinite(adjustedQty) || adjustedQty <= 0)) {
      setUpdatingSolId(null);
      return onNotify('La cantidad ajustada debe ser mayor a 0', true);
    }
    try {
      await apiRequest(`/insumos/solicitudes/${id}`, {
        method: 'PATCH',
        token,
        body: {
          estado: nextEstado,
          ...(adjustedQty !== undefined ? { cantidad_solicitada: adjustedQty } : {}),
        },
      });
      setSolAdjustQtys((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      await onRefresh();
      onNotify(`Solicitud #${id} marcada como ${nextEstado}`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error actualizando solicitud', true);
    } finally {
      setUpdatingSolId(null);
    }
  };

  const activeControlBadges = useMemo(() => {
    const rules: string[] = [];
    if (!control?.permitir_crear_items_bar) rules.push('Catálogo bloqueado para Barra');
    if (control?.restringir_categorias_bar) {
      rules.push(`${control.categorias_permitidas_bar.length} categorías habilitadas`);
    }
    if (control?.solo_bajo_minimo) rules.push('Solo bajo mínimo');
    if (control?.bloquear_duplicados_pendientes) rules.push('Sin duplicados pendientes');
    if (control?.max_items_por_solicitud != null) {
      rules.push(`Máx. ${control.max_items_por_solicitud} ítems/solicitud`);
    }
    if (!control?.permitir_criterio_personalizado_bar) rules.push('Solo criterios autorizados');
    return rules;
  }, [control]);

  return (
    <div className="space-y-6">
      {/* Header + Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Insumos, Categorías y Solicitudes a Proveedores
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isGerencia
                  ? 'Administra categorías, habilita o bloquea ítems, fija límites máximos por solicitud y aprueba pedidos de Barra.'
                  : 'Consulta categorías disponibles y solicita reposición dentro de los límites autorizados por Gerencia.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isGerencia && (
              <button
                type="button"
                onClick={() => setShowControlPanel((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer border ${
                  showControlPanel
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-amber-50 text-amber-950 border-amber-300 hover:bg-amber-100'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Control y Límites Barra ({activeControlBadges.length})</span>
              </button>
            )}

            {canEditCatalog && (
              <>
                <button
                  type="button"
                  onClick={() => setShowNewCatBar((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FolderPlus className="w-4 h-4" />
                  <span>+ Nueva Categoría</span>
                </button>
                <button
                  type="button"
                  onClick={() => openCreate()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Incorporar Ítem</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Active Control Policy Strip (Visible to Bar & Gerencia) */}
        {activeControlBadges.length > 0 && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center gap-2 text-xs text-slate-700">
            <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
              <Lock className="w-3.5 h-3.5 text-amber-700" />
              Control de Gerencia activo:
            </span>
            <span>{activeControlBadges.join(' · ')}</span>
          </div>
        )}

        {/* Gerencia Governance & Limits Panel */}
        {isGerencia && showControlPanel && (
          <form
            onSubmit={handleSaveControl}
            className="p-5 bg-slate-50 border border-slate-300 rounded-xl space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Reglas y Límites de Control para Solicitudes de Barra
                </h3>
                <p className="text-xs text-slate-600">
                  Define exactamente qué puede solicitar, modificar o crear el encargado de Barra. Además puedes bloquear o limitar cantidades por ítem en cada fila.
                </p>
              </div>
              <button
                type="submit"
                disabled={savingControl}
                className="px-4 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {savingControl ? 'Guardando reglas...' : 'Guardar Límites de Control'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2.5 bg-white border border-slate-200 rounded-lg p-4">
                <p className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Permisos y Reglas Generales
                </p>

                <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ctrlDraft.permitir_crear_items_bar}
                    onChange={(e) =>
                      setCtrlDraft((p) => ({ ...p, permitir_crear_items_bar: e.target.checked }))
                    }
                    className="mt-0.5 rounded border-slate-300"
                  />
                  <span>
                    Permitir que Barra cree, edite, mueva o elimine ítems y categorías (desmarcado = control exclusivo de Gerencia).
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ctrlDraft.solo_bajo_minimo}
                    onChange={(e) =>
                      setCtrlDraft((p) => ({ ...p, solo_bajo_minimo: e.target.checked }))
                    }
                    className="mt-0.5 rounded border-slate-300"
                  />
                  <span>
                    Restringir solicitudes únicamente a ítems con stock actual por debajo del stock mínimo.
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ctrlDraft.bloquear_duplicados_pendientes}
                    onChange={(e) =>
                      setCtrlDraft((p) => ({
                        ...p,
                        bloquear_duplicados_pendientes: e.target.checked,
                      }))
                    }
                    className="mt-0.5 rounded border-slate-300"
                  />
                  <span>
                    Bloquear nuevas solicitudes de un ítem si ya tiene una solicitud Pendiente por aprobar.
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ctrlDraft.permitir_criterio_personalizado_bar}
                    onChange={(e) =>
                      setCtrlDraft((p) => ({
                        ...p,
                        permitir_criterio_personalizado_bar: e.target.checked,
                      }))
                    }
                    className="mt-0.5 rounded border-slate-300"
                  />
                  <span>
                    Permitir que Barra escriba criterios libres/personalizados (si se desmarca, solo elige criterios autorizados).
                  </span>
                </label>

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-3">
                  <label className="text-xs font-semibold text-slate-700">
                    Máximo de ítems distintos por solicitud:
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={ctrlMaxItemsText}
                    onChange={(e) => setCtrlMaxItemsText(e.target.value)}
                    placeholder="Sin límite"
                    className="w-28 px-2.5 py-1.5 text-xs text-right border border-slate-300 rounded-md font-mono tabular-nums bg-white"
                  />
                </div>
              </div>

              <div className="space-y-4">
                {/* Allowed Categories */}
                <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2.5">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ctrlDraft.restringir_categorias_bar}
                      onChange={(e) =>
                        setCtrlDraft((p) => ({
                          ...p,
                          restringir_categorias_bar: e.target.checked,
                        }))
                      }
                      className="rounded border-slate-300"
                    />
                    <span>Limitar qué categorías puede solicitar Barra</span>
                  </label>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
                    {allCategories.map((cat) => {
                      const checked = ctrlDraft.categorias_permitidas_bar.includes(cat);
                      return (
                        <label
                          key={cat}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] cursor-pointer ${
                            !ctrlDraft.restringir_categorias_bar
                              ? 'opacity-50 border-slate-200 bg-slate-50'
                              : checked
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-semibold'
                              : 'border-slate-200 bg-white text-slate-600'
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={!ctrlDraft.restringir_categorias_bar}
                            checked={checked}
                            onChange={(e) => {
                              setCtrlDraft((prev) => ({
                                ...prev,
                                categorias_permitidas_bar: e.target.checked
                                  ? [...prev.categorias_permitidas_bar, cat]
                                  : prev.categorias_permitidas_bar.filter((x) => x !== cat),
                              }));
                            }}
                            className="rounded border-slate-300"
                          />
                          <span className="truncate">{cat}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Allowed Criteria */}
                <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
                  <p className="text-xs font-bold text-slate-900">
                    Criterios autorizados para solicitudes de Barra
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {CRITERIOS_ESTANDAR.map((crit) => {
                      const checked = ctrlDraft.criterios_permitidos_bar.includes(crit);
                      return (
                        <label
                          key={crit}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] cursor-pointer ${
                            checked
                              ? 'border-slate-900 bg-slate-100 text-slate-900 font-semibold'
                              : 'border-slate-200 bg-white text-slate-600'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setCtrlDraft((prev) => ({
                                ...prev,
                                criterios_permitidos_bar: e.target.checked
                                  ? [...prev.criterios_permitidos_bar, crit]
                                  : prev.criterios_permitidos_bar.filter((x) => x !== crit),
                              }));
                            }}
                            className="rounded border-slate-300"
                          />
                          <span className="truncate">{crit}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* Inline Create Category Strip */}
        {showNewCatBar && canEditCatalog && (
          <form
            onSubmit={handleCreateCategory}
            className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center gap-2.5"
          >
            <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
              Crear nueva categoría global:
            </span>
            <input
              type="text"
              required
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Ej. Verduras, Vajilla, Cervezas, Licores, Cristalería..."
              className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={savingCat}
                className="px-3 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg cursor-pointer"
              >
                {savingCat ? 'Creando...' : 'Guardar Categoría'}
              </button>
              <button
                type="button"
                onClick={() => setShowNewCatBar(false)}
                className="px-2.5 py-1.5 text-xs text-slate-600 bg-white border border-slate-300 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {/* Dropdown Selectors Bar (Listas Desplegables) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-200">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Lista desplegable · Categoría
            </label>
            <select
              value={selectedCatFilter}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedCatFilter(val);
                if (val !== 'Todas') {
                  setOpenCats((prev) => ({ ...prev, [val]: true }));
                }
              }}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-medium"
            >
              <option value="Todas">Todas las categorías ({allCategories.length})</option>
              {allCategories.map((cat) => {
                const count = estado.insumos.filter((i) => (i.categoria || 'Insumos de Barra') === cat).length;
                return (
                  <option key={cat} value={cat}>
                    {cat} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Lista desplegable · Ir a Ítem
            </label>
            <select
              value={selectedItemId}
              onChange={(e) => handleSelectItemFromDropdown(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-medium"
            >
              <option value="">Seleccionar ítem del maestro ({estado.insumos.length})...</option>
              {allCategories.map((cat) => {
                const items = estado.insumos.filter((i) => (i.categoria || 'Insumos de Barra') === cat);
                if (items.length === 0) return null;
                return (
                  <optgroup key={cat} label={cat}>
                    {items.map((ins) => (
                      <option key={ins.id} value={ins.id}>
                        {ins.nombre} ({fmtQty(ins.stock_actual)} {ins.unidad})
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Lista desplegable · Proveedor
            </label>
            <select
              value={selectedProvFilter}
              onChange={(e) => setSelectedProvFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-medium"
            >
              <option value="Todos">Todos los proveedores</option>
              <option value="SinProveedor">Sin proveedor asignado</option>
              {estado.proveedores.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.nombre} ({pr.categoria})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Buscar ítem o criterio
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre, código, criterio..."
                className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              />
            </div>
          </div>
        </div>

        {/* Open / Close Category Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-slate-600">
            <span>
              Mostrando <strong className="text-slate-900">{filteredInsumos.length}</strong> ítems en{' '}
              <strong className="text-slate-900">{visibleCategories.length}</strong> categorías
            </span>
            {selectedCatFilter !== 'Todas' && (
              <button
                type="button"
                onClick={() => setSelectedCatFilter('Todas')}
                className="text-xs font-semibold text-slate-900 underline cursor-pointer"
              >
                Ver todas las categorías
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenAllCats}
              className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
            >
              Abrir todas
            </button>
            <button
              type="button"
              onClick={handleCloseAllCats}
              className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
            >
              Cerrar todas
            </button>
          </div>
        </div>
      </div>

      {/* Multi-item Formal Solicitud & WhatsApp Action Bar */}
      {selectedSolicitudItems.length > 0 && (
        <form
          onSubmit={handleSubmitSolicitud}
          className="bg-amber-50 border border-amber-300 rounded-xl p-5 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-amber-950">
                Solicitud / Pedido Seleccionado ({selectedSolicitudItems.length}
                {!isGerencia && control?.max_items_por_solicitud != null
                  ? ` / ${control.max_items_por_solicitud} máx.`
                  : ''}{' '}
                ítems)
              </h3>
              <p className="text-xs text-amber-800">
                {selectedSolicitudItems
                  .map(({ insumo, cantidad }) => `${insumo.nombre}: ${fmtQty(cantidad)} ${insumo.unidad}`)
                  .join(' · ')}
              </p>
              {(exceedsLineLimit || anyExceedsItemMax) && (
                <p className="text-xs font-bold text-rose-700 mt-1">
                  {exceedsLineLimit
                    ? `Superaste el límite de ${control.max_items_por_solicitud} ítems por solicitud fijado por Gerencia.`
                    : 'Uno o más ítems superan la cantidad máxima permitida por Gerencia.'}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSolicitudQtys({})}
              className="text-xs font-semibold text-amber-900 hover:underline self-start sm:self-auto cursor-pointer"
            >
              Limpiar selección
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-amber-950 mb-1">
                Criterio de Solicitud
              </label>
              <select
                value={solCriterioSelect}
                onChange={(e) => setSolCriterioSelect(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-amber-300 rounded-lg bg-white"
              >
                {availableCriteriaForUser.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {solCriterioSelect === 'Personalizado...' && (
                <input
                  type="text"
                  value={solCriterioCustom}
                  onChange={(e) => setSolCriterioCustom(e.target.value)}
                  placeholder="Escribe el criterio personalizado..."
                  className="mt-1.5 w-full px-3 py-1.5 text-xs border border-amber-300 rounded-lg bg-white"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-amber-950 mb-1">
                Proveedor Destino (Opcional / WSP)
              </label>
              <select
                value={solProveedorId}
                onChange={(e) => setSolProveedorId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-amber-300 rounded-lg bg-white"
              >
                <option value="">Según proveedor de cada ítem</option>
                {estado.proveedores.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.nombre} ({pr.telefono_wsp})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-amber-950 mb-1">
                Observación / Detalle
              </label>
              <input
                type="text"
                value={solObservacion}
                onChange={(e) => setSolObservacion(e.target.value)}
                placeholder="Ej. Entregar antes de apertura PM..."
                className="w-full px-3 py-2 text-xs border border-amber-300 rounded-lg bg-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="submit"
              disabled={savingSol || exceedsLineLimit || anyExceedsItemMax}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{savingSol ? 'Registrando...' : 'Registrar Solicitud Formal'}</span>
            </button>

            {isGerencia && multiWspUrl && (
              <a
                href={multiWspUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Enviar Pedido por WhatsApp ({selectedSolProv?.nombre})</span>
              </a>
            )}
          </div>
        </form>
      )}

      {/* Expandable Category Accordions */}
      <div className="space-y-4">
        {visibleCategories.map((cat) => {
          const items = filteredInsumos.filter((i) => (i.categoria || 'Insumos de Barra') === cat);
          const isOpen = Boolean(openCats[cat]);
          const lowCount = items.filter((i) => i.stock_actual < i.stock_minimo).length;
          const catRestrictedForBar =
            !isGerencia &&
            control?.restringir_categorias_bar &&
            !allowedCatsSet.has(cat.trim().toLowerCase());

          return (
            <div key={cat} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {/* Category Header */}
              <div className="px-4 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => handleToggleCat(cat)}
                    className="inline-flex items-center gap-2 text-left text-sm font-bold text-slate-900 hover:text-slate-700 cursor-pointer"
                  >
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-slate-600 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                    )}
                    <span>{cat}</span>
                  </button>

                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    ({items.length} {items.length === 1 ? 'ítem' : 'ítems'})
                  </span>

                  {lowCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {lowCount} bajo mínimo
                    </span>
                  )}

                  {catRestrictedForBar && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
                      <Lock className="w-3 h-3" />
                      Restringida por Gerencia
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canEditCatalog && renamingCat === cat ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={renameCatValue}
                        onChange={(e) => setRenameCatValue(e.target.value)}
                        className="px-2.5 py-1 text-xs border border-slate-900 rounded-md bg-white"
                      />
                      <button
                        type="button"
                        disabled={savingCat}
                        onClick={() => handleRenameCategory(cat)}
                        className="px-2.5 py-1 text-xs font-semibold bg-emerald-700 text-white rounded-md cursor-pointer"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingCat(null)}
                        className="px-2 py-1 text-xs text-slate-600 bg-white border border-slate-300 rounded-md cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <>
                      {canEditCatalog && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingCat(cat);
                              setRenameCatValue(cat);
                            }}
                            className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-md cursor-pointer"
                          >
                            Renombrar
                          </button>
                          <button
                            type="button"
                            onClick={() => openCreate(cat)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-md cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Agregar aquí</span>
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => handleToggleCat(cat)}
                        className="px-2.5 py-1 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md cursor-pointer"
                      >
                        {isOpen ? 'Cerrar' : 'Abrir'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Category Table (only rendered when opened) */}
              {isOpen && (
                <div className="overflow-x-auto">
                  {items.length === 0 ? (
                    <div className="py-8 px-4 text-center text-xs text-slate-500">
                      No hay ítems en la categoría <strong>{cat}</strong> todavía.{' '}
                      {canEditCatalog && (
                        <button
                          type="button"
                          onClick={() => openCreate(cat)}
                          className="font-semibold text-slate-900 underline cursor-pointer"
                        >
                          Incorporar primer ítem en {cat}
                        </button>
                      )}
                    </div>
                  ) : (
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-white border-b border-slate-200 text-slate-600 font-semibold">
                          <th className="py-2.5 px-4 text-left">Ítem / Criterio</th>
                          <th className="py-2.5 px-3 text-left">
                            {canEditCatalog ? 'Mover Categoría' : 'Categoría'}
                          </th>
                          <th className="py-2.5 px-3 text-left">Proveedor Asignado</th>
                          <th className="py-2.5 px-3 text-right">Stock / Mínimo</th>
                          {isGerencia && <th className="py-2.5 px-3 text-right">Costo Unit.</th>}
                          {isGerencia && <th className="py-2.5 px-3 text-left">Límite Solicitud Barra</th>}
                          <th className="py-2.5 px-3 text-right">Mov. Rápido</th>
                          <th className="py-2.5 px-3 text-right">Solicitar Cant.</th>
                          {canEditCatalog && <th className="py-2.5 px-4 text-right">Editar / Quitar</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {items.map((ins) => {
                          const bajo = ins.stock_actual < ins.stock_minimo;
                          const prov = estado.proveedores.find((pr) => pr.id === ins.proveedor_id);
                          const falta = Math.max(1, ins.stock_minimo - ins.stock_actual);
                          const isHighlighted = String(ins.id) === selectedItemId;
                          const blockReason = getRequestBlockReason(ins);

                          const rawSolVal = solicitudQtys[ins.id] ?? '';
                          const solNum = rawSolVal.trim() !== '' ? Number(rawSolVal) : 0;
                          const itemExceedsMax =
                            !isGerencia &&
                            ins.max_por_solicitud != null &&
                            ins.max_por_solicitud > 0 &&
                            solNum > ins.max_por_solicitud;

                          const itemMaxText =
                            itemMaxDrafts[ins.id] !== undefined
                              ? itemMaxDrafts[ins.id]
                              : ins.max_por_solicitud != null
                              ? String(ins.max_por_solicitud)
                              : '';
                          const itemMaxChanged = itemMaxDrafts[ins.id] !== undefined;

                          const wspUrl = prov
                            ? buildWhatsAppUrl(
                                prov.telefono_wsp,
                                `Hola ${prov.contacto || prov.nombre}, necesitamos pedir ${fmtQty(
                                  Number(solicitudQtys[ins.id] || falta)
                                )} ${ins.unidad} de ${ins.nombre} (${ins.categoria}) para Barra.${
                                  ins.criterio ? ` Criterio: ${ins.criterio}.` : ''
                                }`
                              )
                            : null;

                          return (
                            <tr
                              key={ins.id}
                              ref={(el) => {
                                rowRefs.current[ins.id] = el;
                              }}
                              className={
                                isHighlighted
                                  ? 'bg-amber-50/80'
                                  : blockReason
                                  ? 'bg-slate-50/70'
                                  : bajo
                                  ? 'bg-rose-50/30 hover:bg-slate-50'
                                  : 'hover:bg-slate-50'
                              }
                            >
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[11px] text-slate-400">{ins.codigo}</span>
                                  {bajo ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                                      <AlertTriangle className="w-3 h-3" />
                                      Bajo mín.
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                      <CheckCircle2 className="w-3 h-3" />
                                      OK
                                    </span>
                                  )}
                                </div>
                                <div className="font-bold text-slate-900 mt-0.5">{ins.nombre}</div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  <span className="font-semibold text-slate-700">
                                    Criterio: {ins.criterio || 'Reposición operativa'}
                                  </span>
                                  {ins.notas ? ` · ${ins.notas}` : ''}
                                </div>
                              </td>

                              <td className="py-3 px-3">
                                {canEditCatalog ? (
                                  <select
                                    disabled={processingId === ins.id}
                                    value={ins.categoria || 'Insumos de Barra'}
                                    onChange={(e) => handleMoveCategory(ins, e.target.value)}
                                    className="px-2 py-1.5 text-xs border border-slate-300 rounded-md bg-white max-w-[10.5rem]"
                                    title="Mover ítem a otra categoría"
                                  >
                                    {allCategories.map((c) => (
                                      <option key={c} value={c}>
                                        {c}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-xs font-medium text-slate-700">
                                    {ins.categoria || 'Insumos de Barra'}
                                  </span>
                                )}
                              </td>

                              <td className="py-3 px-3">
                                {canEditCatalog ? (
                                  <div className="flex items-center gap-1.5">
                                    <select
                                      disabled={processingId === ins.id}
                                      value={ins.proveedor_id ? String(ins.proveedor_id) : ''}
                                      onChange={(e) => handleAssignProveedor(ins, e.target.value)}
                                      className="px-2 py-1.5 text-xs border border-slate-300 rounded-md bg-white max-w-[11rem]"
                                    >
                                      <option value="">Sin asignar</option>
                                      {estado.proveedores.map((pr) => (
                                        <option key={pr.id} value={pr.id}>
                                          {pr.nombre}
                                        </option>
                                      ))}
                                    </select>
                                    {isGerencia && wspUrl && (
                                      <a
                                        href={wspUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={`Pedir ${ins.nombre} por WhatsApp`}
                                        className="p-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md shrink-0"
                                      >
                                        <MessageCircle className="w-3.5 h-3.5" />
                                      </a>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-600">
                                    {prov?.nombre || 'Sin asignar'}
                                  </span>
                                )}
                              </td>

                              <td className="py-3 px-3 text-right whitespace-nowrap">
                                <div
                                  className={`font-mono tabular-nums font-bold ${
                                    bajo ? 'text-rose-700' : 'text-slate-900'
                                  }`}
                                >
                                  {fmtQty(ins.stock_actual)}{' '}
                                  <span className="font-normal text-slate-500">{ins.unidad}</span>
                                </div>
                                <div className="text-[11px] font-mono tabular-nums text-slate-500">
                                  Mín: {fmtQty(ins.stock_minimo)}
                                </div>
                              </td>

                              {isGerencia && (
                                <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                                  {fmtCLP(ins.costo_unitario)}
                                </td>
                              )}

                              {isGerencia && (
                                <td className="py-3 px-3 whitespace-nowrap">
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      disabled={processingId === ins.id}
                                      onClick={() => handleToggleItemSolicitable(ins)}
                                      title={
                                        ins.solicitable_por_bar
                                          ? 'Clic para bloquear solicitudes desde Barra'
                                          : 'Clic para habilitar solicitudes desde Barra'
                                      }
                                      className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md cursor-pointer ${
                                        ins.solicitable_por_bar
                                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                                          : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
                                      }`}
                                    >
                                      {ins.solicitable_por_bar ? (
                                        <>
                                          <Unlock className="w-3 h-3" />
                                          <span>Permitido</span>
                                        </>
                                      ) : (
                                        <>
                                          <Lock className="w-3 h-3" />
                                          <span>Bloqueado</span>
                                        </>
                                      )}
                                    </button>
                                    <input
                                      type="number"
                                      min="0.1"
                                      step="any"
                                      value={itemMaxText}
                                      onChange={(e) =>
                                        setItemMaxDrafts((prev) => ({
                                          ...prev,
                                          [ins.id]: e.target.value,
                                        }))
                                      }
                                      placeholder="Sin tope"
                                      title="Máximo solicitable por Barra en un envío"
                                      className="w-20 px-2 py-1 text-[11px] text-right border border-slate-300 rounded-md font-mono tabular-nums bg-white"
                                    />
                                    {itemMaxChanged && (
                                      <button
                                        type="button"
                                        disabled={processingId === ins.id}
                                        onClick={() => handleSaveItemMax(ins)}
                                        className="px-2 py-1 text-[11px] font-semibold bg-slate-900 text-white rounded-md cursor-pointer"
                                      >
                                        OK
                                      </button>
                                    )}
                                  </div>
                                </td>
                              )}

                              <td className="py-3 px-3 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0.1"
                                    step="any"
                                    value={movQtys[ins.id] ?? ''}
                                    onChange={(e) =>
                                      setMovQtys((prev) => ({ ...prev, [ins.id]: e.target.value }))
                                    }
                                    placeholder="1"
                                    className="w-14 px-2 py-1 text-xs text-right border border-slate-300 rounded-md font-mono tabular-nums bg-white"
                                  />
                                  <button
                                    type="button"
                                    disabled={processingId === ins.id}
                                    onClick={() => handleMov(ins, 'Consumo')}
                                    title="Descontar consumo"
                                    className="px-2 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                                  >
                                    −
                                  </button>
                                  <button
                                    type="button"
                                    disabled={processingId === ins.id}
                                    onClick={() => handleMov(ins, 'Ingreso')}
                                    title="Registrar ingreso"
                                    className="px-2 py-1 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>
                              </td>

                              <td className="py-3 px-3 text-right">
                                {blockReason ? (
                                  <div className="inline-flex flex-col items-end">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 whitespace-nowrap">
                                      <Lock className="w-3 h-3" />
                                      {blockReason}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="inline-flex flex-col items-end">
                                    <input
                                      type="number"
                                      min="0"
                                      max={!isGerencia && ins.max_por_solicitud ? ins.max_por_solicitud : undefined}
                                      step="any"
                                      value={rawSolVal}
                                      onChange={(e) =>
                                        setSolicitudQtys((prev) => ({
                                          ...prev,
                                          [ins.id]: e.target.value,
                                        }))
                                      }
                                      placeholder="0"
                                      className={`w-20 px-2 py-1 text-xs text-right border rounded-md font-mono tabular-nums font-bold focus:bg-white focus:outline-none ${
                                        itemExceedsMax
                                          ? 'border-rose-600 bg-rose-50 text-rose-700'
                                          : 'border-slate-900 bg-amber-50/60'
                                      }`}
                                    />
                                    {!isGerencia && ins.max_por_solicitud != null && (
                                      <span
                                        className={`text-[10px] font-mono tabular-nums mt-0.5 ${
                                          itemExceedsMax ? 'text-rose-700 font-bold' : 'text-slate-500'
                                        }`}
                                      >
                                        Máx: {fmtQty(ins.max_por_solicitud)} {ins.unidad}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>

                              {canEditCatalog && (
                                <td className="py-3 px-4 text-right whitespace-nowrap">
                                  <div className="inline-flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => openEdit(ins)}
                                      title="Editar o renombrar ítem"
                                      className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    {confirmDeleteId === ins.id ? (
                                      <div className="inline-flex items-center gap-1">
                                        <button
                                          type="button"
                                          disabled={processingId === ins.id}
                                          onClick={() => handleDeleteInsumo(ins)}
                                          className="px-2 py-1 text-[11px] font-semibold bg-rose-700 text-white rounded-md cursor-pointer"
                                        >
                                          Sí
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteId(null)}
                                          className="px-2 py-1 text-[11px] text-slate-600 bg-slate-100 rounded-md cursor-pointer"
                                        >
                                          No
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteId(ins.id)}
                                        title="Eliminar ítem"
                                        className="p-1.5 text-rose-700 hover:bg-rose-50 rounded-md cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Historial de Solicitudes de Insumos */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ClipboardList className="w-4 h-4 text-slate-700" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Historial de Solicitudes de Insumos y Requerimientos
              </h3>
              <p className="text-xs text-slate-500">
                Solicitudes registradas con criterio y proveedor vinculado. Gerencia puede ajustar cantidades, aprobar o rechazar cada línea.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {estado.solicitudesInsumos.length} registros
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-2.5 px-4 text-left">Fecha</th>
                <th className="py-2.5 px-4 text-left">Ítem / Categoría</th>
                <th className="py-2.5 px-4 text-right">Cantidad</th>
                <th className="py-2.5 px-4 text-left">Criterio</th>
                <th className="py-2.5 px-4 text-left">Proveedor</th>
                <th className="py-2.5 px-4 text-left">Solicitante</th>
                <th className="py-2.5 px-4 text-left">Estado</th>
                {isGerencia && <th className="py-2.5 px-4 text-right">Gestión Gerencia</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {estado.solicitudesInsumos.length === 0 ? (
                <tr>
                  <td colSpan={isGerencia ? 8 : 7} className="py-8 text-center text-slate-500">
                    No hay solicitudes de insumos registradas aún. Digita una cantidad en "Solicitar Cant." arriba para crear la primera.
                  </td>
                </tr>
              ) : (
                estado.solicitudesInsumos.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono text-slate-500 whitespace-nowrap">{s.fecha}</td>
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-slate-900">{s.nombre_item}</div>
                      <div className="text-[11px] text-slate-500">
                        {s.categoria}
                        {s.observacion ? ` · ${s.observacion}` : ''}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                      {fmtQty(s.cantidad_solicitada)} {s.unidad}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">{s.criterio}</td>
                    <td className="py-2.5 px-4 text-slate-600">
                      {s.proveedor_nombre || 'Sin proveedor'}
                    </td>
                    <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">{s.solicitante}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span
                        className={`font-semibold ${
                          s.estado === 'Comprada'
                            ? 'text-emerald-700'
                            : s.estado === 'Aprobada'
                            ? 'text-slate-900'
                            : s.estado === 'Rechazada'
                            ? 'text-rose-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {s.estado}
                      </span>
                    </td>
                    {isGerencia && (
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {(s.estado === 'Pendiente' || s.estado === 'Aprobada') && (
                            <input
                              type="number"
                              min="0.1"
                              step="any"
                              value={solAdjustQtys[s.id] ?? ''}
                              onChange={(e) =>
                                setSolAdjustQtys((prev) => ({ ...prev, [s.id]: e.target.value }))
                              }
                              placeholder={fmtQty(s.cantidad_solicitada)}
                              title="Opcional: ajustar cantidad aprobada"
                              className="w-16 px-2 py-1 text-[11px] text-right border border-slate-300 rounded-md font-mono tabular-nums bg-white"
                            />
                          )}
                          {s.estado === 'Pendiente' && (
                            <button
                              type="button"
                              disabled={updatingSolId === s.id}
                              onClick={() => handleUpdateSolicitudEstado(s.id, 'Aprobada')}
                              className="px-2 py-1 text-[11px] font-semibold bg-slate-900 text-white rounded-md cursor-pointer"
                            >
                              Aprobar
                            </button>
                          )}
                          {(s.estado === 'Pendiente' || s.estado === 'Aprobada') && (
                            <button
                              type="button"
                              disabled={updatingSolId === s.id}
                              onClick={() => handleUpdateSolicitudEstado(s.id, 'Comprada')}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-emerald-700 text-white rounded-md cursor-pointer"
                            >
                              <Check className="w-3 h-3" />
                              Comprada
                            </button>
                          )}
                          {s.estado === 'Pendiente' && (
                            <button
                              type="button"
                              disabled={updatingSolId === s.id}
                              onClick={() => handleUpdateSolicitudEstado(s.id, 'Rechazada')}
                              className="px-2 py-1 text-[11px] font-medium text-rose-700 bg-rose-50 rounded-md cursor-pointer"
                            >
                              Rechazar
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Item Modal */}
      {showModal && canEditCatalog && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                {editing ? `Editar / Mover Ítem · ${editing.codigo}` : 'Incorporar Nuevo Ítem'}
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Código (Opcional)
                  </label>
                  <input
                    type="text"
                    disabled={Boolean(editing)}
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    placeholder="Auto (INS-...)"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono uppercase disabled:bg-slate-100"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nombre del Ítem
                  </label>
                  <input
                    type="text"
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej. MENTA FRESCA / COPA GIN / CERVEZA..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">Categoría</label>
                    <button
                      type="button"
                      onClick={() => setShowModalNewCat((v) => !v)}
                      className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                    >
                      {showModalNewCat ? 'Cancelar' : '+ Crear categoría'}
                    </button>
                  </div>
                  {showModalNewCat ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={modalNewCatName}
                        onChange={(e) => setModalNewCatName(e.target.value)}
                        placeholder="Ej. Verduras, Vajilla..."
                        className="w-full px-2.5 py-2 text-xs border border-slate-900 rounded-lg bg-white"
                      />
                      <button
                        type="button"
                        disabled={savingCat}
                        onClick={handleCreateModalCategory}
                        className="px-2.5 py-2 text-xs font-semibold bg-emerald-700 text-white rounded-lg shrink-0 cursor-pointer"
                      >
                        Crear
                      </button>
                    </div>
                  ) : (
                    <select
                      value={categoria}
                      onChange={(e) => setCategoria(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      {allCategories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Criterio de Incorporación
                  </label>
                  <select
                    value={criterioSelect}
                    onChange={(e) => setCriterioSelect(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {CRITERIOS_INCORPORACION.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {criterioSelect === 'Personalizado...' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Criterio Personalizado
                  </label>
                  <input
                    type="text"
                    required
                    value={criterioCustom}
                    onChange={(e) => setCriterioCustom(e.target.value)}
                    placeholder="Indica el motivo o regla de incorporación..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              )}

              <div className={`grid gap-3 ${isGerencia ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Unidad</label>
                  <input
                    type="text"
                    required
                    value={unidad}
                    onChange={(e) => setUnidad(e.target.value)}
                    placeholder="kg / un / caja"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Stock Actual</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={stockActual}
                    onChange={(e) => setStockActual(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Stock Mínimo</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={stockMinimo}
                    onChange={(e) => setStockMinimo(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                  />
                </div>
                {isGerencia && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Costo Unit. ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={costoUnitario}
                      onChange={(e) => setCostoUnitario(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                    />
                  </div>
                )}
              </div>

              {isGerencia && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={solicitableBar}
                      onChange={(e) => setSolicitableBar(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span>Habilitar para solicitudes de Barra</span>
                  </label>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Tope Máx. por Solicitud (Opcional)
                    </label>
                    <input
                      type="number"
                      min="0.1"
                      step="any"
                      value={maxPorSolicitud}
                      onChange={(e) => setMaxPorSolicitud(e.target.value)}
                      placeholder="Sin tope"
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md font-mono tabular-nums bg-white"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Proveedor Asignado (Ficha)
                </label>
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
                  placeholder="Especificaciones, marca sugerida, formato..."
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
                  {saving ? 'Guardando...' : editing ? 'Actualizar Ítem' : 'Incorporar Ítem'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
