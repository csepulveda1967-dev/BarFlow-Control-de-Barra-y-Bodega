import {
  DEFAULT_INSUMO_CONTROL,
  DEFAULT_SEED_CATEGORIES,
  formatDisplayTS,
  nowISO,
  type DataRepository,
  type DbProducto,
} from '../db/shared';
import type { EstadoApp } from '../types';

export interface EngineUser {
  email: string;
  rol: 'Gerencia' | 'Bar';
  empresa: number;
  nombre: string;
}

export class EngineError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'EngineError';
    this.status = status;
  }
}

export const VALID_UNITS = ['unidad', 'botella', 'lata', 'ml', 'L', 'barril', 'caja'];
export const VALID_CATEGORIES = DEFAULT_SEED_CATEGORIES;
export const VALID_ENVASES = ['botella', 'lata', 'bidón', 'barril', 'caja', 'otro'];
export const VALID_CONTENIDO_UNITS = ['ml', 'L'];
export const VALID_TURNOS = ['AM', 'PM'] as const;

export function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function npos(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10000) / 10000 : null;
}

export function nnonneg(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10000) / 10000 : null;
}

export function normalizeCategory(raw: unknown, fallback = 'Otros Licores'): string {
  const txt = String(raw || '').trim();
  if (!txt) return fallback;
  const found = VALID_CATEGORIES.find((c) => c.toLowerCase() === txt.toLowerCase());
  if (found) return found;
  const low = txt.toLowerCase();
  if (low === 'wisky' || low === 'wiksky' || low === 'whiskey') return 'Whisky';
  return txt;
}

export function convertIngredientToStockUnits(
  prod: Pick<DbProducto, 'contenido_envase' | 'unidad_contenido' | 'porciones_corto' | 'porciones_coctel'>,
  cantidad: number,
  unidadMedida: string
): number {
  const uMed = unidadMedida.trim().toLowerCase();
  if (uMed === 'corto' || uMed === 'porcion_corto') {
    const yieldCorto = Number(prod.porciones_corto || 0);
    if (yieldCorto > 0) {
      return Math.round((cantidad / yieldCorto) * 10000) / 10000;
    }
  }
  if (uMed === 'coctel' || uMed === 'cóctel' || uMed === 'porcion_coctel') {
    const yieldCoctel = Number(prod.porciones_coctel || 0);
    if (yieldCoctel > 0) {
      return Math.round((cantidad / yieldCoctel) * 10000) / 10000;
    }
  }
  if (uMed === 'ml' || uMed === 'l') {
    const qtyMl = uMed === 'l' ? cantidad * 1000 : cantidad;
    const rawCont = Number(prod.contenido_envase || 0);
    if (rawCont > 0) {
      const envaseMl = (prod.unidad_contenido || 'ml').trim().toLowerCase() === 'l' ? rawCont * 1000 : rawCont;
      if (envaseMl > 0) {
        return Math.round((qtyMl / envaseMl) * 10000) / 10000;
      }
    }
  }
  return Math.round(cantidad * 10000) / 10000;
}

export function parseCsvRows(csvText: string): Array<Record<string, string>> {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const sep = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === sep && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };
  const headers = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitLine(lines[i]);
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rec[h] = vals[idx] ?? '';
    });
    rows.push(rec);
  }
  return rows;
}

