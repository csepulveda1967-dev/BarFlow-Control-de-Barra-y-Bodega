export type UserRole = 'Gerencia' | 'Bar';

export type TurnoTipo = 'AM' | 'PM';

export const PRODUCT_CATEGORIES = [
  'Whisky',
  'Piscos',
  'Cervezas',
  'Otros Licores',
  'Gaseosas',
  'Jugos',
] as const;

export const DEFAULT_ALL_CATEGORIES = [
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
] as const;

export type ProductCategory = string;

export interface AuthSession {
  token: string;
  rol: UserRole;
  email: string;
  nombre: string;
}

export interface Producto {
  id: number;
  codigo: string;
  nombre: string;
  categoria: string;
  unidad: string;
  stock_inicial_sistema: number;
  stock_minimo: number;
  costo_referencia?: number;
  tipo_envase: string | null;
  contenido_envase: number | null;
  unidad_contenido: string | null;
  porciones_corto?: number | null;
  porciones_coctel?: number | null;
  bar: number;
  central: number;
  valor_bar?: number;
  valor_central?: number;
}

export interface Lote {
  id: number;
  producto_id: number;
  producto_nombre: string;
  producto_codigo: string;
  bodega_id: number;
  bodega_nombre: string;
  cantidad_inicial: number;
  cantidad_disponible: number;
  costo_unitario?: number;
  fecha_vencimiento: string | null;
  fecha_ingreso: string;
  referencia: string | null;
}

export interface Solicitud {
  id: number;
  fecha: string;
  producto_id: number;
  producto: string;
  codigo: string;
  unidad: string;
  cantidad_solicitada: number;
  cantidad_despachada: number | null;
  cantidad_entregada: number | null;
  tipo_solicitud: string;
  estado: 'Pendiente' | 'Despachada' | 'Recibida' | 'Rechazada';
  solicitante: string;
  observacion: string | null;
  fecha_despacho: string | null;
  fecha_recepcion: string | null;
  stock_central?: number;
  stock_bar?: number;
}

export interface Movimiento {
  id: number;
  fecha: string;
  tipo: string;
  producto_id: number;
  codigo: string;
  producto: string;
  bodega_id: number;
  bodega: string;
  cantidad: number;
  costo_unitario?: number;
  motivo: string | null;
  responsable: string;
}

export interface CierreTurno {
  id: number;
  fecha: string;
  turno: TurnoTipo;
  producto_id: number;
  codigo: string;
  producto: string;
  unidad: string;
  stock_inicio: number;
  ingresos: number;
  mermas: number;
  stock_teorico_esperado: number;
  consumo_calculado: number;
  stock_cierre: number;
  diferencia_comparativa: number;
  diferencia_valor?: number;
  responsable: string;
  observacion: string | null;
}

export interface Proveedor {
  id: number;
  nombre: string;
  contacto: string | null;
  telefono_wsp: string;
  email: string | null;
  categoria: string;
  rut: string | null;
  notas: string | null;
}

export interface Insumo {
  id: number;
  codigo: string;
  nombre: string;
  categoria: string;
  criterio: string | null;
  unidad: string;
  stock_actual: number;
  stock_minimo: number;
  costo_unitario?: number;
  proveedor_id: number | null;
  proveedor_nombre?: string | null;
  proveedor_wsp?: string | null;
  solicitable_por_bar: boolean;
  max_por_solicitud: number | null;
  notas: string | null;
}

export interface InsumoControlConfig {
  permitir_crear_items_bar: boolean;
  restringir_categorias_bar: boolean;
  categorias_permitidas_bar: string[];
  solo_bajo_minimo: boolean;
  bloquear_duplicados_pendientes: boolean;
  max_items_por_solicitud: number | null;
  permitir_criterio_personalizado_bar: boolean;
  criterios_permitidos_bar: string[];
}

export interface SolicitudInsumo {
  id: number;
  fecha: string;
  insumo_id: number | null;
  nombre_item: string;
  categoria: string;
  unidad: string;
  cantidad_solicitada: number;
  criterio: string;
  proveedor_id: number | null;
  proveedor_nombre?: string | null;
  proveedor_wsp?: string | null;
  estado: 'Pendiente' | 'Aprobada' | 'Comprada' | 'Rechazada';
  solicitante: string;
  observacion: string | null;
}

export interface RecetaIngrediente {
  id: number;
  receta_id: number;
  producto_id: number;
  producto_nombre: string;
  producto_codigo: string;
  producto_unidad: string;
  contenido_envase: number | null;
  unidad_contenido: string | null;
  porciones_corto?: number | null;
  porciones_coctel?: number | null;
  cantidad_ml_o_unidad: number;
  unidad_medida: string;
  costo_ingrediente?: number;
  stock_bar_actual: number;
}

export interface Receta {
  id: number;
  codigo: string;
  nombre: string;
  categoria: string;
  precio_venta?: number;
  costo_total?: number;
  margen_bruto?: number;
  margen_pct?: number;
  notas: string | null;
  ingredientes: RecetaIngrediente[];
}

export interface Vaso {
  id: number;
  codigo: string;
  nombre: string;
  capacidad_ml: number;
  stock_inicial: number;
  stock_disponible: number;
  stock_minimo: number;
  roturas_acumuladas: number;
  costo_reposicion?: number;
}

export interface VasoMovimiento {
  id: number;
  vaso_id: number;
  vaso_nombre: string;
  fecha: string;
  turno: TurnoTipo;
  tipo: string;
  cantidad: number;
  motivo: string | null;
  responsable: string;
}

export interface ConsumoTurnoReceta {
  id: number;
  fecha: string;
  turno: TurnoTipo;
  tipo: 'Cóctel Compuesto' | 'Corto / Botella';
  receta_id: number | null;
  producto_id: number | null;
  nombre: string;
  cantidad_porciones: number;
  detalle_descuento: string;
  costo_total?: number;
  responsable: string;
  observacion: string | null;
}

export interface EstadoApp {
  rol: UserRole;
  email: string;
  categorias: string[];
  productos: Producto[];
  solicitudes: Solicitud[];
  movimientos: Movimiento[];
  cierres: CierreTurno[];
  lotes: Lote[];
  proveedores: Proveedor[];
  insumos: Insumo[];
  insumoControl: InsumoControlConfig;
  solicitudesInsumos: SolicitudInsumo[];
  recetas: Receta[];
  consumosTurno: ConsumoTurnoReceta[];
  vasos: Vaso[];
  vasosMovimientos: VasoMovimiento[];
  kpis: {
    totalProductos: number;
    alertasMinimo: number;
    sinStock: number;
    solicitudesPendientes: number;
    porRecibirBar: number;
    insumosBajoMinimo: number;
    vasosDisponibles: number;
    vasosRoturas: number;
    valorBar?: number;
    valorCentral?: number;
  };
}
