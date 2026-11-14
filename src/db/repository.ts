import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

export interface DbProducto {
  id: number;
  empresa_id: number;
  codigo: string;
  nombre: string;
  categoria: string;
  area: string;
  unidad: string;
  stock_inicial_sistema: number;
  stock_minimo: number;
  costo_referencia: number;
  tipo_envase: string | null;
  contenido_envase: number | null;
  unidad_contenido: string | null;
  porciones_corto?: number | null;
  porciones_coctel?: number | null;
  activo: boolean;
}

export interface DbLote {
  id: number;
  empresa_id: number;
  producto_id: number;
  bodega_id: number;
  cantidad_inicial: number;
  cantidad_disponible: number;
  costo_unitario: number;
  fecha_vencimiento: string | null;
  fecha_ingreso: string;
  referencia: string | null;
}

export interface DbMovimiento {
  id: number;
  empresa_id: number;
  fecha: string;
  tipo: string;
  producto_id: number;
  bodega_id: number;
  lote_id: number | null;
  cantidad: number;
  costo_unitario: number;
  motivo: string | null;
  responsable: string;
}

export interface DbSolicitud {
  id: number;
  empresa_id: number;
  fecha: string;
  bodega_origen_id: number;
  bodega_destino_id: number;
  producto_id: number;
  cantidad_solicitada: number;
  cantidad_despachada: number | null;
  cantidad_entregada: number | null;
  tipo_solicitud: string;
  estado: 'Pendiente' | 'Despachada' | 'Recibida' | 'Rechazada';
  solicitante: string;
  observacion: string | null;
  fecha_despacho: string | null;
  fecha_recepcion: string | null;
}

export interface DbCierreTurno {
  id: number;
  empresa_id: number;
  fecha: string;
  turno: 'AM' | 'PM';
  producto_id: number;
  stock_inicio: number;
  ingresos: number;
  mermas: number;
  stock_teorico_esperado: number;
  consumo_calculado: number;
  stock_cierre: number;
  diferencia_comparativa: number;
  responsable: string;
  observacion: string | null;
}

export interface DbProveedor {
  id: number;
  empresa_id: number;
  nombre: string;
  contacto: string | null;
  telefono_wsp: string;
  email: string | null;
  categoria: string;
  rut: string | null;
  notas: string | null;
  activo: boolean;
}

export interface DbCategoria {
  id: number;
  empresa_id: number;
  nombre: string;
  activo: boolean;
}

export interface DbInsumo {
  id: number;
  empresa_id: number;
  codigo: string;
  nombre: string;
  categoria?: string;
  criterio?: string | null;
  unidad: string;
  stock_actual: number;
  stock_minimo: number;
  costo_unitario: number;
  proveedor_id: number | null;
  solicitable_por_bar?: boolean;
  max_por_solicitud?: number | null;
  notas: string | null;
  activo: boolean;
}

export interface DbInsumoControl {
  empresa_id: number;
  permitir_crear_items_bar: boolean;
  restringir_categorias_bar: boolean;
  categorias_permitidas_bar: string[];
  solo_bajo_minimo: boolean;
  bloquear_duplicados_pendientes: boolean;
  max_items_por_solicitud: number | null;
  permitir_criterio_personalizado_bar: boolean;
  criterios_permitidos_bar: string[];
}

export const DEFAULT_INSUMO_CONTROL: Omit<DbInsumoControl, 'empresa_id'> = {
  permitir_crear_items_bar: false,
  restringir_categorias_bar: false,
  categorias_permitidas_bar: ['Insumos de Barra', 'Verduras', 'Descartables'],
  solo_bajo_minimo: false,
  bloquear_duplicados_pendientes: true,
  max_items_por_solicitud: null,
  permitir_criterio_personalizado_bar: false,
  criterios_permitidos_bar: [
    'Reposición bajo mínimo',
    'Urgencia de turno',
    'Rotura o reposición de vajilla',
  ],
};

export interface DbSolicitudInsumo {
  id: number;
  empresa_id: number;
  fecha: string;
  insumo_id: number | null;
  nombre_item: string;
  categoria: string;
  unidad: string;
  cantidad_solicitada: number;
  criterio: string;
  proveedor_id: number | null;
  estado: 'Pendiente' | 'Aprobada' | 'Comprada' | 'Rechazada';
  solicitante: string;
  observacion: string | null;
}

export const DEFAULT_SEED_CATEGORIES = [
  'Whisky',
  'Piscos',
  'Cervezas',
  'Otros Licores',
  'Gaseosas',
  'Jugos',
  'Licores',
  'Verduras',
  'Vajilla',
  'Insumos de Barra',
  'Descartables',
];

export interface DbReceta {
  id: number;
  empresa_id: number;
  codigo: string;
  nombre: string;
  categoria: string;
  precio_venta: number;
  notas: string | null;
  activo: boolean;
}

export interface DbRecetaIngrediente {
  id: number;
  empresa_id: number;
  receta_id: number;
  producto_id: number;
  cantidad_ml_o_unidad: number;
  unidad_medida: string;
}

export interface DbVaso {
  id: number;
  empresa_id: number;
  codigo: string;
  nombre: string;
  capacidad_ml: number;
  stock_inicial: number;
  stock_disponible: number;
  stock_minimo: number;
  roturas_acumuladas: number;
  costo_reposicion: number;
  activo: boolean;
}

export interface DbVasoMovimiento {
  id: number;
  empresa_id: number;
  vaso_id: number;
  fecha: string;
  turno: 'AM' | 'PM';
  tipo: string;
  cantidad: number;
  motivo: string | null;
  responsable: string;
}

export interface DbConsumoTurno {
  id: number;
  empresa_id: number;
  fecha: string;
  turno: 'AM' | 'PM';
  tipo: 'Cóctel Compuesto' | 'Corto / Botella';
  receta_id: number | null;
  producto_id: number | null;
  nombre: string;
  cantidad_porciones: number;
  detalle_descuento: string;
  costo_total: number;
  responsable: string;
  observacion: string | null;
}

export const INITIAL_SEED_PRODUCTS = [
  { codigo: 'BAR-001', nombre: 'PISCO ALTO DEL CARMEN 35° 1.5 LTS', categoria: 'Piscos', unidad: 'botella', min: 4, costo: 8500, envase: 'botella', cont: 1500, ucont: 'ml', cortos: 25, cocteles: 18, bar: 2, central: 18, venc: null },
  { codigo: 'BAR-002', nombre: 'PISCO MISTRAL 35° 750 ML', categoria: 'Piscos', unidad: 'botella', min: 5, costo: 6200, envase: 'botella', cont: 750, ucont: 'ml', cortos: 12, cocteles: 8, bar: 3, central: 24, venc: null },
  { codigo: 'BAR-003', nombre: 'WHISKY JOHNNIE WALKER BLACK 750 ML', categoria: 'Whisky', unidad: 'botella', min: 3, costo: 18000, envase: 'botella', cont: 750, ucont: 'ml', cortos: 15, cocteles: 12, bar: 1, central: 12, venc: null },
  { codigo: 'BAR-004', nombre: 'WHISKY JACK DANIELS N°7 750 ML', categoria: 'Whisky', unidad: 'botella', min: 3, costo: 16500, envase: 'botella', cont: 750, ucont: 'ml', cortos: 15, cocteles: 12, bar: 4, central: 10, venc: null },
  { codigo: 'BAR-005', nombre: 'CORONA BOTELLA 330 ML', categoria: 'Cervezas', unidad: 'unidad', min: 48, costo: 1200, envase: 'botella', cont: 330, ucont: 'ml', cortos: null, cocteles: null, bar: 56, central: 144, venc: '2027-03-15' },
  { codigo: 'BAR-006', nombre: 'KUNSTMANN TOROBAYO 330 ML', categoria: 'Cervezas', unidad: 'unidad', min: 24, costo: 1450, envase: 'botella', cont: 330, ucont: 'ml', cortos: null, cocteles: null, bar: 18, central: 72, venc: '2027-05-20' },
  { codigo: 'BAR-007', nombre: 'RAMAZZOTTI APERITIVO VIOLETTO 700 ML', categoria: 'Otros Licores', unidad: 'botella', min: 4, costo: 11900, envase: 'botella', cont: 700, ucont: 'ml', cortos: 12, cocteles: 11, bar: 5, central: 16, venc: null },
  { codigo: 'BAR-008', nombre: 'GIN BEEFEATER LONDON DRY 750 ML', categoria: 'Otros Licores', unidad: 'botella', min: 3, costo: 14500, envase: 'botella', cont: 750, ucont: 'ml', cortos: 15, cocteles: 12, bar: 0, central: 10, venc: null },
  { codigo: 'BAR-009', nombre: 'APEROL APERITIVO 750 ML', categoria: 'Otros Licores', unidad: 'botella', min: 3, costo: 11500, envase: 'botella', cont: 750, ucont: 'ml', cortos: 12, cocteles: 10, bar: 4, central: 12, venc: null },
  { codigo: 'BAR-010', nombre: 'ESPUMANTE VALDIVIESO BRUT 750 ML', categoria: 'Otros Licores', unidad: 'botella', min: 12, costo: 4900, envase: 'botella', cont: 750, ucont: 'ml', cortos: 6, cocteles: 8, bar: 8, central: 60, venc: '2027-08-20' },
  { codigo: 'BAR-011', nombre: 'COCA-COLA NORMAL LATA 350 ML', categoria: 'Gaseosas', unidad: 'lata', min: 48, costo: 650, envase: 'lata', cont: 350, ucont: 'ml', cortos: null, cocteles: 2, bar: 60, central: 192, venc: '2027-09-01' },
  { codigo: 'BAR-012', nombre: 'TÓNICA FEVER TREE 200 ML', categoria: 'Gaseosas', unidad: 'unidad', min: 24, costo: 1100, envase: 'botella', cont: 200, ucont: 'ml', cortos: null, cocteles: 1, bar: 30, central: 96, venc: '2027-04-10' },
  { codigo: 'BAR-013', nombre: 'JUGO DE LIMÓN NATURAL SUTIL 1 LT', categoria: 'Jugos', unidad: 'botella', min: 6, costo: 2800, envase: 'botella', cont: 1000, ucont: 'ml', cortos: null, cocteles: 22, bar: 4, central: 18, venc: '2027-01-15' },
  { codigo: 'BAR-014', nombre: 'JUGO DE NARANJA NATURAL 1 LT', categoria: 'Jugos', unidad: 'botella', min: 6, costo: 2400, envase: 'botella', cont: 1000, ucont: 'ml', cortos: null, cocteles: 10, bar: 7, central: 20, venc: '2027-01-18' },
];

