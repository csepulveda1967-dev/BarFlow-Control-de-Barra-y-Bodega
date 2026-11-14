import React, { useMemo, useState } from 'react';
import {
  Check,
  Download,
  Edit3,
  FileSpreadsheet,
  Layers,
  PackagePlus,
  Plus,
  Scale,
  Search,
  Sliders,
  Upload,
  X,
} from 'lucide-react';
import { PRODUCT_CATEGORIES, type EstadoApp, type Producto } from '../types';
import {
  apiRequest,
  downloadExcelReport,
  downloadImportTemplate,
  fmtCLP,
  fmtQty,
} from '../lib/api';

interface GerenciaViewProps {
  token: string;
  estado: EstadoApp;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

type GerTab = 'despachos' | 'comparativa' | 'rendimiento' | 'maestro' | 'cuadratura' | 'auditoria';

export const GerenciaView: React.FC<GerenciaViewProps> = ({
  token,
  estado,
  onRefresh,
  onNotify,
}) => {
  const [tab, setTab] = useState<GerTab>('despachos');

  // Dispatch state
  const [dispatchQtys, setDispatchQtys] = useState<Record<number, string>>({});
  const [processingId, setProcessingId] = useState<number | null>(null);

  // Comparativa de Cierres filters
  const [compTurno, setCompTurno] = useState<'Todos' | 'AM' | 'PM'>('Todos');
  const [compFecha, setCompFecha] = useState<string>('');

  // Rendimiento Botellas (cortos & cocteles por botella)
  const [rendDrafts, setRendDrafts] = useState<Record<number, { corto?: string; coctel?: string }>>({});
  const [rendSearch, setRendSearch] = useState('');
  const [rendCat, setRendCat] = useState('Todas');
  const [savingRendId, setSavingRendId] = useState<number | null>(null);

  // Create Product state
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState<string>(PRODUCT_CATEGORIES[0]);
  const [showNewCatCreate, setShowNewCatCreate] = useState(false);
  const [newCatCreateName, setNewCatCreateName] = useState('');
  const [savingCat, setSavingCat] = useState(false);
  const [unidad, setUnidad] = useState('botella');
  const [minimo, setMinimo] = useState('');
  const [costoRef, setCostoRef] = useState('');
  const [tipoEnvase, setTipoEnvase] = useState('botella');
  const [contenidoEnvase, setContenidoEnvase] = useState('');
  const [unidadContenido, setUnidadContenido] = useState('ml');
  const [porcionesCorto, setPorcionesCorto] = useState('');
  const [porcionesCoctel, setPorcionesCoctel] = useState('');
  const [stockIniCentral, setStockIniCentral] = useState('');
  const [stockIniBarra, setStockIniBarra] = useState('');
  const [savingProd, setSavingProd] = useState(false);

  // Edit product modal state
  const [editingProd, setEditingProd] = useState<Producto | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editCategoria, setEditCategoria] = useState<string>(PRODUCT_CATEGORIES[0]);
  const [showNewCatEdit, setShowNewCatEdit] = useState(false);
  const [newCatEditName, setNewCatEditName] = useState('');
  const [editUnidad, setEditUnidad] = useState('botella');
  const [editMinimo, setEditMinimo] = useState('0');
  const [editCosto, setEditCosto] = useState('0');
  const [editStockIni, setEditStockIni] = useState('0');
  const [editEnvase, setEditEnvase] = useState('');
  const [editContenido, setEditContenido] = useState('');
  const [editUContenido, setEditUContenido] = useState('ml');
  const [editPorcionesCorto, setEditPorcionesCorto] = useState('');
  const [editPorcionesCoctel, setEditPorcionesCoctel] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Manual Initial Stock Adjustment Modal
  const [stockIniProd, setStockIniProd] = useState<Producto | null>(null);
  const [stockIniBodega, setStockIniBodega] = useState('3');
  const [stockIniCant, setStockIniCant] = useState('');
  const [savingStockIni, setSavingStockIni] = useState(false);

  // Bulk Upload Modal (Comercial)
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [importing, setImporting] = useState(false);

  // Stock entry (Ingreso de Mercadería) state
  const [ingBodega, setIngBodega] = useState('1');
  const [ingProdId, setIngProdId] = useState(() => (estado.productos[0] ? String(estado.productos[0].id) : ''));
  const [ingCant, setIngCant] = useState('');
  const [ingCosto, setIngCosto] = useState('');
  const [ingVenc, setIngVenc] = useState('');
  const [ingMotivo, setIngMotivo] = useState('Ingreso de mercadería');
  const [savingIng, setSavingIng] = useState(false);

  // Cuadratura Física state
  const [cuadBodega, setCuadBodega] = useState('3');
  const [cuadProdId, setCuadProdId] = useState(() => (estado.productos[0] ? String(estado.productos[0].id) : ''));
  const [cuadFisico, setCuadFisico] = useState('');
  const [cuadMotivo, setCuadMotivo] = useState('Ajuste por cuadratura física');
  const [confirmCuad, setConfirmCuad] = useState(false);
  const [savingCuad, setSavingCuad] = useState(false);

  // Audit search & filter
  const [auditSearch, setAuditSearch] = useState('');
  const [auditTipo, setAuditTipo] = useState('Todos');
  const [exporting, setExporting] = useState(false);

  const allCategories = useMemo(() => {
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
    for (const c of estado.categorias || []) add(c);
    for (const c of PRODUCT_CATEGORIES) add(c);
    for (const p of estado.productos) add(p.categoria);
    return ordered;
  }, [estado.categorias, estado.productos]);