export function createBarflowEngine(repo: DataRepository, empresaId: number) {
  function requireAdmin(user: EngineUser) {
    if (user.rol !== 'Gerencia') {
      throw new EngineError('Acceso restringido exclusivamente a Gerencia', 403);
    }
  }

  async function deductLotsFEFO(
    productoId: number,
    bodegaId: number,
    cantidad: number
  ): Promise<Array<{ loteId: number; qty: number; costo: number; vencimiento: string | null }>> {
    const lotes = await repo.getActiveLotesForProductBodega(empresaId, productoId, bodegaId);
    const disponibleTotal = lotes.reduce((sum, l) => sum + Number(l.cantidad_disponible || 0), 0);

    if (disponibleTotal + 0.0005 < cantidad) {
      throw new EngineError(
        `Stock insuficiente en ${bodegaId === 1 ? 'Bodega Central' : 'Barra Principal'}. Disponible: ${Math.round(disponibleTotal * 1000) / 1000}`,
        409
      );
    }

    let pendiente = cantidad;
    const deducted: Array<{ loteId: number; qty: number; costo: number; vencimiento: string | null }> = [];

    for (const lote of lotes) {
      if (pendiente <= 0.00005) break;
      const avail = Number(lote.cantidad_disponible || 0);
      const take = Math.min(avail, pendiente);
      const newAvail = Math.max(0, Math.round((avail - take) * 10000) / 10000);

      await repo.updateLoteDisponible(lote.id, empresaId, newAvail);

      deducted.push({
        loteId: lote.id,
        qty: Math.round(take * 10000) / 10000,
        costo: Number(lote.costo_unitario || 0),
        vencimiento: lote.fecha_vencimiento,
      });
      pendiente = Math.round((pendiente - take) * 10000) / 10000;
    }

    return deducted;
  }

  async function buildEstado(isGerencia: boolean): Promise<Omit<EstadoApp, 'rol' | 'email'>> {
    const snap = await repo.getSnapshot(empresaId);

    const prodMap = new Map(snap.productos.map((p) => [p.id, p]));
    const provMap = new Map(snap.proveedores.map((pr) => [pr.id, pr]));
    const vasoMap = new Map(snap.vasos.map((v) => [v.id, v]));

    const stockByProd = new Map<
      number,
      { bar: number; central: number; valorBar: number; valorCentral: number }
    >();

    for (const p of snap.productos) {
      stockByProd.set(p.id, { bar: 0, central: 0, valorBar: 0, valorCentral: 0 });
    }

    for (const l of snap.lotes) {
      const entry = stockByProd.get(l.producto_id);
      if (!entry) continue;
      const q = Number(l.cantidad_disponible || 0);
      const v = q * Number(l.costo_unitario || 0);
      if (l.bodega_id === 1) {
        entry.central = Math.round((entry.central + q) * 1000) / 1000;
        entry.valorCentral += v;
      } else if (l.bodega_id === 3) {
        entry.bar = Math.round((entry.bar + q) * 1000) / 1000;
        entry.valorBar += v;
      }
    }

    const productos = snap.productos.map((p) => {
      const st = stockByProd.get(p.id) || { bar: 0, central: 0, valorBar: 0, valorCentral: 0 };
      const base = {
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        categoria: normalizeCategory(p.categoria),
        unidad: p.unidad,
        stock_inicial_sistema: Number(p.stock_inicial_sistema || 0),
        stock_minimo: Number(p.stock_minimo || 0),
        tipo_envase: p.tipo_envase,
        contenido_envase: p.contenido_envase,
        unidad_contenido: p.unidad_contenido,
        porciones_corto: p.porciones_corto ?? null,
        porciones_coctel: p.porciones_coctel ?? null,
        bar: st.bar,
        central: isGerencia ? st.central : 0,
      };
      if (isGerencia) {
        return {
          ...base,
          costo_referencia: Number(p.costo_referencia || 0),
          valor_bar: Math.round(st.valorBar),
          valor_central: Math.round(st.valorCentral),
        };
      }
      return base;
    });

    const solicitudes = snap.solicitudes
      .filter((s) => prodMap.has(s.producto_id))
      .map((s) => {
        const p = prodMap.get(s.producto_id)!;
        const st = stockByProd.get(s.producto_id);
        return {
          id: s.id,
          fecha: formatDisplayTS(s.fecha),
          producto_id: s.producto_id,
          producto: p.nombre,
          codigo: p.codigo,
          unidad: p.unidad,
          cantidad_solicitada: Number(s.cantidad_solicitada),
          cantidad_despachada: s.cantidad_despachada != null ? Number(s.cantidad_despachada) : null,
          cantidad_entregada: s.cantidad_entregada != null ? Number(s.cantidad_entregada) : null,
          tipo_solicitud: s.tipo_solicitud || 'Reposición',
          estado: s.estado,
          solicitante: s.solicitante,
          observacion: s.observacion,
          fecha_despacho: formatDisplayTS(s.fecha_despacho) || null,
          fecha_recepcion: formatDisplayTS(s.fecha_recepcion) || null,
          ...(isGerencia ? { stock_central: st?.central ?? 0 } : {}),
          stock_bar: st?.bar ?? 0,
        };
      });

    const movimientos = snap.movimientos
      .filter((m) => prodMap.has(m.producto_id) && (isGerencia || m.bodega_id === 3))
      .slice(0, 300)
      .map((m) => {
        const p = prodMap.get(m.producto_id)!;
        return {
          id: m.id,
          fecha: formatDisplayTS(m.fecha),
          tipo: m.tipo,
          producto_id: m.producto_id,
          codigo: p.codigo,
          producto: p.nombre,
          bodega_id: m.bodega_id,
          bodega: m.bodega_id === 1 ? 'Bodega Central' : 'Barra Principal',
          cantidad: Number(m.cantidad),
          ...(isGerencia ? { costo_unitario: Number(m.costo_unitario || 0) } : {}),
          motivo: m.motivo,
          responsable: m.responsable,
        };
      });

    const lotes = snap.lotes
      .filter((l) => prodMap.has(l.producto_id) && (isGerencia || l.bodega_id === 3))
      .map((l) => {
        const p = prodMap.get(l.producto_id)!;
        return {
          id: l.id,
          producto_id: l.producto_id,
          producto_nombre: p.nombre,
          producto_codigo: p.codigo,
          bodega_id: l.bodega_id,
          bodega_nombre: l.bodega_id === 1 ? 'Bodega Central' : 'Barra Principal',
          cantidad_inicial: Number(l.cantidad_inicial),
          cantidad_disponible: Number(l.cantidad_disponible),
          ...(isGerencia ? { costo_unitario: Number(l.costo_unitario || 0) } : {}),
          fecha_vencimiento: l.fecha_vencimiento,
          fecha_ingreso: formatDisplayTS(l.fecha_ingreso),
          referencia: l.referencia,
        };
      });

    const cierres = snap.cierres
      .filter((c) => prodMap.has(c.producto_id))
      .map((c) => {
        const p = prodMap.get(c.producto_id)!;
        const teorico = Number(
          c.stock_teorico_esperado ?? Math.round((Number(c.stock_inicio) + Number(c.ingresos) - Number(c.mermas)) * 1000) / 1000
        );
        const diff = Number(
          c.diferencia_comparativa ?? Math.round((Number(c.stock_cierre) - teorico) * 1000) / 1000
        );
        return {
          id: c.id,
          fecha: c.fecha,
          turno: (c.turno === 'PM' ? 'PM' : 'AM') as 'AM' | 'PM',
          producto_id: c.producto_id,
          codigo: p.codigo,
          producto: p.nombre,
          unidad: p.unidad,
          stock_inicio: Number(c.stock_inicio),
          ingresos: Number(c.ingresos),
          mermas: Number(c.mermas),
          stock_teorico_esperado: teorico,
          consumo_calculado: Number(c.consumo_calculado),
          stock_cierre: Number(c.stock_cierre),
          diferencia_comparativa: diff,
          ...(isGerencia ? { diferencia_valor: Math.round(diff * Number(p.costo_referencia || 0)) } : {}),
          responsable: c.responsable,
          observacion: c.observacion,
        };
      });

    const proveedores = snap.proveedores.map((pr) => ({
      id: pr.id,
      nombre: pr.nombre,
      contacto: pr.contacto,
      telefono_wsp: pr.telefono_wsp,
      email: pr.email,
      categoria: pr.categoria,
      rut: pr.rut,
      notas: pr.notas,
    }));

    const insumos = snap.insumos.map((ins) => {
      const prov = ins.proveedor_id ? provMap.get(ins.proveedor_id) : null;
      return {
        id: ins.id,
        codigo: ins.codigo,
        nombre: ins.nombre,
        categoria: ins.categoria || 'Insumos de Barra',
        criterio: ins.criterio ?? null,
        unidad: ins.unidad,
        stock_actual: Number(ins.stock_actual || 0),
        stock_minimo: Number(ins.stock_minimo || 0),
        ...(isGerencia ? { costo_unitario: Number(ins.costo_unitario || 0) } : {}),
        proveedor_id: ins.proveedor_id,
        proveedor_nombre: prov?.nombre || null,
        proveedor_wsp: prov?.telefono_wsp || null,
        solicitable_por_bar: ins.solicitable_por_bar ?? true,
        max_por_solicitud: ins.max_por_solicitud != null ? Number(ins.max_por_solicitud) : null,
        notas: ins.notas,
      };
    });

    const insumoControl = snap.insumoControl || {
      empresa_id: empresaId,
      ...DEFAULT_INSUMO_CONTROL,
    };

    const solicitudesInsumos = (snap.solicitudesInsumos || []).map((si) => {
      const prov = si.proveedor_id ? provMap.get(si.proveedor_id) : null;
      return {
        id: si.id,
        fecha: formatDisplayTS(si.fecha),
        insumo_id: si.insumo_id,
        nombre_item: si.nombre_item,
        categoria: si.categoria || 'Insumos de Barra',
        unidad: si.unidad,
        cantidad_solicitada: Number(si.cantidad_solicitada),
        criterio: si.criterio,
        proveedor_id: si.proveedor_id,
        proveedor_nombre: prov?.nombre || null,
        proveedor_wsp: prov?.telefono_wsp || null,
        estado: si.estado,
        solicitante: si.solicitante,
        observacion: si.observacion,
      };
    });

    const catSet = new Set<string>(DEFAULT_SEED_CATEGORIES);
    for (const c of snap.categorias || []) {
      if (c.nombre) catSet.add(c.nombre);
    }
    for (const p of productos) {
      if (p.categoria) catSet.add(p.categoria);
    }
    for (const ins of insumos) {
      if (ins.categoria) catSet.add(ins.categoria);
    }
    const categorias = Array.from(catSet).sort((a, b) => a.localeCompare(b, 'es'));

    const recetas = snap.recetas.map((rec) => {
      const rawIngs = snap.recetaIngredientes.filter((ri) => ri.receta_id === rec.id && prodMap.has(ri.producto_id));
      let costoTotal = 0;
      const ingredientes = rawIngs.map((ri) => {
        const p = prodMap.get(ri.producto_id)!;
        const st = stockByProd.get(p.id);
        const frac = convertIngredientToStockUnits(p, Number(ri.cantidad_ml_o_unidad), ri.unidad_medida);
        const costoIng = Math.round(frac * Number(p.costo_referencia || 0));
        costoTotal += costoIng;
        return {
          id: ri.id,
          receta_id: rec.id,
          producto_id: p.id,
          producto_nombre: p.nombre,
          producto_codigo: p.codigo,
          producto_unidad: p.unidad,
          contenido_envase: p.contenido_envase,
          unidad_contenido: p.unidad_contenido,
          porciones_corto: p.porciones_corto ?? null,
          porciones_coctel: p.porciones_coctel ?? null,
          cantidad_ml_o_unidad: Number(ri.cantidad_ml_o_unidad),
          unidad_medida: ri.unidad_medida,
          ...(isGerencia ? { costo_ingrediente: costoIng } : {}),
          stock_bar_actual: st?.bar ?? 0,
        };
      });

      const precioVenta = Number(rec.precio_venta || 0);
      const margenBruto = Math.round(precioVenta - costoTotal);
      const margenPct = precioVenta > 0 ? Math.round((margenBruto / precioVenta) * 1000) / 10 : 0;

      return {
        id: rec.id,
        codigo: rec.codigo,
        nombre: rec.nombre,
        categoria: rec.categoria,
        ...(isGerencia
          ? {
              precio_venta: precioVenta,
              costo_total: Math.round(costoTotal),
              margen_bruto: margenBruto,
              margen_pct: margenPct,
            }
          : {}),
        notas: rec.notas,
        ingredientes,
      };
    });

    const vasos = snap.vasos.map((v) => ({
      id: v.id,
      codigo: v.codigo,
      nombre: v.nombre,
      capacidad_ml: Number(v.capacidad_ml || 0),
      stock_inicial: Number(v.stock_inicial || 0),
      stock_disponible: Number(v.stock_disponible || 0),
      stock_minimo: Number(v.stock_minimo || 0),
      roturas_acumuladas: Number(v.roturas_acumuladas || 0),
      ...(isGerencia ? { costo_reposicion: Number(v.costo_reposicion || 0) } : {}),
    }));

    const vasosMovimientos = snap.vasosMovimientos
      .filter((vm) => vasoMap.has(vm.vaso_id))
      .slice(0, 150)
      .map((vm) => {
        const v = vasoMap.get(vm.vaso_id)!;
        return {
          id: vm.id,
          vaso_id: vm.vaso_id,
          vaso_nombre: v.nombre,
          fecha: formatDisplayTS(vm.fecha),
          turno: (vm.turno === 'PM' ? 'PM' : 'AM') as 'AM' | 'PM',
          tipo: vm.tipo,
          cantidad: Number(vm.cantidad),
          motivo: vm.motivo,
          responsable: vm.responsable,
        };
      });

    const alertasMinimo = productos.filter((p) => p.bar < p.stock_minimo).length;
    const sinStock = productos.filter((p) => p.bar <= 0).length;
    const solicitudesPendientes = solicitudes.filter((s) => s.estado === 'Pendiente').length;
    const porRecibirBar = solicitudes.filter((s) => s.estado === 'Despachada').length;
    const insumosBajoMinimo = insumos.filter((i) => i.stock_actual < i.stock_minimo).length;
    const vasosDisponibles = vasos.reduce((s, v) => s + v.stock_disponible, 0);
    const vasosRoturas = vasos.reduce((s, v) => s + v.roturas_acumuladas, 0);

    const kpis: EstadoApp['kpis'] = {
      totalProductos: productos.length,
      alertasMinimo,
      sinStock,
      solicitudesPendientes,
      porRecibirBar,
      insumosBajoMinimo,
      vasosDisponibles,
      vasosRoturas,
    };

    if (isGerencia) {
      let valBar = 0;
      let valCentral = 0;
      for (const st of stockByProd.values()) {
        valBar += st.valorBar;
        valCentral += st.valorCentral;
      }
      kpis.valorBar = Math.round(valBar);
      kpis.valorCentral = Math.round(valCentral);
    }

    const consumosTurno = (snap.consumosTurno || []).map((ct) => ({
      id: ct.id,
      fecha: ct.fecha,
      turno: (ct.turno === 'PM' ? 'PM' : 'AM') as 'AM' | 'PM',
      tipo: ct.tipo,
      receta_id: ct.receta_id,
      producto_id: ct.producto_id,
      nombre: ct.nombre,
      cantidad_porciones: Number(ct.cantidad_porciones),
      detalle_descuento: ct.detalle_descuento,
      ...(isGerencia ? { costo_total: Number(ct.costo_total || 0) } : {}),
      responsable: ct.responsable,
      observacion: ct.observacion,
    }));

    return {
      categorias,
      productos,
      solicitudes,
      movimientos,
      cierres,
      lotes,
      proveedores,
      insumos,
      insumoControl: {
        permitir_crear_items_bar: Boolean(insumoControl.permitir_crear_items_bar),
        restringir_categorias_bar: Boolean(insumoControl.restringir_categorias_bar),
        categorias_permitidas_bar: Array.isArray(insumoControl.categorias_permitidas_bar)
          ? insumoControl.categorias_permitidas_bar
          : [],
        solo_bajo_minimo: Boolean(insumoControl.solo_bajo_minimo),
        bloquear_duplicados_pendientes: Boolean(insumoControl.bloquear_duplicados_pendientes),
        max_items_por_solicitud:
          insumoControl.max_items_por_solicitud != null ? Number(insumoControl.max_items_por_solicitud) : null,
        permitir_criterio_personalizado_bar: Boolean(insumoControl.permitir_criterio_personalizado_bar),
        criterios_permitidos_bar: Array.isArray(insumoControl.criterios_permitidos_bar)
          ? insumoControl.criterios_permitidos_bar
          : [],
      },
      solicitudesInsumos,
      recetas,
      consumosTurno,
      vasos,
      vasosMovimientos,
      kpis,
    };
  }

  async function procesarCierreItem(params: {
    fecha: string;
    turno: 'AM' | 'PM';
    productoId: number;
    ingresos: number;
    mermas: number;
    stockCierre: number;
    observacion: string;
    userEmail: string;
  }) {
    const { fecha, turno, productoId, ingresos, mermas, stockCierre, observacion, userEmail } = params;

    const prod = await repo.findProductoById(empresaId, productoId);
    if (!prod) throw new EngineError(`Producto #${productoId} no encontrado`, 404);

    const lotesBar = await repo.getActiveLotesForProductBodega(empresaId, productoId, 3);
    const stockInicio = Math.round(lotesBar.reduce((s, l) => s + Number(l.cantidad_disponible || 0), 0) * 1000) / 1000;
    const costoRef = Number(prod.costo_referencia || 0);
    const disponibleTeorico = Math.round((stockInicio + ingresos - mermas) * 1000) / 1000;
    const consumoCalculado = Math.round((disponibleTeorico - stockCierre) * 1000) / 1000;
    const diferenciaComparativa = Math.round((stockCierre - disponibleTeorico) * 1000) / 1000;

    if (mermas > stockInicio + ingresos + 0.0001) {
      throw new EngineError(
        `En ${prod.nombre}, las mermas (${mermas}) superan el disponible (${stockInicio + ingresos})`,
        409
      );
    }

    if (ingresos > 0) {
      const lIng = await repo.insertLote({
        empresa_id: empresaId,
        producto_id: productoId,
        bodega_id: 3,
        cantidad_inicial: ingresos,
        cantidad_disponible: ingresos,
        costo_unitario: costoRef,
        fecha_vencimiento: null,
        fecha_ingreso: nowISO(),
        referencia: `Ingreso en cierre ${turno}`,
      });
      await repo.insertMovimiento({
        empresa_id: empresaId,
        fecha: nowISO(),
        tipo: 'Ingreso',
        producto_id: productoId,
        bodega_id: 3,
        lote_id: lIng.id,
        cantidad: ingresos,
        costo_unitario: costoRef,
        motivo: `Ingreso turno ${fecha} (${turno})`,
        responsable: userEmail,
      });
    }

    if (mermas > 0) {
      const deductedM = await deductLotsFEFO(productoId, 3, mermas);
      for (const d of deductedM) {
        await repo.insertMovimiento({
          empresa_id: empresaId,
          fecha: nowISO(),
          tipo: 'Merma',
          producto_id: productoId,
          bodega_id: 3,
          lote_id: d.loteId,
          cantidad: d.qty,
          costo_unitario: d.costo,
          motivo: `Merma turno ${fecha} (${turno})${observacion ? ': ' + observacion : ''}`,
          responsable: userEmail,
        });
      }
    }

    const diffToTarget = Math.round((disponibleTeorico - stockCierre) * 1000) / 1000;
    if (diffToTarget > 0.0001) {
      const deductedC = await deductLotsFEFO(productoId, 3, diffToTarget);
      for (const d of deductedC) {
        await repo.insertMovimiento({
          empresa_id: empresaId,
          fecha: nowISO(),
          tipo: 'Cierre Diario',
          producto_id: productoId,
          bodega_id: 3,
          lote_id: d.loteId,
          cantidad: d.qty,
          costo_unitario: d.costo,
          motivo: `Cierre manual ${fecha} (${turno}) | Contado: ${stockCierre}`,
          responsable: userEmail,
        });
      }
    } else if (diffToTarget < -0.0001) {
      const sobrante = Math.abs(diffToTarget);
      const lSob = await repo.insertLote({
        empresa_id: empresaId,
        producto_id: productoId,
        bodega_id: 3,
        cantidad_inicial: sobrante,
        cantidad_disponible: sobrante,
        costo_unitario: costoRef,
        fecha_vencimiento: null,
        fecha_ingreso: nowISO(),
        referencia: `Ajuste positivo cierre ${turno}`,
      });
      await repo.insertMovimiento({
        empresa_id: empresaId,
        fecha: nowISO(),
        tipo: 'Ajuste Cierre',
        producto_id: productoId,
        bodega_id: 3,
        lote_id: lSob.id,
        cantidad: sobrante,
        costo_unitario: costoRef,
        motivo: `Sobrante en cierre ${fecha} (${turno}) | Contado: ${stockCierre}`,
        responsable: userEmail,
      });
    } else {
      await repo.insertMovimiento({
        empresa_id: empresaId,
        fecha: nowISO(),
        tipo: 'Cierre Diario',
        producto_id: productoId,
        bodega_id: 3,
        lote_id: null,
        cantidad: 0,
        costo_unitario: costoRef,
        motivo: `Cierre exacto ${fecha} (${turno}) | Stock: ${stockCierre}`,
        responsable: userEmail,
      });
    }

    await repo.insertCierre({
      empresa_id: empresaId,
      fecha,
      turno,
      producto_id: productoId,
      stock_inicio: stockInicio,
      ingresos,
      mermas,
      stock_teorico_esperado: disponibleTeorico,
      consumo_calculado: consumoCalculado,
      stock_cierre: stockCierre,
      diferencia_comparativa: diferenciaComparativa,
      responsable: userEmail,
      observacion: observacion || null,
    });

    return { consumoCalculado, diferenciaComparativa };
  }

  return {
    buildEstado,

    async getEstado(user: EngineUser): Promise<EstadoApp> {
      const data = await buildEstado(user.rol === 'Gerencia');
      return {
        rol: user.rol,
        email: user.email,
        ...data,
      };
    },

    async getBackupSnapshot(user: EngineUser) {
      requireAdmin(user);
      const snapshot = await repo.getSnapshot(empresaId);
      return {
        exported_at: nowISO(),
        empresa_id: empresaId,
        mode: repo.mode,
        snapshot,
      };
    },

    async createProducto(user: EngineUser, b: Record<string, unknown>) {
      requireAdmin(user);
      const codigo = String(b.codigo || '').trim().toUpperCase();
      const nombre = String(b.nombre || '').trim().toUpperCase();
      const categoria = normalizeCategory(b.categoria);
      const unidad = String(b.unidad || 'botella').trim();
      const stockMinimo = nnonneg(b.stock_minimo ?? 0);
      const costoRef = nnonneg(b.costo_referencia ?? 0);
      const tipoEnvase = b.tipo_envase ? String(b.tipo_envase).trim() : null;
      const contenidoEnvase = b.contenido_envase !== '' && b.contenido_envase != null ? npos(b.contenido_envase) : null;
      const unidadContenido = b.unidad_contenido ? String(b.unidad_contenido).trim() : null;
      const porcionesCorto = b.porciones_corto !== '' && b.porciones_corto != null ? npos(b.porciones_corto) : null;
      const porcionesCoctel = b.porciones_coctel !== '' && b.porciones_coctel != null ? npos(b.porciones_coctel) : null;
      const stockCentralIni = nnonneg(b.stock_inicial_central ?? 0) ?? 0;
      const stockBarIni = nnonneg(b.stock_inicial_barra ?? 0) ?? 0;
      const stockInicialSistema =
        b.stock_inicial_sistema !== undefined && b.stock_inicial_sistema !== ''
          ? (nnonneg(b.stock_inicial_sistema) ?? stockCentralIni + stockBarIni)
          : Math.round((stockCentralIni + stockBarIni) * 1000) / 1000;

      if (!codigo || !nombre || !VALID_UNITS.includes(unidad) || stockMinimo === null || costoRef === null) {
        throw new EngineError('Verifica código, nombre, unidad, mínimo y costo', 400);
      }
      if (!categoria) {
        throw new EngineError('Categoría inválida', 400);
      }
      if (tipoEnvase && !VALID_ENVASES.includes(tipoEnvase)) {
        throw new EngineError('Tipo de envase inválido', 400);
      }
      if (tipoEnvase && (!contenidoEnvase || !unidadContenido || !VALID_CONTENIDO_UNITS.includes(unidadContenido))) {
        throw new EngineError('Especifica contenido numérico y unidad (ml o L) del envase', 400);
      }

      const dup = await repo.findProductoByCodigo(empresaId, codigo);
      if (dup) {
        throw new EngineError(`Ya existe un producto activo con el código ${codigo}`, 409);
      }

      await repo.ensureCategoria(empresaId, categoria);

      const prod = await repo.insertProducto({
        empresa_id: empresaId,
        codigo,
        nombre,
        categoria,
        area: 'Bar',
        unidad,
        stock_inicial_sistema: stockInicialSistema,
        stock_minimo: stockMinimo,
        costo_referencia: costoRef,
        tipo_envase: tipoEnvase,
        contenido_envase: contenidoEnvase,
        unidad_contenido: tipoEnvase ? unidadContenido : null,
        porciones_corto: porcionesCorto,
        porciones_coctel: porcionesCoctel,
        activo: true,
      });

      await repo.insertMovimiento({
        empresa_id: empresaId,
        fecha: nowISO(),
        tipo: 'Nuevo Producto',
        producto_id: prod.id,
        bodega_id: 3,
        lote_id: null,
        cantidad: 0,
        costo_unitario: costoRef,
        motivo: `Creación en maestro | Stock inicial sistema: ${stockInicialSistema}`,
        responsable: user.email,
      });

      if (stockCentralIni > 0) {
        const lC = await repo.insertLote({
          empresa_id: empresaId,
          producto_id: prod.id,
          bodega_id: 1,
          cantidad_inicial: stockCentralIni,
          cantidad_disponible: stockCentralIni,
          costo_unitario: costoRef,
          fecha_vencimiento: null,
          fecha_ingreso: nowISO(),
          referencia: 'Stock inicial manual',
        });
        await repo.insertMovimiento({
          empresa_id: empresaId,
          fecha: nowISO(),
          tipo: 'Stock Inicial',
          producto_id: prod.id,
          bodega_id: 1,
          lote_id: lC.id,
          cantidad: stockCentralIni,
          costo_unitario: costoRef,
          motivo: 'Stock inicial manual Bodega Central',
          responsable: user.email,
        });
      }

      if (stockBarIni > 0) {
        const lB = await repo.insertLote({
          empresa_id: empresaId,
          producto_id: prod.id,
          bodega_id: 3,
          cantidad_inicial: stockBarIni,
          cantidad_disponible: stockBarIni,
          costo_unitario: costoRef,
          fecha_vencimiento: null,
          fecha_ingreso: nowISO(),
          referencia: 'Stock inicial manual',
        });
        await repo.insertMovimiento({
          empresa_id: empresaId,
          fecha: nowISO(),
          tipo: 'Stock Inicial',
          producto_id: prod.id,
          bodega_id: 3,
          lote_id: lB.id,
          cantidad: stockBarIni,
          costo_unitario: costoRef,
          motivo: 'Stock inicial manual Barra Principal',
          responsable: user.email,
        });
      }

      return { ok: true, id: prod.id };
    },

    async updateProducto(user: EngineUser, id: number, b: Record<string, unknown>) {
      requireAdmin(user);
      if (!Number.isInteger(id) || id < 1) throw new EngineError('ID inválido', 400);
      const nombre = String(b.nombre || '').trim().toUpperCase();
      const categoria = normalizeCategory(b.categoria);
      const unidad = String(b.unidad || 'botella').trim();
      const stockMinimo = nnonneg(b.stock_minimo ?? 0);
      const costoRef = nnonneg(b.costo_referencia ?? 0);
      const stockInicialSistema =
        b.stock_inicial_sistema !== undefined ? nnonneg(b.stock_inicial_sistema) : undefined;
      const tipoEnvase = b.tipo_envase ? String(b.tipo_envase).trim() : null;
      const contenidoEnvase = b.contenido_envase !== '' && b.contenido_envase != null ? npos(b.contenido_envase) : null;
      const unidadContenido = b.unidad_contenido ? String(b.unidad_contenido).trim() : null;
      const porcionesCorto =
        b.porciones_corto !== undefined
          ? (b.porciones_corto === '' || b.porciones_corto === null ? null : npos(b.porciones_corto))
          : undefined;
      const porcionesCoctel =
        b.porciones_coctel !== undefined
          ? (b.porciones_coctel === '' || b.porciones_coctel === null ? null : npos(b.porciones_coctel))
          : undefined;

      if (!nombre || !VALID_UNITS.includes(unidad) || stockMinimo === null || costoRef === null) {
        throw new EngineError('Datos de producto inválidos', 400);
      }

      await repo.ensureCategoria(empresaId, categoria);

      const patch: Partial<Omit<DbProducto, 'id' | 'empresa_id' | 'codigo'>> = {
        nombre,
        categoria,
        unidad,
        stock_minimo: stockMinimo,
        costo_referencia: costoRef,
        tipo_envase: tipoEnvase,
        contenido_envase: tipoEnvase ? contenidoEnvase : null,
        unidad_contenido: tipoEnvase ? unidadContenido : null,
      };
      if (stockInicialSistema !== undefined && stockInicialSistema !== null) {
        patch.stock_inicial_sistema = stockInicialSistema;
      }
      if (porcionesCorto !== undefined) patch.porciones_corto = porcionesCorto;
      if (porcionesCoctel !== undefined) patch.porciones_coctel = porcionesCoctel;

      const updated = await repo.updateProducto(id, empresaId, patch);
      if (!updated) throw new EngineError('Producto no encontrado', 404);
      return { ok: true };
    },

    async updateProductoRendimiento(user: EngineUser, id: number, b: Record<string, unknown>) {
      requireAdmin(user);
      if (!Number.isInteger(id) || id < 1) throw new EngineError('ID inválido', 400);

      const rawCorto = b.porciones_corto;
      const rawCoctel = b.porciones_coctel;
      const porcionesCorto = rawCorto === '' || rawCorto === null || rawCorto === undefined ? null : npos(rawCorto);
      const porcionesCoctel = rawCoctel === '' || rawCoctel === null || rawCoctel === undefined ? null : npos(rawCoctel);

      if (rawCorto !== '' && rawCorto !== null && rawCorto !== undefined && porcionesCorto === null) {
        throw new EngineError('Las porciones de corto por botella deben ser mayores a 0', 400);
      }
      if (rawCoctel !== '' && rawCoctel !== null && rawCoctel !== undefined && porcionesCoctel === null) {
        throw new EngineError('El rendimiento para cócteles debe ser mayor a 0', 400);
      }

      const updated = await repo.updateProducto(id, empresaId, {
        porciones_corto: porcionesCorto,
        porciones_coctel: porcionesCoctel,
      });
      if (!updated) throw new EngineError('Producto no encontrado', 404);
      return { ok: true, porciones_corto: porcionesCorto, porciones_coctel: porcionesCoctel };
    },

    async setStockInicial(user: EngineUser, id: number, b: Record<string, unknown>) {
      requireAdmin(user);
      const bodegaId = Number(b.bodega_id || 3);
      const cantidad = nnonneg(b.cantidad);
      const stockInicialSistema =
        b.stock_inicial_sistema !== undefined ? nnonneg(b.stock_inicial_sistema) : null;
      const nota = String(b.motivo || 'Carga manual de stock inicial del sistema').slice(0, 180);

      if (!Number.isInteger(id) || id < 1 || ![1, 3].includes(bodegaId) || cantidad === null) {
        throw new EngineError('Datos de stock inicial inválidos', 400);
      }

      const prod = await repo.findProductoById(empresaId, id);
      if (!prod) throw new EngineError('Producto no encontrado', 404);

      const lotes = await repo.getActiveLotesForProductBodega(empresaId, id, bodegaId);
      const actual = Math.round(lotes.reduce((s, l) => s + Number(l.cantidad_disponible || 0), 0) * 1000) / 1000;
      const diff = Math.round((cantidad - actual) * 1000) / 1000;
      const costoRef = Number(prod.costo_referencia || 0);

      if (diff > 0.0001) {
        const lote = await repo.insertLote({
          empresa_id: empresaId,
          producto_id: id,
          bodega_id: bodegaId,
          cantidad_inicial: diff,
          cantidad_disponible: diff,
          costo_unitario: costoRef,
          fecha_vencimiento: null,
          fecha_ingreso: nowISO(),
          referencia: 'Stock inicial manual sistema',
        });
        await repo.insertMovimiento({
          empresa_id: empresaId,
          fecha: nowISO(),
          tipo: 'Stock Inicial',
          producto_id: id,
          bodega_id: bodegaId,
          lote_id: lote.id,
          cantidad: diff,
          costo_unitario: costoRef,
          motivo: `${nota} (Stock fijado en ${cantidad})`,
          responsable: user.email,
        });
      } else if (diff < -0.0001) {
        const deducted = await deductLotsFEFO(id, bodegaId, Math.abs(diff));
        for (const d of deducted) {
          await repo.insertMovimiento({
            empresa_id: empresaId,
            fecha: nowISO(),
            tipo: 'Stock Inicial',
            producto_id: id,
            bodega_id: bodegaId,
            lote_id: d.loteId,
            cantidad: d.qty,
            costo_unitario: d.costo,
            motivo: `${nota} (Ajustado de ${actual} a ${cantidad})`,
            responsable: user.email,
          });
        }
      }

      const snap = await repo.getSnapshot(empresaId);
      const totalActual = snap.lotes
        .filter((l) => l.producto_id === id && (l.bodega_id === 1 || l.bodega_id === 3))
        .reduce((s, l) => s + Number(l.cantidad_disponible || 0), 0);

      await repo.updateProducto(id, empresaId, {
        stock_inicial_sistema: stockInicialSistema ?? Math.round(totalActual * 1000) / 1000,
      });

      return { ok: true };
    },

    async importProductos(user: EngineUser, b: Record<string, unknown>) {
      requireAdmin(user);
      const fileType = String(b.file_type || 'xlsx').toLowerCase();
      const content = String(b.content || '');
      const reemplazar = Boolean(b.reemplazar_existentes);

      if (!content && !(fileType === 'json' && Array.isArray(b.rows))) {
        throw new EngineError('Archivo vacío o no seleccionado', 400);
      }

      let rawItems: Array<Record<string, unknown>> = [];
      if (fileType === 'csv') {
        rawItems = parseCsvRows(content);
      } else if (fileType === 'json' && Array.isArray(b.rows)) {
        rawItems = b.rows as Array<Record<string, unknown>>;
      } else {
        try {
          const { parseXlsxRowsFromBase64 } = await import('./excelHelpers');
          rawItems = await parseXlsxRowsFromBase64(content);
        } catch (err) {
          throw new EngineError(
            err instanceof Error ? err.message : 'No se pudo leer el archivo Excel',
            400
          );
        }
      }

      if (rawItems.length === 0) {
        throw new EngineError('No se encontraron filas de productos válidas para importar', 400);
      }

      if (reemplazar) {
        await repo.deactivateAllProductos(empresaId);
      }

      let creados = 0;
      let actualizados = 0;
      let omitidos = 0;

      for (let idx = 0; idx < rawItems.length; idx++) {
        const r = rawItems[idx];
        const getVal = (...keys: string[]) => {
          for (const k of keys) {
            if (r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== '') return r[k];
          }
          return undefined;
        };

        const nombreRaw = String(getVal('nombre', 'producto', 'descripcion') || '').trim().toUpperCase();
        if (!nombreRaw) {
          omitidos++;
          continue;
        }

        const codigoRaw = String(getVal('codigo', 'sku', 'cod') || `IMP-${String(Date.now()).slice(-4)}-${idx + 1}`)
          .trim()
          .toUpperCase();
        const categoria = normalizeCategory(getVal('categoria', 'familia', 'rubro'));
        await repo.ensureCategoria(empresaId, categoria);
        const unidadRaw = String(getVal('unidad', 'uom') || 'botella').trim();
        const unidad = VALID_UNITS.includes(unidadRaw) ? unidadRaw : 'unidad';
        const stockCentral = nnonneg(getVal('stock_inicial_central', 'stock_central', 'central') ?? 0) ?? 0;
        const stockBarra = nnonneg(getVal('stock_inicial_barra', 'stock_barra', 'stock_inicial', 'barra') ?? 0) ?? 0;
        const stockMin = nnonneg(getVal('stock_minimo_barra', 'stock_minimo', 'minimo') ?? 0) ?? 0;
        const costo = nnonneg(getVal('costo_unitario', 'costo_referencia', 'costo', 'valor') ?? 0) ?? 0;
        const tipoEnvaseRaw = String(getVal('tipo_envase', 'envase') || '').trim();
        const tipoEnvase = VALID_ENVASES.includes(tipoEnvaseRaw) ? tipoEnvaseRaw : null;
        const contenido = npos(getVal('contenido_envase', 'contenido'));
        const unidadContRaw = String(getVal('unidad_contenido', 'u_contenido') || 'ml').trim();
        const unidadCont = VALID_CONTENIDO_UNITS.includes(unidadContRaw) ? unidadContRaw : 'ml';
        const stockInicialSistema = Math.round((stockCentral + stockBarra) * 1000) / 1000;

        const existing = await repo.findProductoByCodigo(empresaId, codigoRaw);
        if (existing) {
          await repo.updateProducto(existing.id, empresaId, {
            nombre: nombreRaw,
            categoria,
            unidad,
            stock_minimo: stockMin,
            costo_referencia: costo,
            tipo_envase: tipoEnvase,
            contenido_envase: tipoEnvase ? contenido : null,
            unidad_contenido: tipoEnvase ? unidadCont : null,
          });
          actualizados++;
          continue;
        }

        const prod = await repo.insertProducto({
          empresa_id: empresaId,
          codigo: codigoRaw,
          nombre: nombreRaw,
          categoria,
          area: 'Bar',
          unidad,
          stock_inicial_sistema: stockInicialSistema,
          stock_minimo: stockMin,
          costo_referencia: costo,
          tipo_envase: tipoEnvase,
          contenido_envase: tipoEnvase ? contenido : null,
          unidad_contenido: tipoEnvase ? unidadCont : null,
          activo: true,
        });

        if (stockCentral > 0) {
          const lC = await repo.insertLote({
            empresa_id: empresaId,
            producto_id: prod.id,
            bodega_id: 1,
            cantidad_inicial: stockCentral,
            cantidad_disponible: stockCentral,
            costo_unitario: costo,
            fecha_vencimiento: null,
            fecha_ingreso: nowISO(),
            referencia: 'Carga masiva inicial',
          });
          await repo.insertMovimiento({
            empresa_id: empresaId,
            fecha: nowISO(),
            tipo: 'Stock Inicial',
            producto_id: prod.id,
            bodega_id: 1,
            lote_id: lC.id,
            cantidad: stockCentral,
            costo_unitario: costo,
            motivo: 'Carga masiva comercial (Central)',
            responsable: user.email,
          });
        }

        if (stockBarra > 0) {
          const lB = await repo.insertLote({
            empresa_id: empresaId,
            producto_id: prod.id,
            bodega_id: 3,
            cantidad_inicial: stockBarra,
            cantidad_disponible: stockBarra,
            costo_unitario: costo,
            fecha_vencimiento: null,
            fecha_ingreso: nowISO(),
            referencia: 'Carga masiva inicial',
          });
          await repo.insertMovimiento({
            empresa_id: empresaId,
            fecha: nowISO(),
            tipo: 'Stock Inicial',
            producto_id: prod.id,
            bodega_id: 3,
            lote_id: lB.id,
            cantidad: stockBarra,
            costo_unitario: costo,
            motivo: 'Carga masiva comercial (Barra)',
            responsable: user.email,
          });
        }

        creados++;
      }

      return { ok: true, creados, actualizados, omitidos };
    },

    async registrarIngreso(user: EngineUser, b: Record<string, unknown>) {
      requireAdmin(user);
      const productoId = Number(b.producto_id);
      const bodegaId = Number(b.bodega_id || 1);
      const cantidad = npos(b.cantidad);
      const costo = nnonneg(b.costo_unitario ?? 0);
      const vencimiento = b.fecha_vencimiento ? String(b.fecha_vencimiento).slice(0, 10) : null;
      const motivo = String(b.motivo || 'Ingreso de mercadería').slice(0, 160);

      if (!Number.isInteger(productoId) || ![1, 3].includes(bodegaId) || !cantidad || costo === null) {
        throw new EngineError('Datos de ingreso inválidos', 400);
      }

      const prod = await repo.findProductoById(empresaId, productoId);
      if (!prod) throw new EngineError('Producto no encontrado', 404);

      const lote = await repo.insertLote({
        empresa_id: empresaId,
        producto_id: productoId,
        bodega_id: bodegaId,
        cantidad_inicial: cantidad,
        cantidad_disponible: cantidad,
        costo_unitario: costo,
        fecha_vencimiento: vencimiento,
        fecha_ingreso: nowISO(),
        referencia: motivo,
      });

      await repo.insertMovimiento({
        empresa_id: empresaId,
        fecha: nowISO(),
        tipo: 'Ingreso',
        producto_id: productoId,
        bodega_id: bodegaId,
        lote_id: lote.id,
        cantidad,
        costo_unitario: costo,
        motivo,
        responsable: user.email,
      });

      return { ok: true };
    },

    async registrarSalida(user: EngineUser, b: Record<string, unknown>) {
      const productoId = Number(b.producto_id);
      const cantidad = npos(b.cantidad);
      const tipo = String(b.tipo || 'Salida');
      const motivo = String(b.motivo || (tipo === 'Merma' ? 'Merma / Rotura en barra' : 'Consumo de barra')).slice(0, 200);

      if (!Number.isInteger(productoId) || !cantidad || !['Salida', 'Merma'].includes(tipo)) {
        throw new EngineError('Datos inválidos para salida o merma', 400);
      }

      const deducted = await deductLotsFEFO(productoId, 3, cantidad);
      for (const d of deducted) {
        await repo.insertMovimiento({
          empresa_id: empresaId,
          fecha: nowISO(),
          tipo,
          producto_id: productoId,
          bodega_id: 3,
          lote_id: d.loteId,
          cantidad: d.qty,
          costo_unitario: d.costo,
          motivo,
          responsable: user.email,
        });
      }
      return { ok: true };
    },

    async registrarCierre(user: EngineUser, b: Record<string, unknown>) {
      const fecha = String(b.fecha || todayDate()).slice(0, 10);
      const turnoRaw = String(b.turno || '').trim().toUpperCase();
      const productoId = Number(b.producto_id);
      const ingresos = nnonneg(b.ingresos ?? 0);
      const mermas = nnonneg(b.mermas ?? 0);
      const stockCierre = nnonneg(b.stock_cierre);
      const observacion = String(b.observacion || '').slice(0, 200);

      if (!VALID_TURNOS.includes(turnoRaw as 'AM' | 'PM')) {
        throw new EngineError('El turno debe ser AM o PM únicamente', 400);
      }
      const turno = turnoRaw as 'AM' | 'PM';

      if (!Number.isInteger(productoId) || ingresos === null || mermas === null || stockCierre === null) {
        throw new EngineError('Datos inválidos en el cierre de turno', 400);
      }

      const result = await procesarCierreItem({
        fecha,
        turno,
        productoId,
        ingresos,
        mermas,
        stockCierre,
        observacion,
        userEmail: user.email,
      });

      return {
        ok: true,
        consumo_calculado: result.consumoCalculado,
        diferencia_comparativa: result.diferenciaComparativa,
      };
    },

    async registrarCierresLote(user: EngineUser, b: Record<string, unknown>) {
      const fecha = String(b.fecha || todayDate()).slice(0, 10);
      const turnoRaw = String(b.turno || '').trim().toUpperCase();
      const itemsRaw = Array.isArray(b.items) ? b.items : [];

      if (!VALID_TURNOS.includes(turnoRaw as 'AM' | 'PM')) {
        throw new EngineError('El turno debe ser AM o PM únicamente', 400);
      }
      const turno = turnoRaw as 'AM' | 'PM';

      if (itemsRaw.length === 0) {
        throw new EngineError('Ingresa al menos un conteo de producto para guardar', 400);
      }

      let procesados = 0;
      for (const raw of itemsRaw) {
        const item = (raw || {}) as Record<string, unknown>;
        const productoId = Number(item.producto_id);
        const ingresos = nnonneg(item.ingresos ?? 0);
        const mermas = nnonneg(item.mermas ?? 0);
        const stockCierre = nnonneg(item.stock_cierre);
        const observacion = String(item.observacion || '').slice(0, 200);

        if (!Number.isInteger(productoId) || ingresos === null || mermas === null || stockCierre === null) {
          throw new EngineError('Revisa los valores numéricos ingresados en la planilla', 400);
        }

        await procesarCierreItem({
          fecha,
          turno,
          productoId,
          ingresos,
          mermas,
          stockCierre,
          observacion,
          userEmail: user.email,
        });
        procesados++;
      }
      return { ok: true, procesados };
    },

    async crearSolicitud(user: EngineUser, b: Record<string, unknown>) {
      const productoId = Number(b.producto_id);
      const cantidad = npos(b.cantidad);
      const tipoSolicitud = String(b.tipo_solicitud || 'Libre / Evento').slice(0, 60);
      const observacion = String(b.observacion || '').slice(0, 250);

      if (!Number.isInteger(productoId) || !cantidad) {
        throw new EngineError('Selecciona un producto y una cantidad válida', 400);
      }

      const prod = await repo.findProductoById(empresaId, productoId);
      if (!prod) throw new EngineError('Producto no encontrado', 404);

      await repo.insertSolicitud({
        empresa_id: empresaId,
        fecha: nowISO(),
        bodega_origen_id: 1,
        bodega_destino_id: 3,
        producto_id: productoId,
        cantidad_solicitada: cantidad,
        cantidad_despachada: null,
        cantidad_entregada: null,
        tipo_solicitud: tipoSolicitud,
        estado: 'Pendiente',
        solicitante: user.email,
        observacion: observacion || null,
        fecha_despacho: null,
        fecha_recepcion: null,
      });

      return { ok: true };
    },

    async crearSolicitudesSugeridoMinimo(user: EngineUser) {
      const estado = await buildEstado(false);
      const activeProds = new Set(
        estado.solicitudes
          .filter((s) => s.estado === 'Pendiente' || s.estado === 'Despachada')
          .map((s) => s.producto_id)
      );

      let creados = 0;
      for (const p of estado.productos) {
        if (p.bar < p.stock_minimo && !activeProds.has(p.id)) {
          const falta = Math.round((p.stock_minimo - p.bar) * 1000) / 1000;
          await repo.insertSolicitud({
            empresa_id: empresaId,
            fecha: nowISO(),
            bodega_origen_id: 1,
            bodega_destino_id: 3,
            producto_id: p.id,
            cantidad_solicitada: falta,
            cantidad_despachada: null,
            cantidad_entregada: null,
            tipo_solicitud: 'Sugerido Mínimo',
            estado: 'Pendiente',
            solicitante: user.email,
            observacion: `Reposición automática (Stock ${p.bar} < Mínimo ${p.stock_minimo})`,
            fecha_despacho: null,
            fecha_recepcion: null,
          });
          creados++;
        }
      }

      return { ok: true, creados };
    },

    async despacharSolicitud(user: EngineUser, id: number, b: Record<string, unknown>) {
      requireAdmin(user);
      if (!Number.isInteger(id) || id < 1) throw new EngineError('ID inválido', 400);

      const sol = await repo.findSolicitudById(empresaId, id);
      if (!sol || sol.estado !== 'Pendiente') {
        throw new EngineError('La solicitud no existe o ya fue procesada', 404);
      }

      const cantDespacho =
        b.cantidad_despachada != null ? npos(b.cantidad_despachada) : Number(sol.cantidad_solicitada);
      if (!cantDespacho) {
        throw new EngineError('Cantidad a despachar inválida', 400);
      }

      const deducted = await deductLotsFEFO(sol.producto_id, 1, cantDespacho);
      for (const d of deducted) {
        await repo.insertMovimiento({
          empresa_id: empresaId,
          fecha: nowISO(),
          tipo: 'Traspaso Salida',
          producto_id: sol.producto_id,
          bodega_id: 1,
          lote_id: d.loteId,
          cantidad: d.qty,
          costo_unitario: d.costo,
          motivo: `Despacho Solicitud #${id} hacia Barra Principal`,
          responsable: user.email,
        });
      }

      await repo.updateSolicitud(id, empresaId, {
        estado: 'Despachada',
        cantidad_despachada: cantDespacho,
        fecha_despacho: nowISO(),
      });

      return { ok: true, cantidad_despachada: cantDespacho };
    },

    async rechazarSolicitud(user: EngineUser, id: number, b: Record<string, unknown>) {
      requireAdmin(user);
      const motivo = String(b.motivo || 'Rechazada por Gerencia').slice(0, 200);
      if (!Number.isInteger(id) || id < 1) throw new EngineError('ID inválido', 400);

      const sol = await repo.findSolicitudById(empresaId, id);
      if (!sol || sol.estado !== 'Pendiente') {
        throw new EngineError('Solicitud no pendiente', 404);
      }

      await repo.updateSolicitud(id, empresaId, {
        estado: 'Rechazada',
        observacion: sol.observacion ? `${sol.observacion} | Rechazo: ${motivo}` : `Rechazo: ${motivo}`,
      });
      return { ok: true };
    },

    async recibirSolicitud(user: EngineUser, id: number, b: Record<string, unknown>) {
      const cantRecibida = nnonneg(b.cantidad_recibida);
      if (!Number.isInteger(id) || id < 1 || cantRecibida === null) {
        throw new EngineError('Cantidad recibida inválida', 400);
      }

      const sol = await repo.findSolicitudById(empresaId, id);
      if (!sol || sol.estado !== 'Despachada') {
        throw new EngineError('La solicitud no está en estado Despachada', 404);
      }

      const prod = await repo.findProductoById(empresaId, sol.producto_id);
      const despachada = Number(sol.cantidad_despachada ?? sol.cantidad_solicitada);
      let costoReal = Number(prod?.costo_referencia || 0);

      const dispatchMovs = await repo.getMovimientosForDispatchCost(empresaId, sol.producto_id, id);
      if (dispatchMovs.length > 0) {
        const totQ = dispatchMovs.reduce((s, r) => s + Number(r.cantidad || 0), 0);
        const totV = dispatchMovs.reduce((s, r) => s + Number(r.cantidad || 0) * Number(r.costo_unitario || 0), 0);
        if (totQ > 0) costoReal = Math.round((totV / totQ) * 100) / 100;
      }

      if (cantRecibida > 0) {
        const lBar = await repo.insertLote({
          empresa_id: empresaId,
          producto_id: sol.producto_id,
          bodega_id: 3,
          cantidad_inicial: cantRecibida,
          cantidad_disponible: cantRecibida,
          costo_unitario: costoReal,
          fecha_vencimiento: null,
          fecha_ingreso: nowISO(),
          referencia: `Recepción Solicitud #${id}`,
        });

        const diffNote =
          Math.abs(cantRecibida - despachada) > 0.0001
            ? ` (Ajustado: despachado ${despachada}, recibido ${cantRecibida})`
            : '';

        await repo.insertMovimiento({
          empresa_id: empresaId,
          fecha: nowISO(),
          tipo: 'Recepción Barra',
          producto_id: sol.producto_id,
          bodega_id: 3,
          lote_id: lBar.id,
          cantidad: cantRecibida,
          costo_unitario: costoReal,
          motivo: `Recepción Solicitud #${id} (${sol.tipo_solicitud})${diffNote}`,
          responsable: user.email,
        });
      }

      await repo.updateSolicitud(id, empresaId, {
        estado: 'Recibida',
        cantidad_entregada: cantRecibida,
        fecha_recepcion: nowISO(),
      });

      return { ok: true, cantidad_entregada: cantRecibida };
    },

    async ajustarCuadratura(user: EngineUser, b: Record<string, unknown>) {
      requireAdmin(user);
      const productoId = Number(b.producto_id);
      const bodegaId = Number(b.bodega_id || 3);
      const conteoFisico = nnonneg(b.conteo_fisico);
      const motivo = String(b.motivo || 'Ajuste por cuadratura física').slice(0, 200);

      if (!Number.isInteger(productoId) || ![1, 3].includes(bodegaId) || conteoFisico === null) {
        throw new EngineError('Datos de cuadratura inválidos', 400);
      }

      const prod = await repo.findProductoById(empresaId, productoId);
      if (!prod) throw new EngineError('Producto no encontrado', 404);

      const lotes = await repo.getActiveLotesForProductBodega(empresaId, productoId, bodegaId);
      const teorico = Math.round(lotes.reduce((s, l) => s + Number(l.cantidad_disponible || 0), 0) * 1000) / 1000;
      const costoRef = Number(prod.costo_referencia || 0);
      const diff = Math.round((conteoFisico - teorico) * 1000) / 1000;

      if (Math.abs(diff) < 0.0001) {
        return { ok: true, diferencia: 0, message: 'El stock ya cuadra exactamente' };
      }

      if (diff > 0) {
        const lAdd = await repo.insertLote({
          empresa_id: empresaId,
          producto_id: productoId,
          bodega_id: bodegaId,
          cantidad_inicial: diff,
          cantidad_disponible: diff,
          costo_unitario: costoRef,
          fecha_vencimiento: null,
          fecha_ingreso: nowISO(),
          referencia: 'Ajuste Cuadratura +',
        });
        await repo.insertMovimiento({
          empresa_id: empresaId,
          fecha: nowISO(),
          tipo: 'Ajuste Cuadratura',
          producto_id: productoId,
          bodega_id: bodegaId,
          lote_id: lAdd.id,
          cantidad: diff,
          costo_unitario: costoRef,
          motivo: `${motivo} (+${diff} | Sistema ${teorico} → Físico ${conteoFisico})`,
          responsable: user.email,
        });
      } else {
        const faltante = Math.abs(diff);
        const deducted = await deductLotsFEFO(productoId, bodegaId, faltante);
        for (const d of deducted) {
          await repo.insertMovimiento({
            empresa_id: empresaId,
            fecha: nowISO(),
            tipo: 'Ajuste Cuadratura',
            producto_id: productoId,
            bodega_id: bodegaId,
            lote_id: d.loteId,
            cantidad: d.qty,
            costo_unitario: d.costo,
            motivo: `${motivo} (-${d.qty} | Sistema ${teorico} → Físico ${conteoFisico})`,
            responsable: user.email,
          });
        }
      }

      return { ok: true, diferencia: diff };
    },

    async crearProveedor(user: EngineUser, b: Record<string, unknown>) {
      requireAdmin(user);
      const nombre = String(b.nombre || '').trim();
      const telefonoWsp = String(b.telefono_wsp || '').trim();
      if (!nombre || !telefonoWsp) {
        throw new EngineError('Nombre y teléfono WhatsApp del proveedor son obligatorios', 400);
      }
      const created = await repo.insertProveedor({
        empresa_id: empresaId,
        nombre,
        contacto: b.contacto ? String(b.contacto).trim() : null,
        telefono_wsp: telefonoWsp,
        email: b.email ? String(b.email).trim() : null,
        categoria: String(b.categoria || 'Licores y Destilados').trim(),
        rut: b.rut ? String(b.rut).trim() : null,
        notas: b.notas ? String(b.notas).trim() : null,
        activo: true,
      });
      return { ok: true, id: created.id };
    },

    async actualizarProveedor(user: EngineUser, id: number, b: Record<string, unknown>) {
      requireAdmin(user);
      if (!Number.isInteger(id) || id < 1) throw new EngineError('ID inválido', 400);
      const nombre = String(b.nombre || '').trim();
      const telefonoWsp = String(b.telefono_wsp || '').trim();
      if (!nombre || !telefonoWsp) {
        throw new EngineError('Nombre y teléfono WhatsApp son obligatorios', 400);
      }
      const ok = await repo.updateProveedor(id, empresaId, {
        nombre,
        contacto: b.contacto ? String(b.contacto).trim() : null,
        telefono_wsp: telefonoWsp,
        email: b.email ? String(b.email).trim() : null,
        categoria: String(b.categoria || 'Licores y Destilados').trim(),
        rut: b.rut ? String(b.rut).trim() : null,
        notas: b.notas ? String(b.notas).trim() : null,
      });
      if (!ok) throw new EngineError('Proveedor no encontrado', 404);
      return { ok: true };
    },

    async desactivarProveedor(user: EngineUser, id: number) {
      requireAdmin(user);
      if (!Number.isInteger(id) || id < 1) throw new EngineError('ID inválido', 400);
      const ok = await repo.updateProveedor(id, empresaId, { activo: false });
      if (!ok) throw new EngineError('Proveedor no encontrado', 404);
      return { ok: true };
    },

    async crearCategoria(user: EngineUser, b: Record<string, unknown>) {
      if (user.rol !== 'Gerencia') {
        const snap = await repo.getSnapshot(empresaId);
        if (!snap.insumoControl?.permitir_crear_items_bar) {
          throw new EngineError(
            'Solo Gerencia puede crear nuevas categorías (restringido por política de control)',
            403
          );
        }
      }
      const nombre = String(b.nombre || '').trim();
      if (!nombre || nombre.length < 2) {
        throw new EngineError('Ingresa un nombre válido para la categoría', 400);
      }
      const cat = await repo.ensureCategoria(empresaId, nombre);
      return { ok: true, categoria: cat };
    },

    async renombrarCategoria(user: EngineUser, b: Record<string, unknown>) {
      if (user.rol !== 'Gerencia') {
        const snap = await repo.getSnapshot(empresaId);
        if (!snap.insumoControl?.permitir_crear_items_bar) {
          throw new EngineError(
            'Solo Gerencia puede renombrar categorías (restringido por política de control)',
            403
          );
        }
      }
      const oldNombre = String(b.oldNombre || '').trim();
      const newNombre = String(b.newNombre || '').trim();
      if (!oldNombre || !newNombre || newNombre.length < 2) {
        throw new EngineError('Indica el nombre actual y el nuevo nombre de la categoría', 400);
      }
      await repo.renameCategoria(empresaId, oldNombre, newNombre);
      await repo.ensureCategoria(empresaId, newNombre);
      return { ok: true };
    },

    async eliminarCategoria(user: EngineUser, nombreRaw: string) {
      requireAdmin(user);
      const nombre = nombreRaw.trim();
      if (!nombre) throw new EngineError('Nombre inválido', 400);
      await repo.deleteCategoria(empresaId, nombre);
      return { ok: true };
    },

    async guardarInsumoControl(user: EngineUser, b: Record<string, unknown>) {
      requireAdmin(user);
      const maxItemsRaw = b.max_items_por_solicitud;
      const maxItems =
        maxItemsRaw === null || maxItemsRaw === undefined || String(maxItemsRaw).trim() === ''
          ? null
          : npos(maxItemsRaw);
      if (
        maxItemsRaw !== null &&
        maxItemsRaw !== undefined &&
        String(maxItemsRaw).trim() !== '' &&
        (!maxItems || !Number.isInteger(maxItems))
      ) {
        throw new EngineError('El máximo de líneas por solicitud debe ser un número entero mayor a 0', 400);
      }

      const catsPermitidas = Array.isArray(b.categorias_permitidas_bar)
        ? b.categorias_permitidas_bar.map((c: unknown) => String(c || '').trim()).filter(Boolean)
        : [];
      const criteriosPermitidos = Array.isArray(b.criterios_permitidos_bar)
        ? b.criterios_permitidos_bar.map((c: unknown) => String(c || '').trim()).filter(Boolean)
        : [];

      const saved = await repo.saveInsumoControl(empresaId, {
        permitir_crear_items_bar: Boolean(b.permitir_crear_items_bar),
        restringir_categorias_bar: Boolean(b.restringir_categorias_bar),
        categorias_permitidas_bar: catsPermitidas,
        solo_bajo_minimo: Boolean(b.solo_bajo_minimo),
        bloquear_duplicados_pendientes: Boolean(b.bloquear_duplicados_pendientes),
        max_items_por_solicitud: maxItems,
        permitir_criterio_personalizado_bar: Boolean(b.permitir_criterio_personalizado_bar),
        criterios_permitidos_bar: criteriosPermitidos,
      });

      return { ok: true, insumoControl: saved };
    },

    async crearInsumo(user: EngineUser, b: Record<string, unknown>) {
      if (user.rol !== 'Gerencia') {
        const snap = await repo.getSnapshot(empresaId);
        if (!snap.insumoControl?.permitir_crear_items_bar) {
          throw new EngineError(
            'Solo Gerencia puede incorporar nuevos ítems al maestro (control activo)',
            403
          );
        }
      }

      const rawCodigo = String(b.codigo || '').trim().toUpperCase();
      const codigo = rawCodigo || `INS-${String(Date.now()).slice(-5)}`;
      const nombre = String(b.nombre || '').trim().toUpperCase();
      const categoria = normalizeCategory(b.categoria, 'Insumos de Barra');
      const criterio = b.criterio ? String(b.criterio).trim() : null;
      const unidad = String(b.unidad || 'unidad').trim();
      const stockActual = nnonneg(b.stock_actual ?? 0);
      const stockMinimo = nnonneg(b.stock_minimo ?? 0);
      const costoUnitario = user.rol === 'Gerencia' ? (nnonneg(b.costo_unitario ?? 0) ?? 0) : 0;
      const proveedorId = b.proveedor_id ? Number(b.proveedor_id) : null;
      const solicitablePorBar =
        user.rol === 'Gerencia' && b.solicitable_por_bar !== undefined
          ? Boolean(b.solicitable_por_bar)
          : true;
      const maxPorSolicitud =
        user.rol === 'Gerencia' &&
        b.max_por_solicitud !== undefined &&
        b.max_por_solicitud !== null &&
        String(b.max_por_solicitud).trim() !== ''
          ? npos(b.max_por_solicitud)
          : null;

      if (!nombre || stockActual === null || stockMinimo === null) {
        throw new EngineError('Verifica nombre, stock inicial y stock mínimo del ítem', 400);
      }

      await repo.ensureCategoria(empresaId, categoria);

      const ins = await repo.insertInsumo({
        empresa_id: empresaId,
        codigo,
        nombre,
        categoria,
        criterio,
        unidad,
        stock_actual: stockActual,
        stock_minimo: stockMinimo,
        costo_unitario: costoUnitario,
        proveedor_id: proveedorId,
        solicitable_por_bar: solicitablePorBar,
        max_por_solicitud: maxPorSolicitud,
        notas: b.notas ? String(b.notas).trim() : null,
        activo: true,
      });
      return { ok: true, id: ins.id };
    },

    async actualizarInsumo(user: EngineUser, id: number, b: Record<string, unknown>) {
      if (!Number.isInteger(id) || id < 1) throw new EngineError('ID inválido', 400);
      const existing = await repo.findInsumoById(empresaId, id);
      if (!existing) throw new EngineError('Ítem no encontrado', 404);

      if (user.rol !== 'Gerencia') {
        const snap = await repo.getSnapshot(empresaId);
        if (!snap.insumoControl?.permitir_crear_items_bar) {
          throw new EngineError(
            'Solo Gerencia puede editar o mover ítems del maestro (control activo)',
            403
          );
        }
      }

      const nombre = b.nombre !== undefined ? String(b.nombre).trim().toUpperCase() : existing.nombre;
      const categoria =
        b.categoria !== undefined
          ? normalizeCategory(b.categoria, 'Insumos de Barra')
          : existing.categoria || 'Insumos de Barra';
      const criterio = b.criterio !== undefined ? (b.criterio ? String(b.criterio).trim() : null) : existing.criterio ?? null;
      const unidad = b.unidad !== undefined ? String(b.unidad).trim() : existing.unidad;
      const stockActual = b.stock_actual !== undefined ? nnonneg(b.stock_actual) : existing.stock_actual;
      const stockMinimo = b.stock_minimo !== undefined ? nnonneg(b.stock_minimo) : existing.stock_minimo;
      const costoUnitario =
        user.rol === 'Gerencia' && b.costo_unitario !== undefined
          ? nnonneg(b.costo_unitario)
          : existing.costo_unitario;
      const proveedorId =
        b.proveedor_id !== undefined ? (b.proveedor_id ? Number(b.proveedor_id) : null) : existing.proveedor_id;
      const solicitablePorBar =
        user.rol === 'Gerencia' && b.solicitable_por_bar !== undefined
          ? Boolean(b.solicitable_por_bar)
          : (existing.solicitable_por_bar ?? true);
      let maxPorSolicitud = existing.max_por_solicitud ?? null;
      if (user.rol === 'Gerencia' && b.max_por_solicitud !== undefined) {
        if (b.max_por_solicitud === null || String(b.max_por_solicitud).trim() === '') {
          maxPorSolicitud = null;
        } else {
          const parsedMax = npos(b.max_por_solicitud);
          if (!parsedMax) throw new EngineError('El límite máximo por solicitud debe ser mayor a 0', 400);
          maxPorSolicitud = parsedMax;
        }
      }
      const notas = b.notas !== undefined ? (b.notas ? String(b.notas).trim() : null) : existing.notas;

      if (!nombre || !unidad || stockActual === null || stockMinimo === null || costoUnitario === null) {
        throw new EngineError('Datos inválidos', 400);
      }

      await repo.ensureCategoria(empresaId, categoria);

      const ok = await repo.updateInsumo(id, empresaId, {
        nombre,
        categoria,
        criterio,
        unidad,
        stock_actual: stockActual,
        stock_minimo: stockMinimo,
        costo_unitario: costoUnitario,
        proveedor_id: proveedorId,
        solicitable_por_bar: solicitablePorBar,
        max_por_solicitud: maxPorSolicitud,
        notas,
      });
      if (!ok) throw new EngineError('Ítem no encontrado', 404);
      return { ok: true };
    },

    async desactivarInsumo(user: EngineUser, id: number) {
      if (user.rol !== 'Gerencia') {
        const snap = await repo.getSnapshot(empresaId);
        if (!snap.insumoControl?.permitir_crear_items_bar) {
          throw new EngineError(
            'Solo Gerencia puede eliminar ítems del maestro (control activo)',
            403
          );
        }
      }
      if (!Number.isInteger(id) || id < 1) throw new EngineError('ID inválido', 400);
      const ok = await repo.updateInsumo(id, empresaId, { activo: false });
      if (!ok) throw new EngineError('Ítem no encontrado', 404);
      return { ok: true };
    },

    async movimientoInsumo(id: number, b: Record<string, unknown>) {
      const tipo = String(b.tipo || 'Consumo');
      const cantidad = npos(b.cantidad);
      if (!Number.isInteger(id) || id < 1 || !cantidad || !['Ingreso', 'Consumo'].includes(tipo)) {
        throw new EngineError('Movimiento de insumo inválido', 400);
      }
      const ins = await repo.findInsumoById(empresaId, id);
      if (!ins) throw new EngineError('Insumo no encontrado', 404);

      const nuevoStock =
        tipo === 'Ingreso'
          ? Math.round((ins.stock_actual + cantidad) * 1000) / 1000
          : Math.round((ins.stock_actual - cantidad) * 1000) / 1000;

      if (nuevoStock < 0) {
        throw new EngineError(`Stock insuficiente del insumo (${ins.stock_actual} ${ins.unidad})`, 409);
      }

      await repo.updateInsumo(id, empresaId, { stock_actual: nuevoStock });
      return { ok: true, stock_actual: nuevoStock };
    },

    async crearSolicitudesInsumo(user: EngineUser, b: Record<string, unknown>) {
      const rawItems = Array.isArray(b.items) ? b.items : [];
      const fallbackProvId = b.proveedor_id ? Number(b.proveedor_id) : null;
      const fallbackObs = b.observacion ? String(b.observacion).trim() : null;
      if (rawItems.length === 0) {
        throw new EngineError('Agrega al menos un ítem con cantidad a solicitar', 400);
      }

      const isGerencia = user.rol === 'Gerencia';
      const snap = await repo.getSnapshot(empresaId);
      const ctrl = snap.insumoControl || { empresa_id: empresaId, ...DEFAULT_INSUMO_CONTROL };
      const insById = new Map(snap.insumos.map((i) => [i.id, i]));
      const pendingInsumoIds = new Set(
        (snap.solicitudesInsumos || [])
          .filter((s) => s.estado === 'Pendiente' && s.insumo_id != null)
          .map((s) => s.insumo_id as number)
      );
      const allowedCatsLower = new Set((ctrl.categorias_permitidas_bar || []).map((c) => c.trim().toLowerCase()));
      const allowedCriteriosLower = new Set((ctrl.criterios_permitidos_bar || []).map((c) => c.trim().toLowerCase()));

      if (!isGerencia && ctrl.max_items_por_solicitud != null && rawItems.length > ctrl.max_items_por_solicitud) {
        throw new EngineError(
          `Gerencia limitó las solicitudes de Barra a un máximo de ${ctrl.max_items_por_solicitud} ítems por envío`,
          403
        );
      }

      const validatedToInsert: Array<Parameters<typeof repo.insertSolicitudInsumo>[0]> = [];

      for (const rawItem of rawItems) {
        const item = (rawItem || {}) as Record<string, unknown>;
        const insumoId = item.insumo_id ? Number(item.insumo_id) : null;
        const ins = insumoId ? insById.get(insumoId) || (await repo.findInsumoById(empresaId, insumoId)) : null;
        const nombreItem = String(item.nombre_item || ins?.nombre || '').trim().toUpperCase();
        const categoria = normalizeCategory(item.categoria || ins?.categoria || 'Insumos de Barra', 'Insumos de Barra');
        const unidad = String(item.unidad || ins?.unidad || 'unidad').trim();
        const cantidadSolicitada = npos(item.cantidad_solicitada ?? item.cantidad);
        const criterio = String(item.criterio || ins?.criterio || 'Reposición bajo mínimo').trim();
        const proveedorId = item.proveedor_id ? Number(item.proveedor_id) : (ins?.proveedor_id ?? fallbackProvId);

        if (!nombreItem || !cantidadSolicitada) continue;

        if (!isGerencia) {
          if (!ins) {
            throw new EngineError('Solo puedes solicitar ítems habilitados en el maestro de Gerencia', 403);
          }
          if (ins.solicitable_por_bar === false) {
            throw new EngineError(
              `El ítem "${ins.nombre}" está bloqueado por Gerencia para solicitudes de Barra`,
              403
            );
          }
          if (ctrl.restringir_categorias_bar && !allowedCatsLower.has(categoria.toLowerCase())) {
            throw new EngineError(
              `La categoría "${categoria}" está restringida por Gerencia para solicitudes de Barra`,
              403
            );
          }
          if (ctrl.solo_bajo_minimo && Number(ins.stock_actual || 0) >= Number(ins.stock_minimo || 0)) {
            throw new EngineError(
              `Gerencia solo autoriza solicitar ítems bajo mínimo (${ins.nombre} tiene stock suficiente)`,
              403
            );
          }
          if (ctrl.bloquear_duplicados_pendientes && pendingInsumoIds.has(ins.id)) {
            throw new EngineError(
              `Ya existe una solicitud pendiente para "${ins.nombre}". Espera aprobación de Gerencia`,
              403
            );
          }
          if (ins.max_por_solicitud != null && ins.max_por_solicitud > 0 && cantidadSolicitada > ins.max_por_solicitud) {
            throw new EngineError(
              `La cantidad solicitada de "${ins.nombre}" (${cantidadSolicitada}) supera el máximo de ${ins.max_por_solicitud} ${ins.unidad} autorizado por Gerencia`,
              403
            );
          }
          if (
            !ctrl.permitir_criterio_personalizado_bar &&
            allowedCriteriosLower.size > 0 &&
            !allowedCriteriosLower.has(criterio.toLowerCase())
          ) {
            throw new EngineError(
              `El criterio "${criterio}" no está dentro de los criterios autorizados por Gerencia`,
              403
            );
          }
        }

        validatedToInsert.push({
          empresa_id: empresaId,
          fecha: nowISO(),
          insumo_id: ins?.id ?? null,
          nombre_item: nombreItem,
          categoria,
          unidad,
          cantidad_solicitada: cantidadSolicitada,
          criterio,
          proveedor_id: proveedorId,
          estado: 'Pendiente',
          solicitante: user.email,
          observacion: item.observacion ? String(item.observacion).trim() : fallbackObs,
        });
      }

      if (validatedToInsert.length === 0) {
        throw new EngineError('No se encontraron ítems válidos con cantidad mayor a 0', 400);
      }

      for (const row of validatedToInsert) {
        await repo.insertSolicitudInsumo(row);
      }

      return { ok: true, creados: validatedToInsert.length };
    },

    async actualizarSolicitudInsumo(user: EngineUser, id: number, b: Record<string, unknown>) {
      requireAdmin(user);
      const estado = String(b.estado || '');
      if (!Number.isInteger(id) || id < 1 || !['Pendiente', 'Aprobada', 'Comprada', 'Rechazada'].includes(estado)) {
        throw new EngineError('Estado de solicitud inválido', 400);
      }
      const patch: Partial<{
        estado: 'Pendiente' | 'Aprobada' | 'Comprada' | 'Rechazada';
        cantidad_solicitada: number;
        observacion: string | null;
      }> = {
        estado: estado as 'Pendiente' | 'Aprobada' | 'Comprada' | 'Rechazada',
      };
      if (b.cantidad_solicitada !== undefined) {
        const qty = npos(b.cantidad_solicitada);
        if (!qty) throw new EngineError('Cantidad ajustada inválida', 400);
        patch.cantidad_solicitada = qty;
      }
      if (b.observacion !== undefined) {
        patch.observacion = b.observacion ? String(b.observacion).trim() : null;
      }

      const ok = await repo.updateSolicitudInsumo(id, empresaId, patch);
      if (!ok) throw new EngineError('Solicitud no encontrada', 404);
      return { ok: true };
    },

    async crearReceta(user: EngineUser, b: Record<string, unknown>) {
      requireAdmin(user);
      const codigo = String(b.codigo || '').trim().toUpperCase();
      const nombre = String(b.nombre || '').trim();
      const categoria = String(b.categoria || 'Cóctel Clásico').trim();
      const precioVenta = nnonneg(b.precio_venta ?? 0);
      const notas = b.notas ? String(b.notas).trim() : null;
      const rawIngs = Array.isArray(b.ingredientes) ? b.ingredientes : [];

      if (!codigo || !nombre || precioVenta === null || rawIngs.length === 0) {
        throw new EngineError('Completa código, nombre, precio de venta y al menos 1 ingrediente', 400);
      }

      const ingredientes: Array<{ producto_id: number; cantidad_ml_o_unidad: number; unidad_medida: string }> = [];
      for (const rawIng of rawIngs) {
        const ing = (rawIng || {}) as Record<string, unknown>;
        const pid = Number(ing.producto_id);
        const qty = npos(ing.cantidad_ml_o_unidad);
        const u = String(ing.unidad_medida || 'ml').trim();
        if (!Number.isInteger(pid) || !qty) {
          throw new EngineError('Todos los ingredientes deben tener producto y dosis positiva', 400);
        }
        const p = await repo.findProductoById(empresaId, pid);
        if (!p) throw new EngineError(`Ingrediente producto #${pid} no encontrado`, 404);
        ingredientes.push({ producto_id: pid, cantidad_ml_o_unidad: qty, unidad_medida: u });
      }

      const rec = await repo.insertReceta(
        {
          empresa_id: empresaId,
          codigo,
          nombre,
          categoria,
          precio_venta: precioVenta,
          notas,
          activo: true,
        },
        ingredientes
      );

      return { ok: true, id: rec.id };
    },

    async desactivarReceta(user: EngineUser, id: number) {
      requireAdmin(user);
      if (!Number.isInteger(id) || id < 1) throw new EngineError('ID inválido', 400);
      const ok = await repo.deactivateReceta(id, empresaId);
      if (!ok) throw new EngineError('Receta no encontrada', 404);
      return { ok: true };
    },

    async descontarReceta(user: EngineUser, id: number, b: Record<string, unknown>) {
      const porciones = npos(b.cantidad ?? 1);
      const fecha = String(b.fecha || todayDate()).slice(0, 10);
      const turnoRaw = String(b.turno || 'PM').trim().toUpperCase();
      const turno = (VALID_TURNOS.includes(turnoRaw as 'AM' | 'PM') ? turnoRaw : 'PM') as 'AM' | 'PM';
      const motivoExtra = String(b.motivo || '').trim();

      if (!Number.isInteger(id) || id < 1 || !porciones) {
        throw new EngineError('Cantidad de tragos a descontar inválida', 400);
      }

      const rec = await repo.findRecetaById(empresaId, id);
      if (!rec) throw new EngineError('Receta no encontrada', 404);

      const ings = await repo.getRecetaIngredientes(empresaId, id);
      if (ings.length === 0) {
        throw new EngineError('La receta no tiene ingredientes configurados', 400);
      }

      const plan: Array<{ prod: DbProducto; stockUnits: number; rawQty: number; unit: string }> = [];
      for (const ing of ings) {
        const prod = await repo.findProductoById(empresaId, ing.producto_id);
        if (!prod) continue;
        const totalRaw = Math.round(Number(ing.cantidad_ml_o_unidad) * porciones * 1000) / 1000;
        const stockUnits = convertIngredientToStockUnits(prod, totalRaw, ing.unidad_medida);
        const lotesBar = await repo.getActiveLotesForProductBodega(empresaId, prod.id, 3);
        const avail = lotesBar.reduce((s, l) => s + Number(l.cantidad_disponible || 0), 0);
        if (avail + 0.0005 < stockUnits) {
          throw new EngineError(
            `Stock insuficiente en Barra de ${prod.nombre}: requiere ${stockUnits} ${prod.unidad}, disponible ${Math.round(avail * 1000) / 1000}`,
            409
          );
        }
        plan.push({ prod, stockUnits, rawQty: totalRaw, unit: ing.unidad_medida });
      }

      let costoTotal = 0;
      const detalleParts: string[] = [];
      for (const item of plan) {
        const deducted = await deductLotsFEFO(item.prod.id, 3, item.stockUnits);
        for (const d of deducted) {
          costoTotal += d.qty * d.costo;
          await repo.insertMovimiento({
            empresa_id: empresaId,
            fecha: nowISO(),
            tipo: 'Descuento Cóctel',
            producto_id: item.prod.id,
            bodega_id: 3,
            lote_id: d.loteId,
            cantidad: d.qty,
            costo_unitario: d.costo,
            motivo: `${porciones}x ${rec.nombre} (${fecha} · Turno ${turno} · ${item.rawQty} ${item.unit})${motivoExtra ? ' · ' + motivoExtra : ''}`,
            responsable: user.email,
          });
        }
        detalleParts.push(`${item.prod.nombre}: -${Math.round(item.stockUnits * 1000) / 1000} ${item.prod.unidad}`);
      }

      await repo.insertConsumoTurno({
        empresa_id: empresaId,
        fecha,
        turno,
        tipo: 'Cóctel Compuesto',
        receta_id: rec.id,
        producto_id: null,
        nombre: rec.nombre,
        cantidad_porciones: porciones,
        detalle_descuento: detalleParts.join(' | '),
        costo_total: Math.round(costoTotal),
        responsable: user.email,
        observacion: motivoExtra || null,
      });

      return { ok: true, receta: rec.nombre, porciones, fecha, turno };
    },

    async descontarTurnoLote(user: EngineUser, b: Record<string, unknown>) {
      const fecha = String(b.fecha || todayDate()).slice(0, 10);
      const turnoRaw = String(b.turno || 'PM').trim().toUpperCase();
      const turno = (VALID_TURNOS.includes(turnoRaw as 'AM' | 'PM') ? turnoRaw : 'PM') as 'AM' | 'PM';
      const observacion = String(b.observacion || '').trim().slice(0, 200);
      const recetasRaw = Array.isArray(b.recetas) ? b.recetas : [];
      const cortosRaw = Array.isArray(b.cortos) ? b.cortos : [];

      if (recetasRaw.length === 0 && cortosRaw.length === 0) {
        throw new EngineError('Ingresa al menos una receta de cóctel o corto para descontar en el turno', 400);
      }

      const aggregateByProduct = new Map<number, number>();
      const recetaEntries: Array<{
        rec: NonNullable<Awaited<ReturnType<typeof repo.findRecetaById>>>;
        porciones: number;
        items: Array<{ prod: DbProducto; stockUnits: number; rawQty: number; unit: string }>;
      }> = [];

      for (const rawR of recetasRaw) {
        const r = (rawR || {}) as Record<string, unknown>;
        const recetaId = Number(r.receta_id);
        const porciones = npos(r.cantidad);
        if (!Number.isInteger(recetaId) || !porciones) {
          throw new EngineError('Datos inválidos en las recetas seleccionadas', 400);
        }
        const rec = await repo.findRecetaById(empresaId, recetaId);
        if (!rec) throw new EngineError(`Receta #${recetaId} no encontrada`, 404);
        const ings = await repo.getRecetaIngredientes(empresaId, recetaId);
        if (ings.length === 0) {
          throw new EngineError(`La receta ${rec.nombre} no tiene ingredientes configurados`, 400);
        }
        const items: Array<{ prod: DbProducto; stockUnits: number; rawQty: number; unit: string }> = [];
        for (const ing of ings) {
          const prod = await repo.findProductoById(empresaId, ing.producto_id);
          if (!prod) continue;
          const rawQty = Math.round(Number(ing.cantidad_ml_o_unidad) * porciones * 1000) / 1000;
          const stockUnits = convertIngredientToStockUnits(prod, rawQty, ing.unidad_medida);
          aggregateByProduct.set(
            prod.id,
            Math.round(((aggregateByProduct.get(prod.id) || 0) + stockUnits) * 10000) / 10000
          );
          items.push({ prod, stockUnits, rawQty, unit: ing.unidad_medida });
        }
        recetaEntries.push({ rec, porciones, items });
      }

      const cortoEntries: Array<{
        prod: DbProducto;
        porciones: number;
        rendimientoUsado: number;
        stockUnits: number;
      }> = [];

      for (const rawC of cortosRaw) {
        const c = (rawC || {}) as Record<string, unknown>;
        const productoId = Number(c.producto_id);
        const porciones = npos(c.cantidad);
        if (!Number.isInteger(productoId) || !porciones) {
          throw new EngineError('Datos inválidos en los cortos por botella', 400);
        }
        const prod = await repo.findProductoById(empresaId, productoId);
        if (!prod) throw new EngineError(`Producto #${productoId} no encontrado`, 404);
        const overrideYield =
          c.porciones_por_botella !== undefined && c.porciones_por_botella !== ''
            ? npos(c.porciones_por_botella)
            : null;
        const rendimiento = overrideYield || Number(prod.porciones_corto || 0);
        if (!rendimiento || rendimiento <= 0) {
          throw new EngineError(
            `${prod.nombre} no tiene rendimiento de cortos configurado. Configúralo desde Gerencia o indica cuántas porciones rinde la botella.`,
            400
          );
        }
        const stockUnits = Math.round((porciones / rendimiento) * 10000) / 10000;
        aggregateByProduct.set(
          prod.id,
          Math.round(((aggregateByProduct.get(prod.id) || 0) + stockUnits) * 10000) / 10000
        );
        cortoEntries.push({ prod, porciones, rendimientoUsado: rendimiento, stockUnits });
      }

      for (const [pid, reqQty] of aggregateByProduct.entries()) {
        const prod = await repo.findProductoById(empresaId, pid);
        if (!prod) continue;
        const lotesBar = await repo.getActiveLotesForProductBodega(empresaId, pid, 3);
        const avail = lotesBar.reduce((s, l) => s + Number(l.cantidad_disponible || 0), 0);
        if (avail + 0.0005 < reqQty) {
          throw new EngineError(
            `Stock insuficiente en Barra de ${prod.nombre}: requiere ${Math.round(reqQty * 1000) / 1000} ${prod.unidad}, disponible ${Math.round(avail * 1000) / 1000}`,
            409
          );
        }
      }

      for (const entry of recetaEntries) {
        let costoTotal = 0;
        const detalleParts: string[] = [];
        for (const item of entry.items) {
          const deducted = await deductLotsFEFO(item.prod.id, 3, item.stockUnits);
          for (const d of deducted) {
            costoTotal += d.qty * d.costo;
            await repo.insertMovimiento({
              empresa_id: empresaId,
              fecha: nowISO(),
              tipo: 'Descuento Cóctel',
              producto_id: item.prod.id,
              bodega_id: 3,
              lote_id: d.loteId,
              cantidad: d.qty,
              costo_unitario: d.costo,
              motivo: `${entry.porciones}x ${entry.rec.nombre} (${fecha} · Turno ${turno} · ${item.rawQty} ${item.unit})${observacion ? ' · ' + observacion : ''}`,
              responsable: user.email,
            });
          }
          detalleParts.push(`${item.prod.nombre}: -${Math.round(item.stockUnits * 1000) / 1000} ${item.prod.unidad}`);
        }
        await repo.insertConsumoTurno({
          empresa_id: empresaId,
          fecha,
          turno,
          tipo: 'Cóctel Compuesto',
          receta_id: entry.rec.id,
          producto_id: null,
          nombre: entry.rec.nombre,
          cantidad_porciones: entry.porciones,
          detalle_descuento: detalleParts.join(' | '),
          costo_total: Math.round(costoTotal),
          responsable: user.email,
          observacion: observacion || null,
        });
      }

      for (const c of cortoEntries) {
        let costoTotal = 0;
        const deducted = await deductLotsFEFO(c.prod.id, 3, c.stockUnits);
        for (const d of deducted) {
          costoTotal += d.qty * d.costo;
          await repo.insertMovimiento({
            empresa_id: empresaId,
            fecha: nowISO(),
            tipo: 'Descuento Corto',
            producto_id: c.prod.id,
            bodega_id: 3,
            lote_id: d.loteId,
            cantidad: d.qty,
            costo_unitario: d.costo,
            motivo: `${c.porciones} corto(s) ${c.prod.nombre} (Rend: ${c.rendimientoUsado}/bot · ${fecha} Turno ${turno})${observacion ? ' · ' + observacion : ''}`,
            responsable: user.email,
          });
        }
        await repo.insertConsumoTurno({
          empresa_id: empresaId,
          fecha,
          turno,
          tipo: 'Corto / Botella',
          receta_id: null,
          producto_id: c.prod.id,
          nombre: `Corto ${c.prod.nombre}`,
          cantidad_porciones: c.porciones,
          detalle_descuento: `${c.porciones} cortos (${c.rendimientoUsado}/bot) = -${Math.round(c.stockUnits * 1000) / 1000} ${c.prod.unidad}`,
          costo_total: Math.round(costoTotal),
          responsable: user.email,
          observacion: observacion || null,
        });
      }

      return {
        ok: true,
        recetas_procesadas: recetaEntries.length,
        cortos_procesados: cortoEntries.length,
        fecha,
        turno,
      };
    },

    async crearVaso(user: EngineUser, b: Record<string, unknown>) {
      requireAdmin(user);
      const codigo = String(b.codigo || '').trim().toUpperCase();
      const nombre = String(b.nombre || '').trim();
      const capacidadMl = npos(b.capacidad_ml ?? 350);
      const stockInicial = nnonneg(b.stock_inicial ?? 0);
      const stockMinimo = nnonneg(b.stock_minimo ?? 12);
      const costoReposicion = nnonneg(b.costo_reposicion ?? 0);

      if (!codigo || !nombre || !capacidadMl || stockInicial === null || stockMinimo === null || costoReposicion === null) {
        throw new EngineError('Verifica los datos del vaso/cristalería', 400);
      }

      const v = await repo.insertVaso({
        empresa_id: empresaId,
        codigo,
        nombre,
        capacidad_ml: capacidadMl,
        stock_inicial: stockInicial,
        stock_disponible: stockInicial,
        stock_minimo: stockMinimo,
        roturas_acumuladas: 0,
        costo_reposicion: costoReposicion,
        activo: true,
      });

      if (stockInicial > 0) {
        await repo.insertVasoMovimiento({
          empresa_id: empresaId,
          vaso_id: v.id,
          fecha: nowISO(),
          turno: 'AM',
          tipo: 'Stock Inicial',
          cantidad: stockInicial,
          motivo: 'Stock inicial de cristalería en sistema',
          responsable: user.email,
        });
      }

      return { ok: true, id: v.id };
    },

    async actualizarVaso(user: EngineUser, id: number, b: Record<string, unknown>) {
      requireAdmin(user);
      if (!Number.isInteger(id) || id < 1) throw new EngineError('ID inválido', 400);
      const nombre = String(b.nombre || '').trim();
      const capacidadMl = npos(b.capacidad_ml ?? 350);
      const stockMinimo = nnonneg(b.stock_minimo ?? 12);
      const costoReposicion = nnonneg(b.costo_reposicion ?? 0);
      if (!nombre || !capacidadMl || stockMinimo === null || costoReposicion === null) {
        throw new EngineError('Datos inválidos', 400);
      }
      const ok = await repo.updateVaso(id, empresaId, {
        nombre,
        capacidad_ml: capacidadMl,
        stock_minimo: stockMinimo,
        costo_reposicion: costoReposicion,
      });
      if (!ok) throw new EngineError('Vaso no encontrado', 404);
      return { ok: true };
    },

    async movimientoVaso(user: EngineUser, id: number, b: Record<string, unknown>) {
      const tipo = String(b.tipo || 'Rotura');
      const cantidad = npos(b.cantidad);
      const turnoRaw = String(b.turno || 'PM').trim().toUpperCase();
      const motivo = String(b.motivo || '').slice(0, 180);

      if (!Number.isInteger(id) || id < 1 || !cantidad || !VALID_TURNOS.includes(turnoRaw as 'AM' | 'PM')) {
        throw new EngineError('Datos inválidos (cantidad > 0 y turno AM/PM)', 400);
      }
      if (!['Compra / Ingreso', 'Rotura', 'Pérdida Evento', 'Ajuste'].includes(tipo)) {
        throw new EngineError('Tipo de movimiento inválido', 400);
      }
      if (tipo === 'Compra / Ingreso' && user.rol !== 'Gerencia') {
        throw new EngineError('Solo Gerencia puede registrar compras de cristalería', 403);
      }

      const vaso = await repo.findVasoById(empresaId, id);
      if (!vaso) throw new EngineError('Tipo de vaso no encontrado', 404);

      let nuevoDisponible = vaso.stock_disponible;
      let nuevasRoturas = vaso.roturas_acumuladas;

      if (tipo === 'Compra / Ingreso') {
        nuevoDisponible = Math.round((vaso.stock_disponible + cantidad) * 1000) / 1000;
      } else {
        if (vaso.stock_disponible < cantidad) {
          throw new EngineError(`Stock disponible insuficiente (${vaso.stock_disponible} unidades)`, 409);
        }
        nuevoDisponible = Math.round((vaso.stock_disponible - cantidad) * 1000) / 1000;
        if (tipo === 'Rotura' || tipo === 'Pérdida Evento') {
          nuevasRoturas = Math.round((vaso.roturas_acumuladas + cantidad) * 1000) / 1000;
        }
      }

      await repo.updateVaso(id, empresaId, {
        stock_disponible: nuevoDisponible,
        roturas_acumuladas: nuevasRoturas,
      });

      await repo.insertVasoMovimiento({
        empresa_id: empresaId,
        vaso_id: id,
        fecha: nowISO(),
        turno: turnoRaw as 'AM' | 'PM',
        tipo,
        cantidad,
        motivo: motivo || tipo,
        responsable: user.email,
      });

      return { ok: true, stock_disponible: nuevoDisponible };
    },
  };
}