export function nowISO(): string {
  return new Date().toISOString();
}

export function formatDisplayTS(iso: string | null | undefined): string {
  if (!iso) return '';
  return String(iso).slice(0, 19).replace('T', ' ');
}

function sortLotsFEFO(lots: DbLote[]): DbLote[] {
  return [...lots].sort((a, b) => {
    const aHas = a.fecha_vencimiento ? 0 : 1;
    const bHas = b.fecha_vencimiento ? 0 : 1;
    if (aHas !== bHas) return aHas - bHas;
    if (a.fecha_vencimiento && b.fecha_vencimiento && a.fecha_vencimiento !== b.fecha_vencimiento) {
      return a.fecha_vencimiento.localeCompare(b.fecha_vencimiento);
    }
    if (a.fecha_ingreso !== b.fecha_ingreso) {
      return a.fecha_ingreso.localeCompare(b.fecha_ingreso);
    }
    return a.id - b.id;
  });
}

export interface DataSnapshot {
  categorias: DbCategoria[];
  productos: DbProducto[];
  lotes: DbLote[];
  movimientos: DbMovimiento[];
  solicitudes: DbSolicitud[];
  cierres: DbCierreTurno[];
  proveedores: DbProveedor[];
  insumos: DbInsumo[];
  insumoControl: DbInsumoControl;
  solicitudesInsumos: DbSolicitudInsumo[];
  recetas: DbReceta[];
  recetaIngredientes: DbRecetaIngrediente[];
  vasos: DbVaso[];
  vasosMovimientos: DbVasoMovimiento[];
  consumosTurno: DbConsumoTurno[];
}

export interface DataRepository {
  readonly mode: 'supabase' | 'local-json';
  initAndSeed(empresaId: number, adminEmail: string, barEmail: string): Promise<void>;
  getSnapshot(empresaId: number): Promise<DataSnapshot>;

  // Productos & Lotes
  insertProducto(input: Omit<DbProducto, 'id'>): Promise<DbProducto>;
  updateProducto(
    id: number,
    empresaId: number,
    patch: Partial<Omit<DbProducto, 'id' | 'empresa_id' | 'codigo'>>
  ): Promise<boolean>;
  deactivateAllProductos(empresaId: number): Promise<void>;
  findProductoByCodigo(empresaId: number, codigo: string): Promise<DbProducto | null>;
  findProductoById(empresaId: number, id: number): Promise<DbProducto | null>;
  insertLote(input: Omit<DbLote, 'id'>): Promise<DbLote>;
  updateLoteDisponible(id: number, empresaId: number, newQty: number): Promise<void>;
  getActiveLotesForProductBodega(empresaId: number, productoId: number, bodegaId: number): Promise<DbLote[]>;

  // Movimientos & Solicitudes & Cierres
  insertMovimiento(input: Omit<DbMovimiento, 'id'>): Promise<DbMovimiento>;
  getMovimientosForDispatchCost(empresaId: number, productoId: number, solicitudId: number): Promise<DbMovimiento[]>;
  insertSolicitud(input: Omit<DbSolicitud, 'id'>): Promise<DbSolicitud>;
  findSolicitudById(empresaId: number, id: number): Promise<DbSolicitud | null>;
  updateSolicitud(id: number, empresaId: number, patch: Partial<DbSolicitud>): Promise<void>;
  insertCierre(input: Omit<DbCierreTurno, 'id'>): Promise<DbCierreTurno>;

  // Proveedores
  insertProveedor(input: Omit<DbProveedor, 'id'>): Promise<DbProveedor>;
  updateProveedor(id: number, empresaId: number, patch: Partial<DbProveedor>): Promise<boolean>;

  // Categorías dinámicas
  ensureCategoria(empresaId: number, nombre: string): Promise<DbCategoria>;
  renameCategoria(empresaId: number, oldNombre: string, newNombre: string): Promise<void>;
  deleteCategoria(empresaId: number, nombre: string): Promise<boolean>;

  // Insumos & Solicitudes de Insumos
  insertInsumo(input: Omit<DbInsumo, 'id'>): Promise<DbInsumo>;
  updateInsumo(id: number, empresaId: number, patch: Partial<DbInsumo>): Promise<boolean>;
  findInsumoById(empresaId: number, id: number): Promise<DbInsumo | null>;
  saveInsumoControl(empresaId: number, config: Omit<DbInsumoControl, 'empresa_id'>): Promise<DbInsumoControl>;
  insertSolicitudInsumo(input: Omit<DbSolicitudInsumo, 'id'>): Promise<DbSolicitudInsumo>;
  updateSolicitudInsumo(id: number, empresaId: number, patch: Partial<DbSolicitudInsumo>): Promise<boolean>;

  // Recetas de Cócteles
  insertReceta(
    input: Omit<DbReceta, 'id'>,
    ingredientes: Array<Omit<DbRecetaIngrediente, 'id' | 'receta_id' | 'empresa_id'>>
  ): Promise<DbReceta>;
  findRecetaById(empresaId: number, id: number): Promise<DbReceta | null>;
  getRecetaIngredientes(empresaId: number, recetaId: number): Promise<DbRecetaIngrediente[]>;
  deactivateReceta(id: number, empresaId: number): Promise<boolean>;

  // Vasos
  insertVaso(input: Omit<DbVaso, 'id'>): Promise<DbVaso>;
  updateVaso(id: number, empresaId: number, patch: Partial<DbVaso>): Promise<boolean>;
  findVasoById(empresaId: number, id: number): Promise<DbVaso | null>;
  insertVasoMovimiento(input: Omit<DbVasoMovimiento, 'id'>): Promise<DbVasoMovimiento>;

  // Consumos de recetas / cortos por turno
  insertConsumoTurno(input: Omit<DbConsumoTurno, 'id'>): Promise<DbConsumoTurno>;
}

// ============================================================================
// SUPABASE IMPLEMENTATION (@supabase/supabase-js)
// ============================================================================
export class SupabaseRepository implements DataRepository {
  readonly mode = 'supabase' as const;
  private client: SupabaseClient;
  private fallbackControl = new Map<number, DbInsumoControl>();
  private fallbackInsumoLimits = new Map<number, { solicitable_por_bar?: boolean; max_por_solicitud?: number | null }>();