  const handleCrearCategoriaInline = async (target: 'create' | 'edit') => {
    const raw = (target === 'create' ? newCatCreateName : newCatEditName).trim();
    if (raw.length < 2) {
      return onNotify('Ingresa un nombre válido de al menos 2 caracteres para la categoría', true);
    }
    setSavingCat(true);
    try {
      const res = await apiRequest<{ ok: boolean; categoria: { nombre: string } }>('/categorias', {
        method: 'POST',
        token,
        body: { nombre: raw },
      });
      await onRefresh();
      const createdName = res.categoria?.nombre || raw;
      if (target === 'create') {
        setCategoria(createdName);
        setNewCatCreateName('');
        setShowNewCatCreate(false);
      } else {
        setEditCategoria(createdName);
        setNewCatEditName('');
        setShowNewCatEdit(false);
      }
      onNotify(`Categoría "${createdName}" creada y seleccionada`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error creando categoría', true);
    } finally {
      setSavingCat(false);
    }
  };

  const pendientes = useMemo(
    () => estado.solicitudes.filter((s) => s.estado === 'Pendiente'),
    [estado.solicitudes]
  );

  const filteredCierres = useMemo(() => {
    return estado.cierres.filter((c) => {
      if (compTurno !== 'Todos' && c.turno !== compTurno) return false;
      if (compFecha && c.fecha !== compFecha) return false;
      return true;
    });
  }, [estado.cierres, compTurno, compFecha]);

  const filteredConsumos = useMemo(() => {
    return estado.consumosTurno.filter((c) => {
      if (compTurno !== 'Todos' && c.turno !== compTurno) return false;
      if (compFecha && c.fecha !== compFecha) return false;
      return true;
    });
  }, [estado.consumosTurno, compTurno, compFecha]);

  const filteredRendProds = useMemo(() => {
    const q = rendSearch.trim().toLowerCase();
    return estado.productos.filter((p) => {
      if (rendCat !== 'Todas' && p.categoria !== rendCat) return false;
      if (q && !p.nombre.toLowerCase().includes(q) && !p.codigo.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [estado.productos, rendSearch, rendCat]);

  const totalImpactoComparativa = useMemo(
    () => filteredCierres.reduce((s, c) => s + (c.diferencia_valor || 0), 0),
    [filteredCierres]
  );

  const filteredMovs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return estado.movimientos.filter((m) => {
      if (auditTipo !== 'Todos' && m.tipo !== auditTipo) return false;
      if (
        q &&
        !m.producto.toLowerCase().includes(q) &&
        !m.codigo.toLowerCase().includes(q) &&
        !(m.motivo || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [estado.movimientos, auditSearch, auditTipo]);

  const movTipos = useMemo(() => {
    const s = new Set(estado.movimientos.map((m) => m.tipo));
    return ['Todos', ...Array.from(s)];
  }, [estado.movimientos]);

  const handleDespachar = async (id: number, defaultQty: number) => {
    const qty = Number(dispatchQtys[id] ?? defaultQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      return onNotify('Ingresa una cantidad válida a despachar', true);
    }
    setProcessingId(id);
    try {
      await apiRequest(`/solicitudes/${id}/despachar`, {
        method: 'POST',
        token,
        body: { cantidad_despachada: qty },
      });
      await onRefresh();
      onNotify(`Solicitud #${id} despachada desde Bodega Central (FEFO/FIFO)`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error al despachar', true);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRechazar = async (id: number) => {
    setProcessingId(id);
    try {
      await apiRequest(`/solicitudes/${id}/rechazar`, {
        method: 'POST',
        token,
        body: { motivo: 'No autorizado / Stock reservado' },
      });
      await onRefresh();
      onNotify(`Solicitud #${id} rechazada`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error al rechazar', true);
    } finally {
      setProcessingId(null);
    }
  };

  const handleGuardarRendimiento = async (p: Producto) => {
    const draft = rendDrafts[p.id] || {};
    const rawCorto = draft.corto !== undefined ? draft.corto : (p.porciones_corto != null ? String(p.porciones_corto) : '');
    const rawCoctel = draft.coctel !== undefined ? draft.coctel : (p.porciones_coctel != null ? String(p.porciones_coctel) : '');

    const valCorto = rawCorto.trim() === '' ? null : Number(rawCorto);
    const valCoctel = rawCoctel.trim() === '' ? null : Number(rawCoctel);

    if (valCorto !== null && (!Number.isFinite(valCorto) || valCorto <= 0)) {
      return onNotify('Las porciones de corto por botella deben ser mayores a 0 (o dejar vacío)', true);
    }
    if (valCoctel !== null && (!Number.isFinite(valCoctel) || valCoctel <= 0)) {
      return onNotify('Las porciones de cóctel por botella deben ser mayores a 0 (o dejar vacío)', true);
    }

    setSavingRendId(p.id);
    try {
      await apiRequest(`/productos/${p.id}/rendimiento`, {
        method: 'PATCH',
        token,
        body: {
          porciones_corto: valCorto,
          porciones_coctel: valCoctel,
        },
      });
      await onRefresh();
      setRendDrafts((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      onNotify(`Rendimiento actualizado para ${p.nombre}`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error guardando rendimiento de botella', true);
    } finally {
      setSavingRendId(null);
    }
  };

  const handleCrearProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProd(true);
    try {
      await apiRequest('/productos', {
        method: 'POST',
        token,
        body: {
          codigo,
          nombre,
          categoria,
          unidad,
          stock_minimo: Number(minimo) || 0,
          costo_referencia: Number(costoRef) || 0,
          tipo_envase: tipoEnvase || null,
          contenido_envase: tipoEnvase && contenidoEnvase.trim() !== '' ? Number(contenidoEnvase) : null,
          unidad_contenido: tipoEnvase ? unidadContenido : null,
          porciones_corto: porcionesCorto.trim() !== '' ? Number(porcionesCorto) : null,
          porciones_coctel: porcionesCoctel.trim() !== '' ? Number(porcionesCoctel) : null,
          stock_inicial_central: Number(stockIniCentral) || 0,
          stock_inicial_barra: Number(stockIniBarra) || 0,
        },
      });
      await onRefresh();
      setCodigo('');
      setNombre('');
      setMinimo('');
      setCostoRef('');
      setContenidoEnvase('');
      setPorcionesCorto('');
      setPorcionesCoctel('');
      setStockIniCentral('');
      setStockIniBarra('');
      onNotify('Producto y stock inicial manual guardados en maestro de Barra');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error al crear producto', true);
    } finally {
      setSavingProd(false);
    }
  };

  const openEditModal = (p: Producto) => {
    setEditingProd(p);
    setEditNombre(p.nombre);
    setEditCategoria(p.categoria);
    setEditUnidad(p.unidad);
    setEditMinimo(String(p.stock_minimo));
    setEditCosto(String(p.costo_referencia ?? 0));
    setEditStockIni(String(p.stock_inicial_sistema ?? 0));
    setEditEnvase(p.tipo_envase || '');
    setEditContenido(p.contenido_envase != null ? String(p.contenido_envase) : '');
    setEditUContenido(p.unidad_contenido || 'ml');
    setEditPorcionesCorto(p.porciones_corto != null ? String(p.porciones_corto) : '');
    setEditPorcionesCoctel(p.porciones_coctel != null ? String(p.porciones_coctel) : '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProd) return;
    setSavingEdit(true);
    try {
      await apiRequest(`/productos/${editingProd.id}`, {
        method: 'PATCH',
        token,
        body: {
          nombre: editNombre,
          categoria: editCategoria,
          unidad: editUnidad,
          stock_minimo: Number(editMinimo),
          costo_referencia: Number(editCosto),
          stock_inicial_sistema: Number(editStockIni),
          tipo_envase: editEnvase || null,
          contenido_envase: editEnvase && editContenido ? Number(editContenido) : null,
          unidad_contenido: editEnvase ? editUContenido : null,
          porciones_corto: editPorcionesCorto.trim() !== '' ? Number(editPorcionesCorto) : null,
          porciones_coctel: editPorcionesCoctel.trim() !== '' ? Number(editPorcionesCoctel) : null,
        },
      });
      await onRefresh();
      setEditingProd(null);
      onNotify('Parámetros del producto actualizados');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error al actualizar producto', true);
    } finally {
      setSavingEdit(false);
    }
  };

  const openStockIniModal = (p: Producto) => {
    setStockIniProd(p);
    setStockIniBodega('3');
    setStockIniCant('');
  };

  const handleGuardarStockIni = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockIniProd) return;
    setSavingStockIni(true);
    try {
      await apiRequest(`/productos/${stockIniProd.id}/stock-inicial`, {
        method: 'POST',
        token,
        body: {
          bodega_id: Number(stockIniBodega),
          cantidad: Number(stockIniCant),
          motivo: 'Stock inicial manual de comienzo del sistema',
        },
      });
      await onRefresh();
      setStockIniProd(null);
      onNotify('Stock inicial manual aplicado al inventario');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error aplicando stock inicial', true);
    } finally {
      setSavingStockIni(false);
    }
  };

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return onNotify('Selecciona un archivo .xlsx o .csv para cargar', true);
    setImporting(true);
    try {
      const isCsv = importFile.name.toLowerCase().endsWith('.csv');
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
        if (isCsv) {
          reader.onload = () => resolve(String(reader.result || ''));
          reader.readAsText(importFile, 'utf-8');
        } else {
          reader.onload = () => resolve(String(reader.result || ''));
          reader.readAsDataURL(importFile);
        }
      });

      const res = await apiRequest<{ ok: boolean; creados: number; actualizados: number; omitidos: number }>(
        '/productos/importar',
        {
          method: 'POST',
          token,
          body: {
            file_type: isCsv ? 'csv' : 'xlsx',
            content,
            reemplazar_existentes: replaceExisting,
          },
        }
      );
      await onRefresh();
      setShowImportModal(false);
      setImportFile(null);
      setReplaceExisting(false);
      onNotify(
        `Carga masiva completada: ${res.creados} creados, ${res.actualizados} actualizados`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error importando productos', true);
    } finally {
      setImporting(false);
    }
  };

  const handleIngreso = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetId = ingProdId || (estado.productos[0] ? String(estado.productos[0].id) : '');
    if (!targetId) return;
    const prod = estado.productos.find((p) => String(p.id) === targetId);
    const cantNum = Number(ingCant);
    if (!ingCant.trim() || !Number.isFinite(cantNum) || cantNum <= 0) {
      return onNotify('Ingresa una cantidad válida mayor a 0', true);
    }
    const costoFinal = ingCosto.trim() !== '' ? Number(ingCosto) : Number(prod?.costo_referencia ?? 0);
    setSavingIng(true);
    try {
      await apiRequest('/ingresos', {
        method: 'POST',
        token,
        body: {
          bodega_id: Number(ingBodega),
          producto_id: Number(targetId),
          cantidad: cantNum,
          costo_unitario: Number.isFinite(costoFinal) ? costoFinal : 0,
          fecha_vencimiento: ingVenc || null,
          motivo: ingMotivo,
        },
      });
      await onRefresh();
      setIngCant('');
      setIngCosto('');
      setIngVenc('');
      onNotify('Lote e ingreso de mercadería registrado correctamente');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error al registrar ingreso', true);
    } finally {
      setSavingIng(false);
    }
  };

  const cuadProd = estado.productos.find((p) => String(p.id) === cuadProdId) || estado.productos[0];
  const cuadTeorico = cuadProd ? (cuadBodega === '1' ? cuadProd.central : cuadProd.bar) : 0;
  const cuadDif = cuadFisico !== '' ? Math.round((Number(cuadFisico) - cuadTeorico) * 1000) / 1000 : null;
  const cuadDifValor = cuadDif !== null && cuadProd ? cuadDif * (cuadProd.costo_referencia ?? 0) : 0;

  const handleAplicarCuadratura = async () => {
    if (!cuadProd || cuadFisico === '') return;
    setSavingCuad(true);
    try {
      await apiRequest('/cuadratura/ajustar', {
        method: 'POST',
        token,
        body: {
          bodega_id: Number(cuadBodega),
          producto_id: cuadProd.id,
          conteo_fisico: Number(cuadFisico),
          motivo: cuadMotivo,
        },
      });
      await onRefresh();
      setConfirmCuad(false);
      setCuadFisico('');
      onNotify('Ajuste de cuadratura aplicado al inventario');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error al aplicar ajuste', true);
    } finally {
      setSavingCuad(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadExcelReport(token);
      onNotify('Reporte Excel multi-hoja descargado');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error exportando Excel', true);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Executive KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Ítems en Barra</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {estado.kpis.totalProductos}
          </p>
          <p className="mt-1 text-xs text-slate-500">Productos activos</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Alertas Stock Mínimo</p>
          <p className={`mt-2 text-2xl font-bold font-mono tabular-nums ${estado.kpis.alertasMinimo > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
            {estado.kpis.alertasMinimo}
          </p>
          <p className="mt-1 text-xs text-slate-500">{estado.kpis.sinStock} en cero</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Solicitudes por Despachar</p>
          <p className={`mt-2 text-2xl font-bold font-mono tabular-nums ${pendientes.length > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
            {pendientes.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">{estado.kpis.porRecibirBar} en tránsito a Barra</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Valor Total Inventario</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {fmtCLP((estado.kpis.valorBar || 0) + (estado.kpis.valorCentral || 0))}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            Barra {fmtCLP(estado.kpis.valorBar)} · Central {fmtCLP(estado.kpis.valorCentral)}
          </p>
        </div>
      </div>

      {/* Sub-navigation + Commercial Bulk Load Button */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
          <button
            type="button"
            onClick={() => setTab('despachos')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'despachos' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Despachos FEFO/FIFO ({pendientes.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('comparativa')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'comparativa' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Comparativa Cierres (AM/PM)
          </button>
          <button
            type="button"
            onClick={() => setTab('rendimiento')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'rendimiento' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Rendimiento Botellas
          </button>
          <button
            type="button"
            onClick={() => setTab('maestro')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'maestro' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Maestro y Stock Inicial
          </button>
          <button
            type="button"
            onClick={() => setTab('cuadratura')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'cuadratura' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Cuadratura Física
          </button>
          <button
            type="button"
            onClick={() => setTab('auditoria')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'auditoria' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Auditoría y Lotes
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Carga Masiva Productos</span>
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>{exporting ? 'Generando .XLSX...' : 'Exportar Excel'}</span>
          </button>
        </div>
      </div>

      {/* TAB 1: DESPACHOS */}
      {tab === 'despachos' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">Solicitudes de Barra Pendientes de Despacho</h2>
            <p className="text-xs text-slate-500 mt-1">
              Al aprobar y despachar, el sistema descuenta automáticamente de Bodega Central respetando lotes FEFO/FIFO y envía la orden a recepción de Barra.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4 text-left">ID / Fecha</th>
                  <th className="py-3 px-4 text-left">Producto</th>
                  <th className="py-3 px-4 text-left">Tipo / Motivo</th>
                  <th className="py-3 px-4 text-right">Stock Central</th>
                  <th className="py-3 px-4 text-right">Solicitado</th>
                  <th className="py-3 px-4 text-right">A Despachar</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {pendientes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 px-4 text-center text-sm text-slate-500">
                      No hay solicitudes pendientes de Barra en este momento.
                    </td>
                  </tr>
                ) : (
                  pendientes.map((s) => {
                    const centralAvail = s.stock_central ?? 0;
                    const insuf = centralAvail < s.cantidad_solicitada;
                    return (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                          #{s.id} · {s.fecha}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900">
                          {s.producto} <span className="text-xs text-slate-500">({s.unidad})</span>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          <span className="font-semibold text-slate-800">{s.tipo_solicitud}</span>
                          {s.observacion && <span> · {s.observacion}</span>}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                            insuf ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          {fmtQty(centralAvail)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {fmtQty(s.cantidad_solicitada)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            value={dispatchQtys[s.id] ?? String(s.cantidad_solicitada)}
                            onChange={(e) =>
                              setDispatchQtys((prev) => ({ ...prev, [s.id]: e.target.value }))
                            }
                            className="w-20 px-2.5 py-1.5 text-sm text-right border border-slate-300 rounded-lg font-mono tabular-nums"
                          />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              disabled={processingId === s.id || centralAvail <= 0}
                              onClick={() => handleDespachar(s.id, s.cantidad_solicitada)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Despachar</span>
                            </button>
                            <button
                              type="button"
                              disabled={processingId === s.id}
                              onClick={() => handleRechazar(s.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Rechazar</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: COMPARATIVA DE CIERRES MANUALES AM/PM */}
      {tab === 'comparativa' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Comparativa de Gerencia: Stock Teórico vs Cierre Manual (AM / PM)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Contrasta el saldo teórico esperado por el sistema contra el conteo manual declarado por el encargado de barra.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="date"
                  value={compFecha}
                  onChange={(e) => setCompFecha(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                />
                {compFecha && (
                  <button
                    type="button"
                    onClick={() => setCompFecha('')}
                    className="text-xs text-slate-600 hover:text-slate-900 underline cursor-pointer"
                  >
                    Todas fechas
                  </button>
                )}
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  {(['Todos', 'AM', 'PM'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setCompTurno(t)}
                      className={`px-3 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                        compTurno === t ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  Impacto neto:{' '}
                  <span
                    className={`font-mono tabular-nums font-bold ${
                      totalImpactoComparativa < 0 ? 'text-rose-700' : 'text-slate-900'
                    }`}
                  >
                    {totalImpactoComparativa < 0
                      ? `-${fmtCLP(Math.abs(totalImpactoComparativa))}`
                      : fmtCLP(totalImpactoComparativa)}
                  </span>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-3 px-4 text-left">Fecha / Turno</th>
                    <th className="py-3 px-4 text-left">Producto</th>
                    <th className="py-3 px-4 text-right">Inicio</th>
                    <th className="py-3 px-4 text-right">Ingresos</th>
                    <th className="py-3 px-4 text-right">Mermas</th>
                    <th className="py-3 px-4 text-right">Teórico Sistema</th>
                    <th className="py-3 px-4 text-right">Cierre Manual</th>
                    <th className="py-3 px-4 text-right">Diferencia</th>
                    <th className="py-3 px-4 text-right">Impacto ($)</th>
                    <th className="py-3 px-4 text-left">Responsable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredCierres.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-10 text-center text-slate-500">
                        No hay cierres manuales registrados con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filteredCierres.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <span className="font-mono text-slate-900">{c.fecha}</span>
                          <span className="mx-1.5 text-slate-300">·</span>
                          <span className="font-semibold text-slate-700">{c.turno}</span>
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-900">
                          {c.producto} <span className="font-mono text-slate-400">({c.codigo})</span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                          {fmtQty(c.stock_inicio)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-700">
                          +{fmtQty(c.ingresos)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-rose-700">
                          -{fmtQty(c.mermas)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-800">
                          {fmtQty(c.stock_teorico_esperado)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                          {fmtQty(c.stock_cierre)}
                        </td>
                        <td
                          className={`py-2.5 px-4 text-right font-mono tabular-nums font-bold ${
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
                        <td
                          className={`py-2.5 px-4 text-right font-mono tabular-nums font-semibold ${
                            (c.diferencia_valor || 0) < 0 ? 'text-rose-700' : 'text-slate-700'
                          }`}
                        >
                          {(c.diferencia_valor || 0) < 0
                            ? `-${fmtCLP(Math.abs(c.diferencia_valor || 0))}`
                            : fmtCLP(c.diferencia_valor)}
                        </td>
                        <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">{c.responsable}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Shift Recipe & Corto Deductions Traceability */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Descuentos de Tragos Compuestos y Cortos Asociados al Turno (AM / PM)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Rebajas automáticas de botellas e ingredientes ejecutadas por Barra según recetas y rendimiento configurado.
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {filteredConsumos.length} registros
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2.5 px-4 text-left">Fecha / Turno</th>
                    <th className="py-2.5 px-4 text-left">Modalidad</th>
                    <th className="py-2.5 px-4 text-left">Trago / Botella</th>
                    <th className="py-2.5 px-4 text-right">Porciones</th>
                    <th className="py-2.5 px-4 text-left">Detalle Descuento Stock</th>
                    <th className="py-2.5 px-4 text-right">Costo Total</th>
                    <th className="py-2.5 px-4 text-left">Responsable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredConsumos.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        No hay descuentos de recetas o cortos registrados para los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filteredConsumos.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <span className="font-mono text-slate-900">{c.fecha}</span>
                          <span className="mx-1.5 text-slate-300">·</span>
                          <span className="font-semibold text-slate-700">{c.turno}</span>
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
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {fmtCLP(c.costo_total)}
                        </td>
                        <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">{c.responsable}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2B: RENDIMIENTO DE BOTELLAS (CORTOS Y CÓCTELES) */}
      {tab === 'rendimiento' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Rendimiento Libre por Botella: Cortos y Cócteles
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Define libremente cuántas porciones rinde cada botella (Whisky, Ron, Piscos, Otros Licores, etc.) para descontar automáticamente los tragos compuestos y cortos en cada turno de Barra.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={rendSearch}
                  onChange={(e) => setRendSearch(e.target.value)}
                  placeholder="Buscar botella o código..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <select
                value={rendCat}
                onChange={(e) => setRendCat(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="Todas">Todas las categorías</option>
                {allCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-3 px-4 text-left">Código</th>
                  <th className="py-3 px-4 text-left">Producto / Envase</th>
                  <th className="py-3 px-4 text-right">Costo Botella</th>
                  <th className="py-3 px-4 text-left">Cortos / Botella (Whisky, Ron, Pisco...)</th>
                  <th className="py-3 px-4 text-left">Cócteles / Botella</th>
                  <th className="py-3 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredRendProds.map((p) => {
                  const draft = rendDrafts[p.id] || {};
                  const valCorto =
                    draft.corto !== undefined
                      ? draft.corto
                      : p.porciones_corto != null
                      ? String(p.porciones_corto)
                      : '';
                  const valCoctel =
                    draft.coctel !== undefined
                      ? draft.coctel
                      : p.porciones_coctel != null
                      ? String(p.porciones_coctel)
                      : '';

                  const numCorto = valCorto.trim() !== '' ? Number(valCorto) : null;
                  const numCoctel = valCoctel.trim() !== '' ? Number(valCoctel) : null;
                  const totalMl =
                    p.contenido_envase && p.unidad_contenido === 'L'
                      ? p.contenido_envase * 1000
                      : p.contenido_envase && p.unidad_contenido === 'ml'
                      ? p.contenido_envase
                      : null;
                  const costoBot = p.costo_referencia ?? 0;

                  const hasChanges = draft.corto !== undefined || draft.coctel !== undefined;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">{p.codigo}</td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{p.nombre}</div>
                        <div className="text-[11px] text-slate-500">
                          {p.categoria}
                          {totalMl ? ` · ${totalMl} ml por ${p.unidad}` : ` · ${p.unidad}`}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {fmtCLP(costoBot)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0.1"
                            step="any"
                            value={valCorto}
                            onChange={(e) =>
                              setRendDrafts((prev) => ({
                                ...prev,
                                [p.id]: { ...prev[p.id], corto: e.target.value },
                              }))
                            }
                            placeholder="Ej. 15"
                            className="w-24 px-2.5 py-1.5 text-xs text-right border border-slate-300 rounded-md bg-white font-mono tabular-nums font-bold focus:border-slate-900 focus:outline-none"
                          />
                          {numCorto && numCorto > 0 ? (
                            <span className="text-[11px] text-slate-500 font-mono tabular-nums whitespace-nowrap">
                              {totalMl ? `${Math.round(totalMl / numCorto)} ml` : '1/' + fmtQty(numCorto)} ·{' '}
                              {fmtCLP(Math.round(costoBot / numCorto))}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">Libre / sin definir</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0.1"
                            step="any"
                            value={valCoctel}
                            onChange={(e) =>
                              setRendDrafts((prev) => ({
                                ...prev,
                                [p.id]: { ...prev[p.id], coctel: e.target.value },
                              }))
                            }
                            placeholder="Ej. 12"
                            className="w-24 px-2.5 py-1.5 text-xs text-right border border-slate-300 rounded-md bg-white font-mono tabular-nums font-bold focus:border-slate-900 focus:outline-none"
                          />
                          {numCoctel && numCoctel > 0 ? (
                            <span className="text-[11px] text-slate-500 font-mono tabular-nums whitespace-nowrap">
                              {totalMl ? `${Math.round(totalMl / numCoctel)} ml` : '1/' + fmtQty(numCoctel)} ·{' '}
                              {fmtCLP(Math.round(costoBot / numCoctel))}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">Libre / sin definir</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          disabled={savingRendId === p.id}
                          onClick={() => handleGuardarRendimiento(p)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                            hasChanges
                              ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                              : 'bg-slate-900 hover:bg-slate-800 text-white'
                          } disabled:opacity-50`}
                        >
                          {savingRendId === p.id ? 'Guardando...' : 'Guardar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: MAESTRO, STOCK INICIAL MANUAL E INGRESOS */}
      {tab === 'maestro' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Create Product */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Plus className="w-4 h-4 text-slate-700" />
                <h2 className="text-base font-semibold text-slate-900">Nuevo Producto + Stock Inicial Manual</h2>
              </div>

              <form onSubmit={handleCrearProducto} className="space-y-3.5">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Código</label>
                    <input
                      type="text"
                      required
                      value={codigo}
                      onChange={(e) => setCodigo(e.target.value)}
                      placeholder="BAR-015"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono uppercase"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre del Producto</label>
                    <input
                      type="text"
                      required
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      placeholder="WHISKY BALLANTINES FINEST 750 ML"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg uppercase"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">Categoría</label>
                      <button
                        type="button"
                        onClick={() => setShowNewCatCreate((v) => !v)}
                        className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                      >
                        {showNewCatCreate ? 'Cancelar' : '+ Nueva categoría'}
                      </button>
                    </div>
                    {showNewCatCreate ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={newCatCreateName}
                          onChange={(e) => setNewCatCreateName(e.target.value)}
                          placeholder="Ej. Verduras, Vajilla, Vinos..."
                          className="w-full px-2.5 py-2 text-xs border border-slate-900 rounded-lg bg-white"
                        />
                        <button
                          type="button"
                          disabled={savingCat}
                          onClick={() => handleCrearCategoriaInline('create')}
                          className="px-2.5 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg shrink-0 cursor-pointer"
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
                        {allCategories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Unidad de Stock</label>
                    <select
                      value={unidad}
                      onChange={(e) => setUnidad(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="botella">botella</option>
                      <option value="unidad">unidad</option>
                      <option value="lata">lata</option>
                      <option value="barril">barril</option>
                      <option value="L">L</option>
                      <option value="ml">ml</option>
                      <option value="caja">caja</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo Envase</label>
                    <select
                      value={tipoEnvase}
                      onChange={(e) => setTipoEnvase(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="">Sin especificar</option>
                      <option value="botella">botella</option>
                      <option value="lata">lata</option>
                      <option value="bidón">bidón</option>
                      <option value="barril">barril</option>
                      <option value="caja">caja</option>
                      <option value="otro">otro</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Contenido</label>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      disabled={!tipoEnvase}
                      value={contenidoEnvase}
                      onChange={(e) => setContenidoEnvase(e.target.value)}
                      placeholder="750"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums disabled:bg-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Unidad Cont.</label>
                    <select
                      disabled={!tipoEnvase}
                      value={unidadContenido}
                      onChange={(e) => setUnidadContenido(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
                    >
                      <option value="ml">ml</option>
                      <option value="L">L</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Mínimo Barra</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={minimo}
                      onChange={(e) => setMinimo(e.target.value)}
                      placeholder="4"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Costo Ref. ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={costoRef}
                      onChange={(e) => setCostoRef(e.target.value)}
                      placeholder="6500"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Ini. Central</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={stockIniCentral}
                      onChange={(e) => setStockIniCentral(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Ini. Barra</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={stockIniBarra}
                      onChange={(e) => setStockIniBarra(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Cortos / Botella (Opcional)
                    </label>
                    <input
                      type="number"
                      min="0.1"
                      step="any"
                      value={porcionesCorto}
                      onChange={(e) => setPorcionesCorto(e.target.value)}
                      placeholder="Ej. 15"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Cócteles / Botella (Opcional)
                    </label>
                    <input
                      type="number"
                      min="0.1"
                      step="any"
                      value={porcionesCoctel}
                      onChange={(e) => setPorcionesCoctel(e.target.value)}
                      placeholder="Ej. 12"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingProd}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {savingProd ? 'Guardando producto...' : 'Guardar en Maestro de Barra'}
                </button>
              </form>
            </div>

            {/* Stock Entry */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <PackagePlus className="w-4 h-4 text-slate-700" />
                <h2 className="text-base font-semibold text-slate-900">Ingreso de Mercadería / Compras (Lotes FEFO)</h2>
              </div>

              <form onSubmit={handleIngreso} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Bodega Destino</label>
                    <select
                      value={ingBodega}
                      onChange={(e) => setIngBodega(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="1">Bodega Central</option>
                      <option value="3">Barra Principal (Directo)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Concepto</label>
                    <select
                      value={ingMotivo}
                      onChange={(e) => setIngMotivo(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="Ingreso de mercadería">Compra / Factura</option>
                      <option value="Stock inicial manual">Stock inicial manual</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Producto</label>
                  <select
                    value={ingProdId || (estado.productos[0] ? String(estado.productos[0].id) : '')}
                    onChange={(e) => {
                      setIngProdId(e.target.value);
                      setIngCant('');
                      setIngCosto('');
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {estado.productos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} ({p.codigo})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Cantidad</label>
                    <input
                      type="number"
                      min="0.001"
                      step="any"
                      required
                      value={ingCant}
                      onChange={(e) => setIngCant(e.target.value)}
                      placeholder="Ej. 6"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Costo Unit. ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={ingCosto}
                      onChange={(e) => setIngCosto(e.target.value)}
                      placeholder={String(
                        estado.productos.find((x) => String(x.id) === (ingProdId || String(estado.productos[0]?.id || '')))?.costo_referencia ?? 0
                      )}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Vencimiento (FEFO)</label>
                    <input
                      type="date"
                      value={ingVenc}
                      onChange={(e) => setIngVenc(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingIng}
                  className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {savingIng ? 'Registrando lote...' : 'Registrar Ingreso en Bodega'}
                </button>
              </form>
            </div>
          </div>

          {/* Master Valued Stock Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">Maestro de Stock Inicial, Barra y Costos Valorizados</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4 text-left">Código</th>
                    <th className="py-3 px-4 text-left">Producto / Categoría</th>
                    <th className="py-3 px-4 text-right">Stock Inicial</th>
                    <th className="py-3 px-4 text-right">Stock Barra</th>
                    <th className="py-3 px-4 text-right">Bodega Central</th>
                    <th className="py-3 px-4 text-right">Costo Ref.</th>
                    <th className="py-3 px-4 text-right">Valor Total</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {estado.productos.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono text-xs text-slate-600">{p.codigo}</td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{p.nombre}</div>
                        <div className="text-xs text-slate-500">
                          {p.categoria} · {p.unidad}
                          {p.tipo_envase ? ` · ${p.contenido_envase || ''} ${p.unidad_contenido || ''} (${p.tipo_envase})` : ''}
                          {p.porciones_corto ? ` · ${fmtQty(p.porciones_corto)} cortos/bot` : ''}
                          {p.porciones_coctel ? ` · ${fmtQty(p.porciones_coctel)} cócteles/bot` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">
                        {fmtQty(p.stock_inicial_sistema)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {fmtQty(p.bar)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {fmtQty(p.central)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {fmtCLP(p.costo_referencia)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {fmtCLP((p.valor_bar || 0) + (p.valor_central || 0))}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openStockIniModal(p)}
                            className="px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                          >
                            Stock Ini.
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Editar</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: CUADRATURA FÍSICA */}
      {tab === 'cuadratura' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-3xl">
          <div className="flex items-center gap-2 mb-2">
            <Scale className="w-5 h-5 text-slate-700" />
            <h2 className="text-base font-semibold text-slate-900">Cuadratura Física vs Sistema</h2>
          </div>
          <p className="text-xs text-slate-500 mb-5">
            Compara tu conteo físico con las existencias del sistema (Conteo Físico − Sistema = Diferencia).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Bodega a auditar</label>
              <select
                value={cuadBodega}
                onChange={(e) => {
                  setCuadBodega(e.target.value);
                  setConfirmCuad(false);
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="3">Barra Principal</option>
                <option value="1">Bodega Central</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Producto</label>
              <select
                value={cuadProd ? String(cuadProd.id) : ''}
                onChange={(e) => {
                  setCuadProdId(e.target.value);
                  setCuadFisico('');
                  setConfirmCuad(false);
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {estado.productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Conteo Físico Real</label>
              <input
                type="number"
                min="0"
                step="any"
                value={cuadFisico}
                onChange={(e) => {
                  setCuadFisico(e.target.value);
                  setConfirmCuad(false);
                }}
                placeholder="Ingresa cantidad..."
                className="w-full px-3 py-2 text-sm border border-slate-900 rounded-lg bg-amber-50/60 font-mono tabular-nums font-bold"
              />
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 mb-5">
            <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
              <span className="text-slate-600">
                Stock en sistema ({cuadBodega === '1' ? 'Bodega Central' : 'Barra Principal'}):
              </span>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                {fmtQty(cuadTeorico)} {cuadProd?.unidad}
              </span>
            </div>
            {cuadDif !== null && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
                  <span className="text-slate-600">Diferencia detectada:</span>
                  <span
                    className={`font-mono tabular-nums font-bold ${
                      Math.abs(cuadDif) < 0.0001
                        ? 'text-emerald-700'
                        : cuadDif < 0
                        ? 'text-rose-700'
                        : 'text-amber-700'
                    }`}
                  >
                    {cuadDif > 0 ? `+${fmtQty(cuadDif)}` : fmtQty(cuadDif)} {cuadProd?.unidad} (
                    {Math.abs(cuadDif) < 0.0001 ? 'CUADRA EXACTO' : cuadDif < 0 ? 'FALTANTE' : 'SOBRANTE'})
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
                  <span>Impacto valorizado estimado:</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-800">
                    {cuadDifValor >= 0 ? fmtCLP(cuadDifValor) : `-${fmtCLP(Math.abs(cuadDifValor))}`}
                  </span>
                </div>
              </>
            )}
          </div>

          {cuadDif !== null && Math.abs(cuadDif) >= 0.0001 && (
            <div className="space-y-3 pt-2 border-t border-slate-200">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Motivo del ajuste</label>
                <input
                  type="text"
                  maxLength={200}
                  value={cuadMotivo}
                  onChange={(e) => setCuadMotivo(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                />
              </div>

              {!confirmCuad ? (
                <button
                  type="button"
                  onClick={() => setConfirmCuad(true)}
                  className="px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors cursor-pointer"
                >
                  Ajustar Inventario al Conteo Físico
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <span className="text-xs font-medium text-amber-900">
                    ¿Confirmar ajuste oficial de {cuadDif > 0 ? `+${fmtQty(cuadDif)}` : fmtQty(cuadDif)} {cuadProd?.unidad}?
                  </span>
                  <button
                    type="button"
                    disabled={savingCuad}
                    onClick={handleAplicarCuadratura}
                    className="px-3 py-1.5 text-xs font-semibold bg-amber-700 hover:bg-amber-800 text-white rounded-md cursor-pointer"
                  >
                    {savingCuad ? 'Aplicando...' : 'Sí, aplicar ajuste'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmCuad(false)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: AUDITORÍA Y LOTES */}
      {tab === 'auditoria' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Maestro Gerencial de Movimientos</h2>
                <p className="text-xs text-slate-500">Auditoría completa de ingresos, traspasos, descuentos de cóctel, mermas y cierres</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Filtrar producto o detalle..."
                    className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <select
                  value={auditTipo}
                  onChange={(e) => setAuditTipo(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  {movTipos.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4 text-left">Fecha / Hora</th>
                    <th className="py-2.5 px-4 text-left">Tipo Evento</th>
                    <th className="py-2.5 px-4 text-left">Bodega</th>
                    <th className="py-2.5 px-4 text-left">Producto</th>
                    <th className="py-2.5 px-4 text-right">Cantidad</th>
                    <th className="py-2.5 px-4 text-right">Costo Unit.</th>
                    <th className="py-2.5 px-4 text-left">Detalle / Auditoría</th>
                    <th className="py-2.5 px-4 text-left">Responsable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredMovs.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono text-slate-500 whitespace-nowrap">{m.fecha}</td>
                      <td className="py-2.5 px-4 font-semibold text-slate-900 whitespace-nowrap">{m.tipo}</td>
                      <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">{m.bodega}</td>
                      <td className="py-2.5 px-4 font-medium text-slate-900">
                        {m.producto} <span className="font-mono text-slate-400">({m.codigo})</span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {fmtQty(m.cantidad)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                        {fmtCLP(m.costo_unitario)}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{m.motivo || '—'}</td>
                      <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">{m.responsable}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Active FEFO/FIFO Lots */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-700" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Lotes Activos (Orden de Consumo FEFO / FIFO)</h3>
                <p className="text-xs text-slate-500">Se consumen primero los lotes con vencimiento más próximo y luego los más antiguos</p>
              </div>
            </div>
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4 text-left">Lote #</th>
                    <th className="py-2.5 px-4 text-left">Bodega</th>
                    <th className="py-2.5 px-4 text-left">Producto</th>
                    <th className="py-2.5 px-4 text-right">Disponible</th>
                    <th className="py-2.5 px-4 text-right">Inicial</th>
                    <th className="py-2.5 px-4 text-right">Costo Unit.</th>
                    <th className="py-2.5 px-4 text-left">Vencimiento</th>
                    <th className="py-2.5 px-4 text-left">Referencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {estado.lotes.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="py-2 px-4 font-mono text-slate-500">L-{l.id}</td>
                      <td className="py-2 px-4 font-medium text-slate-800 whitespace-nowrap">{l.bodega_nombre}</td>
                      <td className="py-2 px-4 text-slate-900">
                        {l.producto_nombre} <span className="font-mono text-slate-400">({l.producto_codigo})</span>
                      </td>
                      <td className="py-2 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                        {fmtQty(l.cantidad_disponible)}
                      </td>
                      <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-500">
                        {fmtQty(l.cantidad_inicial)}
                      </td>
                      <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-700">
                        {fmtCLP(l.costo_unitario)}
                      </td>
                      <td className="py-2 px-4 font-mono text-slate-600 whitespace-nowrap">
                        {l.fecha_vencimiento || 'Sin vencimiento'}
                      </td>
                      <td className="py-2 px-4 text-slate-500">{l.referencia || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal (Commercial Client Import) */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
                <h3 className="text-base font-semibold text-slate-900">Carga Masiva de Productos y Valores</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Ideal para clientes nuevos: descarga la plantilla oficial en Excel, completa tus productos, categorías (Whisky, Piscos, Cervezas, Otros Licores, Gaseosas, Jugos, Verduras, Vajilla o cualquier categoría propia), valores y stock inicial manual, y cárgala aquí.
            </p>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-900">1. Descarga la plantilla modelo</p>
                <p className="text-[11px] text-slate-500">Incluye columnas de stock inicial y costos</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  downloadImportTemplate(token).catch((err) =>
                    onNotify(err instanceof Error ? err.message : 'Error descargando plantilla', true)
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-100 text-slate-900 rounded-lg cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Plantilla .XLSX</span>
              </button>
            </div>

            <form onSubmit={handleBulkImport} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  2. Selecciona tu archivo (.xlsx o .csv)
                </label>
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-900 file:text-white hover:file:bg-slate-800 cursor-pointer"
                />
              </div>

              <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300"
                />
                <span>
                  Reemplazar catálogo de demostración actual antes de cargar (útil para iniciar un local real desde cero).
                </span>
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={importing || !importFile}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{importing ? 'Importando...' : 'Cargar Productos al Sistema'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Initial Stock Modal */}
      {stockIniProd && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                Stock Inicial Manual · {stockIniProd.codigo}
              </h3>
              <button
                type="button"
                onClick={() => setStockIniProd(null)}
                className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-600">{stockIniProd.nombre}</p>

            <form onSubmit={handleGuardarStockIni} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Bodega</label>
                <select
                  value={stockIniBodega}
                  onChange={(e) => {
                    setStockIniBodega(e.target.value);
                    setStockIniCant('');
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="3">Barra Principal (Actual: {fmtQty(stockIniProd.bar)})</option>
                  <option value="1">Bodega Central (Actual: {fmtQty(stockIniProd.central)})</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cantidad Inicial Exacta ({stockIniProd.unidad})
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={stockIniCant}
                  onChange={(e) => setStockIniCant(e.target.value)}
                  placeholder={`Actual: ${fmtQty(stockIniBodega === '1' ? stockIniProd.central : stockIniProd.bar)}`}
                  className="w-full px-3 py-2 text-sm border border-slate-900 rounded-lg bg-amber-50/50 font-mono tabular-nums font-bold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setStockIniProd(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingStockIni}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {savingStockIni ? 'Aplicando...' : 'Fijar Stock Inicial'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {editingProd && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                Editar Producto · {editingProd.codigo}
              </h3>
              <button
                type="button"
                onClick={() => setEditingProd(null)}
                className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">Categoría</label>
                    <button
                      type="button"
                      onClick={() => setShowNewCatEdit((v) => !v)}
                      className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                    >
                      {showNewCatEdit ? 'Cancelar' : '+ Nueva categoría'}
                    </button>
                  </div>
                  {showNewCatEdit ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={newCatEditName}
                        onChange={(e) => setNewCatEditName(e.target.value)}
                        placeholder="Ej. Verduras, Vajilla..."
                        className="w-full px-2.5 py-2 text-xs border border-slate-900 rounded-lg bg-white"
                      />
                      <button
                        type="button"
                        disabled={savingCat}
                        onClick={() => handleCrearCategoriaInline('edit')}
                        className="px-2.5 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg shrink-0 cursor-pointer"
                      >
                        Crear
                      </button>
                    </div>
                  ) : (
                    <select
                      value={editCategoria}
                      onChange={(e) => setEditCategoria(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      {allCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Unidad</label>
                  <select
                    value={editUnidad}
                    onChange={(e) => setEditUnidad(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="botella">botella</option>
                    <option value="unidad">unidad</option>
                    <option value="lata">lata</option>
                    <option value="barril">barril</option>
                    <option value="L">L</option>
                    <option value="ml">ml</option>
                    <option value="caja">caja</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Stock Mínimo Barra</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={editMinimo}
                    onChange={(e) => setEditMinimo(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Costo Ref. ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={editCosto}
                    onChange={(e) => setEditCosto(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Stock Inicial Sist.</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={editStockIni}
                    onChange={(e) => setEditStockIni(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo Envase</label>
                  <select
                    value={editEnvase}
                    onChange={(e) => setEditEnvase(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Sin especificar</option>
                    <option value="botella">botella</option>
                    <option value="lata">lata</option>
                    <option value="bidón">bidón</option>
                    <option value="barril">barril</option>
                    <option value="caja">caja</option>
                    <option value="otro">otro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Contenido</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    disabled={!editEnvase}
                    value={editContenido}
                    onChange={(e) => setEditContenido(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Unidad Cont.</label>
                  <select
                    disabled={!editEnvase}
                    value={editUContenido}
                    onChange={(e) => setEditUContenido(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
                  >
                    <option value="ml">ml</option>
                    <option value="L">L</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Porciones Corto / Botella
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    value={editPorcionesCorto}
                    onChange={(e) => setEditPorcionesCorto(e.target.value)}
                    placeholder="Ej. 15"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Porciones Cóctel / Botella
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    value={editPorcionesCoctel}
                    onChange={(e) => setEditPorcionesCoctel(e.target.value)}
                    placeholder="Ej. 12"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingProd(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {savingEdit ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