  constructor(url: string, serviceKey: string) {
    this.client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private assertOk<T>(res: { data: T; error: { message: string } | null }, context: string): T {
    if (res.error) {
      throw new Error(`Supabase (${context}): ${res.error.message}`);
    }
    return res.data;
  }

  async initAndSeed(empresaId: number, adminEmail: string, barEmail: string): Promise<void> {
    this.assertOk(
      await this.client
        .from('empresas')
        .upsert({ id: empresaId, nombre: 'Centro de Eventos & Barra Principal' }, { onConflict: 'id', ignoreDuplicates: true }),
      'empresas'
    );

    this.assertOk(
      await this.client.from('bodegas').upsert(
        [
          { id: 1, empresa_id: empresaId, nombre: 'Bodega Central', tipo: 'Central' },
          { id: 3, empresa_id: empresaId, nombre: 'Barra Principal', tipo: 'Barra' },
        ],
        { onConflict: 'id', ignoreDuplicates: true }
      ),
      'bodegas'
    );

    const countRes = await this.client
      .from('productos')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .eq('activo', true);

    if (countRes.error) {
      throw new Error(`Supabase (productos): ${countRes.error.message}. Ejecuta supabase_schema.sql en Supabase.`);
    }
    if ((countRes.count ?? 0) > 0) return;

    const insertedIds: Record<string, number> = {};
    for (const item of INITIAL_SEED_PRODUCTS) {
      const prod = await this.insertProducto({
        empresa_id: empresaId,
        codigo: item.codigo,
        nombre: item.nombre,
        categoria: item.categoria,
        area: 'Bar',
        unidad: item.unidad,
        stock_inicial_sistema: item.bar + item.central,
        stock_minimo: item.min,
        costo_referencia: item.costo,
        tipo_envase: item.envase,
        contenido_envase: item.cont,
        unidad_contenido: item.ucont,
        porciones_corto: item.cortos,
        porciones_coctel: item.cocteles,
        activo: true,
      });
      insertedIds[item.codigo] = prod.id;

      if (item.central > 0) {
        const lC = await this.insertLote({
          empresa_id: empresaId,
          producto_id: prod.id,
          bodega_id: 1,
          cantidad_inicial: item.central,
          cantidad_disponible: item.central,
          costo_unitario: item.costo,
          fecha_vencimiento: item.venc,
          fecha_ingreso: nowISO(),
          referencia: 'Stock inicial manual sistema',
        });
        await this.insertMovimiento({
          empresa_id: empresaId,
          fecha: nowISO(),
          tipo: 'Stock Inicial',
          producto_id: prod.id,
          bodega_id: 1,
          lote_id: lC.id,
          cantidad: item.central,
          costo_unitario: item.costo,
          motivo: 'Stock inicial de comienzo del sistema (Central)',
          responsable: adminEmail,
        });
      }

      if (item.bar > 0) {
        const lB = await this.insertLote({
          empresa_id: empresaId,
          producto_id: prod.id,
          bodega_id: 3,
          cantidad_inicial: item.bar,
          cantidad_disponible: item.bar,
          costo_unitario: item.costo,
          fecha_vencimiento: item.venc,
          fecha_ingreso: nowISO(),
          referencia: 'Stock inicial manual sistema',
        });
        await this.insertMovimiento({
          empresa_id: empresaId,
          fecha: nowISO(),
          tipo: 'Stock Inicial',
          producto_id: prod.id,
          bodega_id: 3,
          lote_id: lB.id,
          cantidad: item.bar,
          costo_unitario: item.costo,
          motivo: 'Stock inicial de comienzo del sistema (Barra)',
          responsable: adminEmail,
        });
      }
    }

    // Seed Proveedores
    const p1 = await this.insertProveedor({
      empresa_id: empresaId,
      nombre: 'Distribuidora Licores del Sur SpA',
      contacto: 'Rodrigo Morales',
      telefono_wsp: '+56984123456',
      email: 'ventas@licoresdelsur.cl',
      categoria: 'Licores y Destilados',
      rut: '76.432.110-K',
      notas: 'Despacho martes y viernes antes de las 14:00',
      activo: true,
    });
    const p2 = await this.insertProveedor({
      empresa_id: empresaId,
      nombre: 'Embotelladora & Mixers Central',
      contacto: 'Camila Soto',
      telefono_wsp: '+56992345678',
      email: 'pedidos@mixerscentral.cl',
      categoria: 'Gaseosas, Jugos y Cervezas',
      rut: '77.129.880-3',
      notas: 'Pedido mínimo 10 bandejas',
      activo: true,
    });
    const p3 = await this.insertProveedor({
      empresa_id: empresaId,
      nombre: 'Insumos & Fruta Fresca Barra Ltda.',
      contacto: 'Marcelo Vega',
      telefono_wsp: '+56977554433',
      email: 'insumos@frutabarra.cl',
      categoria: 'Insumos de Barra',
      rut: '76.998.221-1',
      notas: 'Limón sutil, menta, hielo y descartables',
      activo: true,
    });

    for (const catNombre of DEFAULT_SEED_CATEGORIES) {
      await this.ensureCategoria(empresaId, catNombre);
    }

    // Seed Insumos vinculados a proveedores y categorías dinámicas
    await this.insertInsumo({
      empresa_id: empresaId,
      codigo: 'INS-001',
      nombre: 'LIMÓN SUTIL FRESCO (MALLA)',
      categoria: 'Verduras',
      criterio: 'Reposición bajo mínimo',
      unidad: 'kg',
      stock_actual: 8,
      stock_minimo: 5,
      costo_unitario: 1950,
      proveedor_id: p3.id,
      notas: 'Para Pisco Sour, Whisky Sour y garnish',
      activo: true,
    });
    await this.insertInsumo({
      empresa_id: empresaId,
      codigo: 'INS-002',
      nombre: 'HIELO EN CUBOS CRISTAL 5 KG',
      categoria: 'Insumos de Barra',
      criterio: 'Urgencia fin de semana',
      unidad: 'bolsa',
      stock_actual: 4,
      stock_minimo: 6,
      costo_unitario: 1800,
      proveedor_id: p3.id,
      notas: 'Stock crítico fin de semana',
      activo: true,
    });
    await this.insertInsumo({
      empresa_id: empresaId,
      codigo: 'INS-003',
      nombre: 'JARABE DE GOMA / SIMPLE SYRUP 1 LT',
      categoria: 'Licores',
      criterio: 'Reposición de turno',
      unidad: 'botella',
      stock_actual: 5,
      stock_minimo: 3,
      costo_unitario: 2900,
      proveedor_id: p2.id,
      notas: 'Base coctelería sour',
      activo: true,
    });
    await this.insertInsumo({
      empresa_id: empresaId,
      codigo: 'INS-004',
      nombre: 'SERVILLETA CÓCTEL NEGRA (PAQ 100)',
      categoria: 'Descartables',
      criterio: 'Reposición bajo mínimo',
      unidad: 'paquete',
      stock_actual: 12,
      stock_minimo: 6,
      costo_unitario: 1100,
      proveedor_id: p3.id,
      notas: 'Servicio de barra y salón',
      activo: true,
    });
    await this.insertInsumo({
      empresa_id: empresaId,
      codigo: 'INS-005',
      nombre: 'MENTA FRESCA (ATADO)',
      categoria: 'Verduras',
      criterio: 'Evento / Fin de semana',
      unidad: 'atado',
      stock_actual: 3,
      stock_minimo: 5,
      costo_unitario: 950,
      proveedor_id: p3.id,
      notas: 'Para Mojitos y garnish',
      activo: true,
    });
    await this.insertInsumo({
      empresa_id: empresaId,
      codigo: 'INS-006',
      nombre: 'PLATILLOS Y BANDEJAS DE SERVICIO',
      categoria: 'Vajilla',
      criterio: 'Reposición por quiebre',
      unidad: 'unidad',
      stock_actual: 18,
      stock_minimo: 12,
      costo_unitario: 3500,
      proveedor_id: p3.id,
      notas: 'Vajilla de apoyo para barra y salón',
      activo: true,
    });

    // Seed Recetas de Cócteles (Costeo + Descuento automático)
    await this.insertReceta(
      {
        empresa_id: empresaId,
        codigo: 'COC-001',
        nombre: 'Pisco Sour Catedral',
        categoria: 'Cóctel Clásico',
        precio_venta: 6900,
        notas: '90 ml Pisco Mistral + 45 ml Limón natural + Goma',
        activo: true,
      },
      [
        { producto_id: insertedIds['BAR-002'], cantidad_ml_o_unidad: 90, unidad_medida: 'ml' },
        { producto_id: insertedIds['BAR-013'], cantidad_ml_o_unidad: 45, unidad_medida: 'ml' },
      ]
    );
    await this.insertReceta(
      {
        empresa_id: empresaId,
        codigo: 'COC-002',
        nombre: 'Ramazzotti Spritz',
        categoria: 'Spritz & Aperitivos',
        precio_venta: 7500,
        notas: '60 ml Ramazzotti + 90 ml Espumante Brut',
        activo: true,
      },
      [
        { producto_id: insertedIds['BAR-007'], cantidad_ml_o_unidad: 60, unidad_medida: 'ml' },
        { producto_id: insertedIds['BAR-010'], cantidad_ml_o_unidad: 90, unidad_medida: 'ml' },
      ]
    );
    await this.insertReceta(
      {
        empresa_id: empresaId,
        codigo: 'COC-003',
        nombre: 'Whisky Sour Clásico',
        categoria: 'Cóctel Clásico',
        precio_venta: 8200,
        notas: '60 ml Johnnie Walker Black + 30 ml Limón',
        activo: true,
      },
      [
        { producto_id: insertedIds['BAR-003'], cantidad_ml_o_unidad: 60, unidad_medida: 'ml' },
        { producto_id: insertedIds['BAR-013'], cantidad_ml_o_unidad: 30, unidad_medida: 'ml' },
      ]
    );

    // Seed Maestro de Vasos
    await this.insertVaso({
      empresa_id: empresaId,
      codigo: 'VAS-001',
      nombre: 'Vaso Highball Largo',
      capacidad_ml: 350,
      stock_inicial: 60,
      stock_disponible: 56,
      stock_minimo: 36,
      roturas_acumuladas: 4,
      costo_reposicion: 2200,
      activo: true,
    });
    await this.insertVaso({
      empresa_id: empresaId,
      codigo: 'VAS-002',
      nombre: 'Copa Pisco Sour',
      capacidad_ml: 180,
      stock_inicial: 48,
      stock_disponible: 45,
      stock_minimo: 24,
      roturas_acumuladas: 3,
      costo_reposicion: 2900,
      activo: true,
    });
    await this.insertVaso({
      empresa_id: empresaId,
      codigo: 'VAS-003',
      nombre: 'Copa Balón Spritz / Gin',
      capacidad_ml: 580,
      stock_inicial: 36,
      stock_disponible: 32,
      stock_minimo: 24,
      roturas_acumuladas: 4,
      costo_reposicion: 3800,
      activo: true,
    });
    await this.insertVaso({
      empresa_id: empresaId,
      codigo: 'VAS-004',
      nombre: 'Vaso Old Fashioned Whisky',
      capacidad_ml: 300,
      stock_inicial: 40,
      stock_disponible: 40,
      stock_minimo: 24,
      roturas_acumuladas: 0,
      costo_reposicion: 2600,
      activo: true,
    });

    // Seed Solicitudes y Cierre AM/PM ejemplo
    await this.insertSolicitud({
      empresa_id: empresaId,
      fecha: nowISO(),
      bodega_origen_id: 1,
      bodega_destino_id: 3,
      producto_id: insertedIds['BAR-010'],
      cantidad_solicitada: 6,
      cantidad_despachada: null,
      cantidad_entregada: null,
      tipo_solicitud: 'Libre / Evento',
      estado: 'Pendiente',
      solicitante: barEmail,
      observacion: 'Matrimonio Salón Terraza (120 pax)',
      fecha_despacho: null,
      fecha_recepcion: null,
    });

    await this.insertSolicitud({
      empresa_id: empresaId,
      fecha: nowISO(),
      bodega_origen_id: 1,
      bodega_destino_id: 3,
      producto_id: insertedIds['BAR-008'],
      cantidad_solicitada: 3,
      cantidad_despachada: 3,
      cantidad_entregada: null,
      tipo_solicitud: 'Sugerido Mínimo',
      estado: 'Despachada',
      solicitante: barEmail,
      observacion: 'Reposición urgente Gin Beefeater',
      fecha_despacho: nowISO(),
      fecha_recepcion: null,
    });

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await this.insertCierre({
      empresa_id: empresaId,
      fecha: yesterday,
      turno: 'PM',
      producto_id: insertedIds['BAR-001'],
      stock_inicio: 4,
      ingresos: 0,
      mermas: 0,
      stock_teorico_esperado: 4,
      consumo_calculado: 2,
      stock_cierre: 2,
      diferencia_comparativa: -2,
      responsable: barEmail,
      observacion: 'Cierre manual turno PM',
    });

    void p1;
  }

  async getSnapshot(empresaId: number): Promise<DataSnapshot> {
    const [pRes, lRes, mRes, sRes, cRes, provRes, insRes, recRes, ingRes, vasRes, vasMovRes] = await Promise.all([
      this.client.from('productos').select('*').eq('empresa_id', empresaId).eq('activo', true).order('nombre', { ascending: true }),
      this.client.from('lotes').select('*').eq('empresa_id', empresaId).in('bodega_id', [1, 3]).gt('cantidad_disponible', 0),
      this.client.from('movimientos').select('*').eq('empresa_id', empresaId).in('bodega_id', [1, 3]).order('id', { ascending: false }).limit(350),
      this.client.from('solicitudes').select('*').eq('empresa_id', empresaId).eq('bodega_destino_id', 3).order('id', { ascending: false }).limit(200),
      this.client.from('cierres_turno').select('*').eq('empresa_id', empresaId).order('id', { ascending: false }).limit(150),
      this.client.from('proveedores').select('*').eq('empresa_id', empresaId).eq('activo', true).order('nombre', { ascending: true }),
      this.client.from('insumos').select('*').eq('empresa_id', empresaId).eq('activo', true).order('nombre', { ascending: true }),
      this.client.from('recetas').select('*').eq('empresa_id', empresaId).eq('activo', true).order('nombre', { ascending: true }),
      this.client.from('receta_ingredientes').select('*').eq('empresa_id', empresaId),
      this.client.from('vasos').select('*').eq('empresa_id', empresaId).eq('activo', true).order('nombre', { ascending: true }),
      this.client.from('vasos_movimientos').select('*').eq('empresa_id', empresaId).order('id', { ascending: false }).limit(150),
    ]);

    const [consRes, catRes, solInsRes, ctrlRes] = await Promise.all([
      this.client.from('consumos_turno').select('*').eq('empresa_id', empresaId).order('id', { ascending: false }).limit(250),
      this.client.from('categorias').select('*').eq('empresa_id', empresaId).eq('activo', true).order('nombre', { ascending: true }),
      this.client.from('insumo_solicitudes').select('*').eq('empresa_id', empresaId).order('id', { ascending: false }).limit(150),
      this.client.from('insumo_control_config').select('*').eq('empresa_id', empresaId).maybeSingle(),
    ]);
    const consumosTurno = consRes.error ? [] : ((consRes.data || []) as DbConsumoTurno[]);
    const categorias = catRes.error ? [] : ((catRes.data || []) as DbCategoria[]);
    const solicitudesInsumos = solInsRes.error ? [] : ((solInsRes.data || []) as DbSolicitudInsumo[]);
    const insumoControl: DbInsumoControl =
      !ctrlRes.error && ctrlRes.data
        ? (ctrlRes.data as DbInsumoControl)
        : this.fallbackControl.get(empresaId) || { empresa_id: empresaId, ...DEFAULT_INSUMO_CONTROL };

    const rawInsumos = (this.assertOk(insRes, 'insumos') || []) as DbInsumo[];
    const insumos = rawInsumos.map((ins) => {
      const ov = this.fallbackInsumoLimits.get(ins.id);
      return {
        ...ins,
        solicitable_por_bar: ov?.solicitable_por_bar ?? ins.solicitable_por_bar ?? true,
        max_por_solicitud: ov?.max_por_solicitud !== undefined ? ov.max_por_solicitud : ins.max_por_solicitud ?? null,
      };
    });

    return {
      categorias,
      productos: (this.assertOk(pRes, 'productos') || []) as DbProducto[],
      lotes: sortLotsFEFO((this.assertOk(lRes, 'lotes') || []) as DbLote[]),
      movimientos: (this.assertOk(mRes, 'movimientos') || []) as DbMovimiento[],
      solicitudes: (this.assertOk(sRes, 'solicitudes') || []) as DbSolicitud[],
      cierres: (this.assertOk(cRes, 'cierres') || []) as DbCierreTurno[],
      proveedores: (this.assertOk(provRes, 'proveedores') || []) as DbProveedor[],
      insumos,
      insumoControl,
      solicitudesInsumos,
      recetas: (this.assertOk(recRes, 'recetas') || []) as DbReceta[],
      recetaIngredientes: (this.assertOk(ingRes, 'recetaIngredientes') || []) as DbRecetaIngrediente[],
      vasos: (this.assertOk(vasRes, 'vasos') || []) as DbVaso[],
      vasosMovimientos: (this.assertOk(vasMovRes, 'vasosMovimientos') || []) as DbVasoMovimiento[],
      consumosTurno,
    };
  }

  async insertProducto(input: Omit<DbProducto, 'id'>): Promise<DbProducto> {
    const res = await this.client.from('productos').insert(input).select('*').single();
    return this.assertOk(res, 'insertProducto') as DbProducto;
  }

  async updateProducto(id: number, empresaId: number, patch: Partial<Omit<DbProducto, 'id' | 'empresa_id' | 'codigo'>>): Promise<boolean> {
    const res = await this.client.from('productos').update(patch).eq('id', id).eq('empresa_id', empresaId).select('id');
    return ((this.assertOk(res, 'updateProducto') as Array<{ id: number }>) || []).length > 0;
  }

  async deactivateAllProductos(empresaId: number): Promise<void> {
    this.assertOk(
      await this.client.from('productos').update({ activo: false }).eq('empresa_id', empresaId),
      'deactivateAllProductos'
    );
  }

  async findProductoByCodigo(empresaId: number, codigo: string): Promise<DbProducto | null> {
    const res = await this.client.from('productos').select('*').eq('empresa_id', empresaId).eq('codigo', codigo).eq('activo', true).limit(1);
    return ((this.assertOk(res, 'findProductoByCodigo') as DbProducto[]) || [])[0] || null;
  }

  async findProductoById(empresaId: number, id: number): Promise<DbProducto | null> {
    const res = await this.client.from('productos').select('*').eq('empresa_id', empresaId).eq('id', id).eq('activo', true).limit(1);
    return ((this.assertOk(res, 'findProductoById') as DbProducto[]) || [])[0] || null;
  }

  async insertLote(input: Omit<DbLote, 'id'>): Promise<DbLote> {
    const res = await this.client.from('lotes').insert(input).select('*').single();
    return this.assertOk(res, 'insertLote') as DbLote;
  }

  async updateLoteDisponible(id: number, empresaId: number, newQty: number): Promise<void> {
    this.assertOk(
      await this.client.from('lotes').update({ cantidad_disponible: newQty }).eq('id', id).eq('empresa_id', empresaId),
      'updateLoteDisponible'
    );
  }

  async getActiveLotesForProductBodega(empresaId: number, productoId: number, bodegaId: number): Promise<DbLote[]> {
    const res = await this.client
      .from('lotes')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('producto_id', productoId)
      .eq('bodega_id', bodegaId)
      .gt('cantidad_disponible', 0);
    return sortLotsFEFO((this.assertOk(res, 'getActiveLotes') || []) as DbLote[]);
  }

  async insertMovimiento(input: Omit<DbMovimiento, 'id'>): Promise<DbMovimiento> {
    const res = await this.client.from('movimientos').insert(input).select('*').single();
    return this.assertOk(res, 'insertMovimiento') as DbMovimiento;
  }

  async getMovimientosForDispatchCost(empresaId: number, productoId: number, solicitudId: number): Promise<DbMovimiento[]> {
    const res = await this.client
      .from('movimientos')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('producto_id', productoId)
      .eq('bodega_id', 1)
      .eq('tipo', 'Traspaso Salida')
      .ilike('motivo', `Despacho Solicitud #${solicitudId}%`);
    return (this.assertOk(res, 'getMovimientosForDispatchCost') || []) as DbMovimiento[];
  }

  async insertSolicitud(input: Omit<DbSolicitud, 'id'>): Promise<DbSolicitud> {
    const res = await this.client.from('solicitudes').insert(input).select('*').single();
    return this.assertOk(res, 'insertSolicitud') as DbSolicitud;
  }

  async findSolicitudById(empresaId: number, id: number): Promise<DbSolicitud | null> {
    const res = await this.client.from('solicitudes').select('*').eq('empresa_id', empresaId).eq('id', id).limit(1);
    return ((this.assertOk(res, 'findSolicitudById') as DbSolicitud[]) || [])[0] || null;
  }

  async updateSolicitud(id: number, empresaId: number, patch: Partial<DbSolicitud>): Promise<void> {
    this.assertOk(await this.client.from('solicitudes').update(patch).eq('id', id).eq('empresa_id', empresaId), 'updateSolicitud');
  }

  async insertCierre(input: Omit<DbCierreTurno, 'id'>): Promise<DbCierreTurno> {
    const res = await this.client.from('cierres_turno').insert(input).select('*').single();
    return this.assertOk(res, 'insertCierre') as DbCierreTurno;
  }

  async insertProveedor(input: Omit<DbProveedor, 'id'>): Promise<DbProveedor> {
    const res = await this.client.from('proveedores').insert(input).select('*').single();
    return this.assertOk(res, 'insertProveedor') as DbProveedor;
  }

  async updateProveedor(id: number, empresaId: number, patch: Partial<DbProveedor>): Promise<boolean> {
    const res = await this.client.from('proveedores').update(patch).eq('id', id).eq('empresa_id', empresaId).select('id');
    return ((this.assertOk(res, 'updateProveedor') as Array<{ id: number }>) || []).length > 0;
  }

  async ensureCategoria(empresaId: number, nombre: string): Promise<DbCategoria> {
    const clean = nombre.trim();
    const existingRes = await this.client
      .from('categorias')
      .select('*')
      .eq('empresa_id', empresaId)
      .ilike('nombre', clean)
      .limit(1);
    if (!existingRes.error && existingRes.data && existingRes.data.length > 0) {
      const row = existingRes.data[0] as DbCategoria;
      if (!row.activo) {
        await this.client.from('categorias').update({ activo: true, nombre: clean }).eq('id', row.id);
      }
      return { ...row, activo: true };
    }
    const res = await this.client
      .from('categorias')
      .insert({ empresa_id: empresaId, nombre: clean, activo: true })
      .select('*')
      .single();
    if (res.error) {
      return { id: Date.now(), empresa_id: empresaId, nombre: clean, activo: true };
    }
    return res.data as DbCategoria;
  }

  async renameCategoria(empresaId: number, oldNombre: string, newNombre: string): Promise<void> {
    const cleanNew = newNombre.trim();
    await this.client.from('categorias').update({ nombre: cleanNew }).eq('empresa_id', empresaId).eq('nombre', oldNombre);
    await this.client.from('productos').update({ categoria: cleanNew }).eq('empresa_id', empresaId).eq('categoria', oldNombre);
    await this.client.from('insumos').update({ categoria: cleanNew }).eq('empresa_id', empresaId).eq('categoria', oldNombre);
  }

  async deleteCategoria(empresaId: number, nombre: string): Promise<boolean> {
    const res = await this.client
      .from('categorias')
      .update({ activo: false })
      .eq('empresa_id', empresaId)
      .eq('nombre', nombre)
      .select('id');
    return ((res.data as Array<{ id: number }>) || []).length > 0;
  }

  async insertInsumo(input: Omit<DbInsumo, 'id'>): Promise<DbInsumo> {
    let res = await this.client.from('insumos').insert(input).select('*').single();
    if (res.error && res.error.message.includes('column')) {
      const { solicitable_por_bar, max_por_solicitud, ...rest } = input;
      res = await this.client.from('insumos').insert(rest).select('*').single();
      const inserted = this.assertOk(res, 'insertInsumo') as DbInsumo;
      if (solicitable_por_bar !== undefined || max_por_solicitud !== undefined) {
        this.fallbackInsumoLimits.set(inserted.id, { solicitable_por_bar, max_por_solicitud });
      }
      return {
        ...inserted,
        solicitable_por_bar: solicitable_por_bar ?? true,
        max_por_solicitud: max_por_solicitud ?? null,
      };
    }
    return this.assertOk(res, 'insertInsumo') as DbInsumo;
  }

  async updateInsumo(id: number, empresaId: number, patch: Partial<DbInsumo>): Promise<boolean> {
    let res = await this.client.from('insumos').update(patch).eq('id', id).eq('empresa_id', empresaId).select('id');
    if (res.error && res.error.message.includes('column')) {
      const { solicitable_por_bar, max_por_solicitud, ...rest } = patch;
      const prevOv = this.fallbackInsumoLimits.get(id) || {};
      this.fallbackInsumoLimits.set(id, {
        solicitable_por_bar: solicitable_por_bar !== undefined ? solicitable_por_bar : prevOv.solicitable_por_bar,
        max_por_solicitud: max_por_solicitud !== undefined ? max_por_solicitud : prevOv.max_por_solicitud,
      });
      if (Object.keys(rest).length === 0) return true;
      res = await this.client.from('insumos').update(rest).eq('id', id).eq('empresa_id', empresaId).select('id');
    }
    return ((this.assertOk(res, 'updateInsumo') as Array<{ id: number }>) || []).length > 0;
  }

  async findInsumoById(empresaId: number, id: number): Promise<DbInsumo | null> {
    const res = await this.client.from('insumos').select('*').eq('empresa_id', empresaId).eq('id', id).eq('activo', true).limit(1);
    const row = ((this.assertOk(res, 'findInsumoById') as DbInsumo[]) || [])[0] || null;
    if (!row) return null;
    const ov = this.fallbackInsumoLimits.get(row.id);
    return {
      ...row,
      solicitable_por_bar: ov?.solicitable_por_bar ?? row.solicitable_por_bar ?? true,
      max_por_solicitud: ov?.max_por_solicitud !== undefined ? ov.max_por_solicitud : row.max_por_solicitud ?? null,
    };
  }

  async saveInsumoControl(empresaId: number, config: Omit<DbInsumoControl, 'empresa_id'>): Promise<DbInsumoControl> {
    const full: DbInsumoControl = { empresa_id: empresaId, ...config };
    this.fallbackControl.set(empresaId, full);
    const res = await this.client
      .from('insumo_control_config')
      .upsert(full, { onConflict: 'empresa_id' })
      .select('*')
      .single();
    if (res.error) {
      return full;
    }
    return res.data as DbInsumoControl;
  }

  async insertSolicitudInsumo(input: Omit<DbSolicitudInsumo, 'id'>): Promise<DbSolicitudInsumo> {
    const res = await this.client.from('insumo_solicitudes').insert(input).select('*').single();
    return this.assertOk(res, 'insertSolicitudInsumo') as DbSolicitudInsumo;
  }

  async updateSolicitudInsumo(id: number, empresaId: number, patch: Partial<DbSolicitudInsumo>): Promise<boolean> {
    const res = await this.client
      .from('insumo_solicitudes')
      .update(patch)
      .eq('id', id)
      .eq('empresa_id', empresaId)
      .select('id');
    return ((this.assertOk(res, 'updateSolicitudInsumo') as Array<{ id: number }>) || []).length > 0;
  }

  async insertReceta(
    input: Omit<DbReceta, 'id'>,
    ingredientes: Array<Omit<DbRecetaIngrediente, 'id' | 'receta_id' | 'empresa_id'>>
  ): Promise<DbReceta> {
    const recRes = await this.client.from('recetas').insert(input).select('*').single();
    const rec = this.assertOk(recRes, 'insertReceta') as DbReceta;
    if (ingredientes.length > 0) {
      const rows = ingredientes.map((ing) => ({
        empresa_id: input.empresa_id,
        receta_id: rec.id,
        producto_id: ing.producto_id,
        cantidad_ml_o_unidad: ing.cantidad_ml_o_unidad,
        unidad_medida: ing.unidad_medida,
      }));
      this.assertOk(await this.client.from('receta_ingredientes').insert(rows), 'insertRecetaIngredientes');
    }
    return rec;
  }

  async findRecetaById(empresaId: number, id: number): Promise<DbReceta | null> {
    const res = await this.client.from('recetas').select('*').eq('empresa_id', empresaId).eq('id', id).eq('activo', true).limit(1);
    return ((this.assertOk(res, 'findRecetaById') as DbReceta[]) || [])[0] || null;
  }

  async getRecetaIngredientes(empresaId: number, recetaId: number): Promise<DbRecetaIngrediente[]> {
    const res = await this.client.from('receta_ingredientes').select('*').eq('empresa_id', empresaId).eq('receta_id', recetaId);
    return (this.assertOk(res, 'getRecetaIngredientes') || []) as DbRecetaIngrediente[];
  }

  async deactivateReceta(id: number, empresaId: number): Promise<boolean> {
    const res = await this.client.from('recetas').update({ activo: false }).eq('id', id).eq('empresa_id', empresaId).select('id');
    return ((this.assertOk(res, 'deactivateReceta') as Array<{ id: number }>) || []).length > 0;
  }

  async insertVaso(input: Omit<DbVaso, 'id'>): Promise<DbVaso> {
    const res = await this.client.from('vasos').insert(input).select('*').single();
    return this.assertOk(res, 'insertVaso') as DbVaso;
  }

  async updateVaso(id: number, empresaId: number, patch: Partial<DbVaso>): Promise<boolean> {
    const res = await this.client.from('vasos').update(patch).eq('id', id).eq('empresa_id', empresaId).select('id');
    return ((this.assertOk(res, 'updateVaso') as Array<{ id: number }>) || []).length > 0;
  }

  async findVasoById(empresaId: number, id: number): Promise<DbVaso | null> {
    const res = await this.client.from('vasos').select('*').eq('empresa_id', empresaId).eq('id', id).eq('activo', true).limit(1);
    return ((this.assertOk(res, 'findVasoById') as DbVaso[]) || [])[0] || null;
  }

  async insertVasoMovimiento(input: Omit<DbVasoMovimiento, 'id'>): Promise<DbVasoMovimiento> {
    const res = await this.client.from('vasos_movimientos').insert(input).select('*').single();
    return this.assertOk(res, 'insertVasoMovimiento') as DbVasoMovimiento;
  }

  async insertConsumoTurno(input: Omit<DbConsumoTurno, 'id'>): Promise<DbConsumoTurno> {
    const res = await this.client.from('consumos_turno').insert(input).select('*').single();
    return this.assertOk(res, 'insertConsumoTurno') as DbConsumoTurno;
  }
}

// ============================================================================
// LOCAL JSON FALLBACK
// ============================================================================
interface LocalStoreFile {
  nextId: number;
  categorias: DbCategoria[];
  productos: DbProducto[];
  lotes: DbLote[];
  movimientos: DbMovimiento[];
  solicitudes: DbSolicitud[];
  cierres: DbCierreTurno[];
  proveedores: DbProveedor[];
  insumos: DbInsumo[];
  insumoControl?: DbInsumoControl[];
  solicitudesInsumos: DbSolicitudInsumo[];
  recetas: DbReceta[];
  recetaIngredientes: DbRecetaIngrediente[];
  vasos: DbVaso[];
  vasosMovimientos: DbVasoMovimiento[];
  consumosTurno: DbConsumoTurno[];
}

export class LocalJsonRepository implements DataRepository {
  readonly mode = 'local-json' as const;
  private filePath: string;
  private state: LocalStoreFile;

  constructor(filePath = path.join(process.cwd(), 'barflow_local_data.json')) {
    this.filePath = filePath;
    if (fs.existsSync(this.filePath)) {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Partial<LocalStoreFile>;
      this.state = {
        nextId: parsed.nextId || 1,
        categorias: parsed.categorias || [],
        productos: parsed.productos || [],
        lotes: parsed.lotes || [],
        movimientos: parsed.movimientos || [],
        solicitudes: parsed.solicitudes || [],
        cierres: parsed.cierres || [],
        proveedores: parsed.proveedores || [],
        insumos: parsed.insumos || [],
        insumoControl: parsed.insumoControl || [],
        solicitudesInsumos: parsed.solicitudesInsumos || [],
        recetas: parsed.recetas || [],
        recetaIngredientes: parsed.recetaIngredientes || [],
        vasos: parsed.vasos || [],
        vasosMovimientos: parsed.vasosMovimientos || [],
        consumosTurno: parsed.consumosTurno || [],
      };
    } else {
      this.state = {
        nextId: 1,
        categorias: [],
        productos: [],
        lotes: [],
        movimientos: [],
        solicitudes: [],
        cierres: [],
        proveedores: [],
        insumos: [],
        insumoControl: [],
        solicitudesInsumos: [],
        recetas: [],
        recetaIngredientes: [],
        vasos: [],
        vasosMovimientos: [],
        consumosTurno: [],
      };
    }
  }

  private persist(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
  }

  private nextSeq(): number {
    const id = this.state.nextId;
    this.state.nextId += 1;
    return id;
  }

  async initAndSeed(empresaId: number, adminEmail: string, barEmail: string): Promise<void> {
    if (this.state.productos.some((p) => p.empresa_id === empresaId && p.activo)) return;

    const insertedIds: Record<string, number> = {};
    for (const item of INITIAL_SEED_PRODUCTS) {
      const prod = await this.insertProducto({
        empresa_id: empresaId,
        codigo: item.codigo,
        nombre: item.nombre,
        categoria: item.categoria,
        area: 'Bar',
        unidad: item.unidad,
        stock_inicial_sistema: item.bar + item.central,
        stock_minimo: item.min,
        costo_referencia: item.costo,
        tipo_envase: item.envase,
        contenido_envase: item.cont,
        unidad_contenido: item.ucont,
        porciones_corto: item.cortos,
        porciones_coctel: item.cocteles,
        activo: true,
      });
      insertedIds[item.codigo] = prod.id;

      if (item.central > 0) {
        const lC = await this.insertLote({
          empresa_id: empresaId,
          producto_id: prod.id,
          bodega_id: 1,
          cantidad_inicial: item.central,
          cantidad_disponible: item.central,
          costo_unitario: item.costo,
          fecha_vencimiento: item.venc,
          fecha_ingreso: nowISO(),
          referencia: 'Stock inicial manual sistema',
        });
        await this.insertMovimiento({
          empresa_id: empresaId,
          fecha: nowISO(),
          tipo: 'Stock Inicial',
          producto_id: prod.id,
          bodega_id: 1,
          lote_id: lC.id,
          cantidad: item.central,
          costo_unitario: item.costo,
          motivo: 'Stock inicial de comienzo del sistema (Central)',
          responsable: adminEmail,
        });
      }

      if (item.bar > 0) {
        const lB = await this.insertLote({
          empresa_id: empresaId,
          producto_id: prod.id,
          bodega_id: 3,
          cantidad_inicial: item.bar,
          cantidad_disponible: item.bar,
          costo_unitario: item.costo,
          fecha_vencimiento: item.venc,
          fecha_ingreso: nowISO(),
          referencia: 'Stock inicial manual sistema',
        });
        await this.insertMovimiento({
          empresa_id: empresaId,
          fecha: nowISO(),
          tipo: 'Stock Inicial',
          producto_id: prod.id,
          bodega_id: 3,
          lote_id: lB.id,
          cantidad: item.bar,
          costo_unitario: item.costo,
          motivo: 'Stock inicial de comienzo del sistema (Barra)',
          responsable: adminEmail,
        });
      }
    }

    await this.insertProveedor({
      empresa_id: empresaId,
      nombre: 'Distribuidora Licores del Sur SpA',
      contacto: 'Rodrigo Morales',
      telefono_wsp: '+56984123456',
      email: 'ventas@licoresdelsur.cl',
      categoria: 'Licores y Destilados',
      rut: '76.432.110-K',
      notas: 'Despacho martes y viernes antes de las 14:00',
      activo: true,
    });
    const p2 = await this.insertProveedor({
      empresa_id: empresaId,
      nombre: 'Embotelladora & Mixers Central',
      contacto: 'Camila Soto',
      telefono_wsp: '+56992345678',
      email: 'pedidos@mixerscentral.cl',
      categoria: 'Gaseosas, Jugos y Cervezas',
      rut: '77.129.880-3',
      notas: 'Pedido mínimo 10 bandejas',
      activo: true,
    });
    const p3 = await this.insertProveedor({
      empresa_id: empresaId,
      nombre: 'Insumos & Fruta Fresca Barra Ltda.',
      contacto: 'Marcelo Vega',
      telefono_wsp: '+56977554433',
      email: 'insumos@frutabarra.cl',
      categoria: 'Insumos de Barra',
      rut: '76.998.221-1',
      notas: 'Limón sutil, menta, hielo y descartables',
      activo: true,
    });

    for (const catNombre of DEFAULT_SEED_CATEGORIES) {
      await this.ensureCategoria(empresaId, catNombre);
    }

    await this.insertInsumo({
      empresa_id: empresaId,
      codigo: 'INS-001',
      nombre: 'LIMÓN SUTIL FRESCO (MALLA)',
      categoria: 'Verduras',
      criterio: 'Reposición bajo mínimo',
      unidad: 'kg',
      stock_actual: 8,
      stock_minimo: 5,
      costo_unitario: 1950,
      proveedor_id: p3.id,
      notas: 'Para Pisco Sour, Whisky Sour y garnish',
      activo: true,
    });
    await this.insertInsumo({
      empresa_id: empresaId,
      codigo: 'INS-002',
      nombre: 'HIELO EN CUBOS CRISTAL 5 KG',
      categoria: 'Insumos de Barra',
      criterio: 'Urgencia fin de semana',
      unidad: 'bolsa',
      stock_actual: 4,
      stock_minimo: 6,
      costo_unitario: 1800,
      proveedor_id: p3.id,
      notas: 'Stock crítico fin de semana',
      activo: true,
    });
    await this.insertInsumo({
      empresa_id: empresaId,
      codigo: 'INS-003',
      nombre: 'JARABE DE GOMA / SIMPLE SYRUP 1 LT',
      categoria: 'Licores',
      criterio: 'Reposición de turno',
      unidad: 'botella',
      stock_actual: 5,
      stock_minimo: 3,
      costo_unitario: 2900,
      proveedor_id: p2.id,
      notas: 'Base coctelería sour',
      activo: true,
    });
    await this.insertInsumo({
      empresa_id: empresaId,
      codigo: 'INS-004',
      nombre: 'SERVILLETA CÓCTEL NEGRA (PAQ 100)',
      categoria: 'Descartables',
      criterio: 'Reposición bajo mínimo',
      unidad: 'paquete',
      stock_actual: 12,
      stock_minimo: 6,
      costo_unitario: 1100,
      proveedor_id: p3.id,
      notas: 'Servicio de barra y salón',
      activo: true,
    });
    await this.insertInsumo({
      empresa_id: empresaId,
      codigo: 'INS-005',
      nombre: 'MENTA FRESCA (ATADO)',
      categoria: 'Verduras',
      criterio: 'Evento / Fin de semana',
      unidad: 'atado',
      stock_actual: 3,
      stock_minimo: 5,
      costo_unitario: 950,
      proveedor_id: p3.id,
      notas: 'Para Mojitos y garnish',
      activo: true,
    });
    await this.insertInsumo({
      empresa_id: empresaId,
      codigo: 'INS-006',
      nombre: 'PLATILLOS Y BANDEJAS DE SERVICIO',
      categoria: 'Vajilla',
      criterio: 'Reposición por quiebre',
      unidad: 'unidad',
      stock_actual: 18,
      stock_minimo: 12,
      costo_unitario: 3500,
      proveedor_id: p3.id,
      notas: 'Vajilla de apoyo para barra y salón',
      activo: true,
    });

    await this.insertReceta(
      {
        empresa_id: empresaId,
        codigo: 'COC-001',
        nombre: 'Pisco Sour Catedral',
        categoria: 'Cóctel Clásico',
        precio_venta: 6900,
        notas: '90 ml Pisco Mistral + 45 ml Limón natural',
        activo: true,
      },
      [
        { producto_id: insertedIds['BAR-002'], cantidad_ml_o_unidad: 90, unidad_medida: 'ml' },
        { producto_id: insertedIds['BAR-013'], cantidad_ml_o_unidad: 45, unidad_medida: 'ml' },
      ]
    );
    await this.insertReceta(
      {
        empresa_id: empresaId,
        codigo: 'COC-002',
        nombre: 'Ramazzotti Spritz',
        categoria: 'Spritz & Aperitivos',
        precio_venta: 7500,
        notas: '60 ml Ramazzotti + 90 ml Espumante Brut',
        activo: true,
      },
      [
        { producto_id: insertedIds['BAR-007'], cantidad_ml_o_unidad: 60, unidad_medida: 'ml' },
        { producto_id: insertedIds['BAR-010'], cantidad_ml_o_unidad: 90, unidad_medida: 'ml' },
      ]
    );
    await this.insertReceta(
      {
        empresa_id: empresaId,
        codigo: 'COC-003',
        nombre: 'Whisky Sour Clásico',
        categoria: 'Cóctel Clásico',
        precio_venta: 8200,
        notas: '60 ml Johnnie Walker Black + 30 ml Limón',
        activo: true,
      },
      [
        { producto_id: insertedIds['BAR-003'], cantidad_ml_o_unidad: 60, unidad_medida: 'ml' },
        { producto_id: insertedIds['BAR-013'], cantidad_ml_o_unidad: 30, unidad_medida: 'ml' },
      ]
    );

    await this.insertVaso({
      empresa_id: empresaId,
      codigo: 'VAS-001',
      nombre: 'Vaso Highball Largo',
      capacidad_ml: 350,
      stock_inicial: 60,
      stock_disponible: 56,
      stock_minimo: 36,
      roturas_acumuladas: 4,
      costo_reposicion: 2200,
      activo: true,
    });
    await this.insertVaso({
      empresa_id: empresaId,
      codigo: 'VAS-002',
      nombre: 'Copa Pisco Sour',
      capacidad_ml: 180,
      stock_inicial: 48,
      stock_disponible: 45,
      stock_minimo: 24,
      roturas_acumuladas: 3,
      costo_reposicion: 2900,
      activo: true,
    });
    await this.insertVaso({
      empresa_id: empresaId,
      codigo: 'VAS-003',
      nombre: 'Copa Balón Spritz / Gin',
      capacidad_ml: 580,
      stock_inicial: 36,
      stock_disponible: 32,
      stock_minimo: 24,
      roturas_acumuladas: 4,
      costo_reposicion: 3800,
      activo: true,
    });
    await this.insertVaso({
      empresa_id: empresaId,
      codigo: 'VAS-004',
      nombre: 'Vaso Old Fashioned Whisky',
      capacidad_ml: 300,
      stock_inicial: 40,
      stock_disponible: 40,
      stock_minimo: 24,
      roturas_acumuladas: 0,
      costo_reposicion: 2600,
      activo: true,
    });

    await this.insertSolicitud({
      empresa_id: empresaId,
      fecha: nowISO(),
      bodega_origen_id: 1,
      bodega_destino_id: 3,
      producto_id: insertedIds['BAR-010'],
      cantidad_solicitada: 6,
      cantidad_despachada: null,
      cantidad_entregada: null,
      tipo_solicitud: 'Libre / Evento',
      estado: 'Pendiente',
      solicitante: barEmail,
      observacion: 'Matrimonio Salón Terraza (120 pax)',
      fecha_despacho: null,
      fecha_recepcion: null,
    });

    await this.insertSolicitud({
      empresa_id: empresaId,
      fecha: nowISO(),
      bodega_origen_id: 1,
      bodega_destino_id: 3,
      producto_id: insertedIds['BAR-008'],
      cantidad_solicitada: 3,
      cantidad_despachada: 3,
      cantidad_entregada: null,
      tipo_solicitud: 'Sugerido Mínimo',
      estado: 'Despachada',
      solicitante: barEmail,
      observacion: 'Reposición urgente Gin Beefeater',
      fecha_despacho: nowISO(),
      fecha_recepcion: null,
    });

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await this.insertCierre({
      empresa_id: empresaId,
      fecha: yesterday,
      turno: 'PM',
      producto_id: insertedIds['BAR-001'],
      stock_inicio: 4,
      ingresos: 0,
      mermas: 0,
      stock_teorico_esperado: 4,
      consumo_calculado: 2,
      stock_cierre: 2,
      diferencia_comparativa: -2,
      responsable: barEmail,
      observacion: 'Cierre manual turno PM',
    });
  }

  async getSnapshot(empresaId: number): Promise<DataSnapshot> {
    return {
      categorias: this.state.categorias
        .filter((c) => c.empresa_id === empresaId && c.activo)
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
      productos: this.state.productos
        .filter((p) => p.empresa_id === empresaId && p.activo)
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
      lotes: sortLotsFEFO(
        this.state.lotes.filter(
          (l) => l.empresa_id === empresaId && [1, 3].includes(l.bodega_id) && l.cantidad_disponible > 0
        )
      ),
      movimientos: [...this.state.movimientos]
        .filter((m) => m.empresa_id === empresaId)
        .sort((a, b) => b.id - a.id)
        .slice(0, 350),
      solicitudes: [...this.state.solicitudes]
        .filter((s) => s.empresa_id === empresaId && s.bodega_destino_id === 3)
        .sort((a, b) => b.id - a.id)
        .slice(0, 200),
      cierres: [...this.state.cierres]
        .filter((c) => c.empresa_id === empresaId)
        .sort((a, b) => b.id - a.id)
        .slice(0, 150),
      proveedores: this.state.proveedores
        .filter((p) => p.empresa_id === empresaId && p.activo)
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
      insumos: this.state.insumos
        .filter((i) => i.empresa_id === empresaId && i.activo)
        .map((i) => ({
          ...i,
          solicitable_por_bar: i.solicitable_por_bar ?? true,
          max_por_solicitud: i.max_por_solicitud ?? null,
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
      insumoControl:
        (this.state.insumoControl || []).find((c) => c.empresa_id === empresaId) || {
          empresa_id: empresaId,
          ...DEFAULT_INSUMO_CONTROL,
        },
      solicitudesInsumos: [...this.state.solicitudesInsumos]
        .filter((si) => si.empresa_id === empresaId)
        .sort((a, b) => b.id - a.id)
        .slice(0, 150),
      recetas: this.state.recetas
        .filter((r) => r.empresa_id === empresaId && r.activo)
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
      recetaIngredientes: this.state.recetaIngredientes.filter((ri) => ri.empresa_id === empresaId),
      vasos: this.state.vasos
        .filter((v) => v.empresa_id === empresaId && v.activo)
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
      vasosMovimientos: [...this.state.vasosMovimientos]
        .filter((vm) => vm.empresa_id === empresaId)
        .sort((a, b) => b.id - a.id)
        .slice(0, 150),
      consumosTurno: [...this.state.consumosTurno]
        .filter((ct) => ct.empresa_id === empresaId)
        .sort((a, b) => b.id - a.id)
        .slice(0, 250),
    };
  }

  async insertProducto(input: Omit<DbProducto, 'id'>): Promise<DbProducto> {
    const row: DbProducto = { ...input, id: this.nextSeq() };
    this.state.productos.push(row);
    this.persist();
    return row;
  }

  async updateProducto(
    id: number,
    empresaId: number,
    patch: Partial<Omit<DbProducto, 'id' | 'empresa_id' | 'codigo'>>
  ): Promise<boolean> {
    const idx = this.state.productos.findIndex((p) => p.id === id && p.empresa_id === empresaId);
    if (idx === -1) return false;
    this.state.productos[idx] = { ...this.state.productos[idx], ...patch };
    this.persist();
    return true;
  }

  async deactivateAllProductos(empresaId: number): Promise<void> {
    for (const p of this.state.productos) {
      if (p.empresa_id === empresaId) p.activo = false;
    }
    this.persist();
  }

  async findProductoByCodigo(empresaId: number, codigo: string): Promise<DbProducto | null> {
    return this.state.productos.find((p) => p.empresa_id === empresaId && p.codigo === codigo && p.activo) || null;
  }

  async findProductoById(empresaId: number, id: number): Promise<DbProducto | null> {
    return this.state.productos.find((p) => p.empresa_id === empresaId && p.id === id && p.activo) || null;
  }

  async insertLote(input: Omit<DbLote, 'id'>): Promise<DbLote> {
    const row: DbLote = { ...input, id: this.nextSeq() };
    this.state.lotes.push(row);
    this.persist();
    return row;
  }

  async updateLoteDisponible(id: number, empresaId: number, newQty: number): Promise<void> {
    const lote = this.state.lotes.find((l) => l.id === id && l.empresa_id === empresaId);
    if (lote) {
      lote.cantidad_disponible = newQty;
      this.persist();
    }
  }

  async getActiveLotesForProductBodega(empresaId: number, productoId: number, bodegaId: number): Promise<DbLote[]> {
    return sortLotsFEFO(
      this.state.lotes.filter(
        (l) => l.empresa_id === empresaId && l.producto_id === productoId && l.bodega_id === bodegaId && l.cantidad_disponible > 0
      )
    );
  }

  async insertMovimiento(input: Omit<DbMovimiento, 'id'>): Promise<DbMovimiento> {
    const row: DbMovimiento = { ...input, id: this.nextSeq() };
    this.state.movimientos.push(row);
    this.persist();
    return row;
  }

  async getMovimientosForDispatchCost(empresaId: number, productoId: number, solicitudId: number): Promise<DbMovimiento[]> {
    return this.state.movimientos.filter(
      (m) =>
        m.empresa_id === empresaId &&
        m.producto_id === productoId &&
        m.bodega_id === 1 &&
        m.tipo === 'Traspaso Salida' &&
        (m.motivo || '').startsWith(`Despacho Solicitud #${solicitudId}`)
    );
  }

  async insertSolicitud(input: Omit<DbSolicitud, 'id'>): Promise<DbSolicitud> {
    const row: DbSolicitud = { ...input, id: this.nextSeq() };
    this.state.solicitudes.push(row);
    this.persist();
    return row;
  }

  async findSolicitudById(empresaId: number, id: number): Promise<DbSolicitud | null> {
    return this.state.solicitudes.find((s) => s.id === id && s.empresa_id === empresaId) || null;
  }

  async updateSolicitud(id: number, empresaId: number, patch: Partial<DbSolicitud>): Promise<void> {
    const idx = this.state.solicitudes.findIndex((s) => s.id === id && s.empresa_id === empresaId);
    if (idx !== -1) {
      this.state.solicitudes[idx] = { ...this.state.solicitudes[idx], ...patch };
      this.persist();
    }
  }

  async insertCierre(input: Omit<DbCierreTurno, 'id'>): Promise<DbCierreTurno> {
    const row: DbCierreTurno = { ...input, id: this.nextSeq() };
    this.state.cierres.push(row);
    this.persist();
    return row;
  }

  async insertProveedor(input: Omit<DbProveedor, 'id'>): Promise<DbProveedor> {
    const row: DbProveedor = { ...input, id: this.nextSeq() };
    this.state.proveedores.push(row);
    this.persist();
    return row;
  }

  async updateProveedor(id: number, empresaId: number, patch: Partial<DbProveedor>): Promise<boolean> {
    const idx = this.state.proveedores.findIndex((p) => p.id === id && p.empresa_id === empresaId);
    if (idx === -1) return false;
    this.state.proveedores[idx] = { ...this.state.proveedores[idx], ...patch };
    this.persist();
    return true;
  }

  async ensureCategoria(empresaId: number, nombre: string): Promise<DbCategoria> {
    const clean = nombre.trim();
    const existing = this.state.categorias.find(
      (c) => c.empresa_id === empresaId && c.nombre.toLowerCase() === clean.toLowerCase()
    );
    if (existing) {
      if (!existing.activo) {
        existing.activo = true;
        existing.nombre = clean;
        this.persist();
      }
      return existing;
    }
    const row: DbCategoria = { id: this.nextSeq(), empresa_id: empresaId, nombre: clean, activo: true };
    this.state.categorias.push(row);
    this.persist();
    return row;
  }

  async renameCategoria(empresaId: number, oldNombre: string, newNombre: string): Promise<void> {
    const cleanNew = newNombre.trim();
    for (const c of this.state.categorias) {
      if (c.empresa_id === empresaId && c.nombre === oldNombre) c.nombre = cleanNew;
    }
    for (const p of this.state.productos) {
      if (p.empresa_id === empresaId && p.categoria === oldNombre) p.categoria = cleanNew;
    }
    for (const ins of this.state.insumos) {
      if (ins.empresa_id === empresaId && ins.categoria === oldNombre) ins.categoria = cleanNew;
    }
    this.persist();
  }

  async deleteCategoria(empresaId: number, nombre: string): Promise<boolean> {
    const c = this.state.categorias.find((x) => x.empresa_id === empresaId && x.nombre === nombre && x.activo);
    if (!c) return false;
    c.activo = false;
    this.persist();
    return true;
  }

  async insertInsumo(input: Omit<DbInsumo, 'id'>): Promise<DbInsumo> {
    const row: DbInsumo = { ...input, id: this.nextSeq() };
    this.state.insumos.push(row);
    this.persist();
    return row;
  }

  async updateInsumo(id: number, empresaId: number, patch: Partial<DbInsumo>): Promise<boolean> {
    const idx = this.state.insumos.findIndex((i) => i.id === id && i.empresa_id === empresaId);
    if (idx === -1) return false;
    this.state.insumos[idx] = { ...this.state.insumos[idx], ...patch };
    this.persist();
    return true;
  }

  async findInsumoById(empresaId: number, id: number): Promise<DbInsumo | null> {
    const found = this.state.insumos.find((i) => i.id === id && i.empresa_id === empresaId && i.activo);
    if (!found) return null;
    return {
      ...found,
      solicitable_por_bar: found.solicitable_por_bar ?? true,
      max_por_solicitud: found.max_por_solicitud ?? null,
    };
  }

  async saveInsumoControl(empresaId: number, config: Omit<DbInsumoControl, 'empresa_id'>): Promise<DbInsumoControl> {
    if (!this.state.insumoControl) this.state.insumoControl = [];
    const idx = this.state.insumoControl.findIndex((c) => c.empresa_id === empresaId);
    const full: DbInsumoControl = { empresa_id: empresaId, ...config };
    if (idx === -1) {
      this.state.insumoControl.push(full);
    } else {
      this.state.insumoControl[idx] = full;
    }
    this.persist();
    return full;
  }

  async insertSolicitudInsumo(input: Omit<DbSolicitudInsumo, 'id'>): Promise<DbSolicitudInsumo> {
    const row: DbSolicitudInsumo = { ...input, id: this.nextSeq() };
    this.state.solicitudesInsumos.push(row);
    this.persist();
    return row;
  }

  async updateSolicitudInsumo(id: number, empresaId: number, patch: Partial<DbSolicitudInsumo>): Promise<boolean> {
    const idx = this.state.solicitudesInsumos.findIndex((s) => s.id === id && s.empresa_id === empresaId);
    if (idx === -1) return false;
    this.state.solicitudesInsumos[idx] = { ...this.state.solicitudesInsumos[idx], ...patch };
    this.persist();
    return true;
  }

  async insertReceta(
    input: Omit<DbReceta, 'id'>,
    ingredientes: Array<Omit<DbRecetaIngrediente, 'id' | 'receta_id' | 'empresa_id'>>
  ): Promise<DbReceta> {
    const rec: DbReceta = { ...input, id: this.nextSeq() };
    this.state.recetas.push(rec);
    for (const ing of ingredientes) {
      this.state.recetaIngredientes.push({
        id: this.nextSeq(),
        empresa_id: input.empresa_id,
        receta_id: rec.id,
        producto_id: ing.producto_id,
        cantidad_ml_o_unidad: ing.cantidad_ml_o_unidad,
        unidad_medida: ing.unidad_medida,
      });
    }
    this.persist();
    return rec;
  }

  async findRecetaById(empresaId: number, id: number): Promise<DbReceta | null> {
    return this.state.recetas.find((r) => r.id === id && r.empresa_id === empresaId && r.activo) || null;
  }

  async getRecetaIngredientes(empresaId: number, recetaId: number): Promise<DbRecetaIngrediente[]> {
    return this.state.recetaIngredientes.filter(
      (ri) => ri.empresa_id === empresaId && ri.receta_id === recetaId
    );
  }

  async deactivateReceta(id: number, empresaId: number): Promise<boolean> {
    const idx = this.state.recetas.findIndex((r) => r.id === id && r.empresa_id === empresaId);
    if (idx === -1) return false;
    this.state.recetas[idx].activo = false;
    this.persist();
    return true;
  }

  async insertVaso(input: Omit<DbVaso, 'id'>): Promise<DbVaso> {
    const row: DbVaso = { ...input, id: this.nextSeq() };
    this.state.vasos.push(row);
    this.persist();
    return row;
  }

  async updateVaso(id: number, empresaId: number, patch: Partial<DbVaso>): Promise<boolean> {
    const idx = this.state.vasos.findIndex((v) => v.id === id && v.empresa_id === empresaId);
    if (idx === -1) return false;
    this.state.vasos[idx] = { ...this.state.vasos[idx], ...patch };
    this.persist();
    return true;
  }

  async findVasoById(empresaId: number, id: number): Promise<DbVaso | null> {
    return this.state.vasos.find((v) => v.id === id && v.empresa_id === empresaId && v.activo) || null;
  }

  async insertVasoMovimiento(input: Omit<DbVasoMovimiento, 'id'>): Promise<DbVasoMovimiento> {
    const row: DbVasoMovimiento = { ...input, id: this.nextSeq() };
    this.state.vasosMovimientos.push(row);
    this.persist();
    return row;
  }

  async insertConsumoTurno(input: Omit<DbConsumoTurno, 'id'>): Promise<DbConsumoTurno> {
    const row: DbConsumoTurno = { ...input, id: this.nextSeq() };
    this.state.consumosTurno.push(row);
    this.persist();
    return row;
  }
}

export function createRepository(): DataRepository {
  const url = process.env.SUPABASE_URL?.trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)?.trim();

  if (url && key && url.startsWith('https://')) {
    return new SupabaseRepository(url, key);
  }
  return new LocalJsonRepository();
}
