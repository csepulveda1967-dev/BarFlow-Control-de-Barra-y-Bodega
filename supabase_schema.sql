-- ============================================================================
-- BarFlow — Esquema PostgreSQL completo para Supabase
-- Barra Principal + Bodega Central + Proveedores + Insumos + Cócteles + Vasos
-- ============================================================================

CREATE TABLE IF NOT EXISTS empresas (
  id BIGINT PRIMARY KEY,
  nombre TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bodegas (
  id BIGINT PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES empresas(id),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS proveedores (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id),
  nombre TEXT NOT NULL,
  contacto TEXT,
  telefono_wsp TEXT NOT NULL,
  email TEXT,
  categoria TEXT NOT NULL DEFAULT 'Licores',
  rut TEXT,
  notas TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS productos (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id),
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'Otros Licores',
  area TEXT NOT NULL DEFAULT 'Bar',
  unidad TEXT NOT NULL DEFAULT 'botella',
  stock_inicial_sistema DOUBLE PRECISION NOT NULL DEFAULT 0,
  stock_minimo DOUBLE PRECISION NOT NULL DEFAULT 0,
  costo_referencia DOUBLE PRECISION NOT NULL DEFAULT 0,
  tipo_envase TEXT,
  contenido_envase DOUBLE PRECISION,
  unidad_contenido TEXT,
  porciones_corto DOUBLE PRECISION,
  porciones_coctel DOUBLE PRECISION,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lotes (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id),
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  bodega_id BIGINT NOT NULL REFERENCES bodegas(id),
  cantidad_inicial DOUBLE PRECISION NOT NULL,
  cantidad_disponible DOUBLE PRECISION NOT NULL,
  costo_unitario DOUBLE PRECISION NOT NULL DEFAULT 0,
  fecha_vencimiento DATE,
  fecha_ingreso TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  referencia TEXT
);

CREATE TABLE IF NOT EXISTS movimientos (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tipo TEXT NOT NULL,
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  bodega_id BIGINT NOT NULL REFERENCES bodegas(id),
  lote_id BIGINT REFERENCES lotes(id) ON DELETE SET NULL,
  cantidad DOUBLE PRECISION NOT NULL,
  costo_unitario DOUBLE PRECISION NOT NULL DEFAULT 0,
  motivo TEXT,
  responsable TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS solicitudes (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bodega_origen_id BIGINT NOT NULL DEFAULT 1 REFERENCES bodegas(id),
  bodega_destino_id BIGINT NOT NULL DEFAULT 3 REFERENCES bodegas(id),
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  cantidad_solicitada DOUBLE PRECISION NOT NULL,
  cantidad_despachada DOUBLE PRECISION,
  cantidad_entregada DOUBLE PRECISION,
  tipo_solicitud TEXT NOT NULL DEFAULT 'Reposición',
  estado TEXT NOT NULL DEFAULT 'Pendiente',
  solicitante TEXT NOT NULL,
  observacion TEXT,
  fecha_despacho TIMESTAMPTZ,
  fecha_recepcion TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cierres_turno (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id),
  fecha DATE NOT NULL,
  turno TEXT NOT NULL DEFAULT 'AM',
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  stock_inicio DOUBLE PRECISION NOT NULL,
  ingresos DOUBLE PRECISION NOT NULL DEFAULT 0,
  mermas DOUBLE PRECISION NOT NULL DEFAULT 0,
  stock_teorico_esperado DOUBLE PRECISION NOT NULL DEFAULT 0,
  consumo_calculado DOUBLE PRECISION NOT NULL DEFAULT 0,
  stock_cierre DOUBLE PRECISION NOT NULL,
  diferencia_comparativa DOUBLE PRECISION NOT NULL DEFAULT 0,
  responsable TEXT NOT NULL,
  observacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS insumos (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id),
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  unidad TEXT NOT NULL DEFAULT 'kg',
  stock_actual DOUBLE PRECISION NOT NULL DEFAULT 0,
  stock_minimo DOUBLE PRECISION NOT NULL DEFAULT 0,
  costo_unitario DOUBLE PRECISION NOT NULL DEFAULT 0,
  proveedor_id BIGINT REFERENCES proveedores(id) ON DELETE SET NULL,
  notas TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recetas (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id),
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'Cóctel Clásico',
  precio_venta DOUBLE PRECISION NOT NULL DEFAULT 0,
  notas TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receta_ingredientes (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id),
  receta_id BIGINT NOT NULL REFERENCES recetas(id) ON DELETE CASCADE,
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  cantidad_ml_o_unidad DOUBLE PRECISION NOT NULL,
  unidad_medida TEXT NOT NULL DEFAULT 'ml'
);

CREATE TABLE IF NOT EXISTS vasos (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id),
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  capacidad_ml DOUBLE PRECISION NOT NULL DEFAULT 350,
  stock_inicial DOUBLE PRECISION NOT NULL DEFAULT 0,
  stock_disponible DOUBLE PRECISION NOT NULL DEFAULT 0,
  stock_minimo DOUBLE PRECISION NOT NULL DEFAULT 12,
  roturas_acumuladas DOUBLE PRECISION NOT NULL DEFAULT 0,
  costo_reposicion DOUBLE PRECISION NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vasos_movimientos (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id),
  vaso_id BIGINT NOT NULL REFERENCES vasos(id) ON DELETE CASCADE,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  turno TEXT NOT NULL DEFAULT 'AM',
  tipo TEXT NOT NULL,
  cantidad DOUBLE PRECISION NOT NULL,
  motivo TEXT,
  responsable TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS consumos_turno (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id),
  fecha DATE NOT NULL,
  turno TEXT NOT NULL DEFAULT 'PM',
  tipo TEXT NOT NULL DEFAULT 'Cóctel Compuesto',
  receta_id BIGINT REFERENCES recetas(id) ON DELETE SET NULL,
  producto_id BIGINT REFERENCES productos(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  cantidad_porciones DOUBLE PRECISION NOT NULL,
  detalle_descuento TEXT NOT NULL,
  costo_total DOUBLE PRECISION NOT NULL DEFAULT 0,
  responsable TEXT NOT NULL,
  observacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_productos_empresa ON productos (empresa_id, activo, categoria);
CREATE INDEX IF NOT EXISTS idx_lotes_fefo ON lotes (empresa_id, producto_id, bodega_id, cantidad_disponible, fecha_vencimiento, fecha_ingreso);
CREATE INDEX IF NOT EXISTS idx_movimientos_empresa ON movimientos (empresa_id, bodega_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_solicitudes_empresa ON solicitudes (empresa_id, estado, id DESC);
CREATE INDEX IF NOT EXISTS idx_cierres_empresa ON cierres_turno (empresa_id, fecha DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_insumos_empresa ON insumos (empresa_id, activo);
CREATE INDEX IF NOT EXISTS idx_recetas_empresa ON recetas (empresa_id, activo);
CREATE INDEX IF NOT EXISTS idx_vasos_empresa ON vasos (empresa_id, activo);
CREATE INDEX IF NOT EXISTS idx_consumos_turno_empresa ON consumos_turno (empresa_id, fecha DESC, turno, id DESC);

-- Seguridad RLS (backend Express usa SUPABASE_SERVICE_ROLE_KEY)
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE bodegas ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitudes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cierres_turno ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE recetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE receta_ingredientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vasos ENABLE ROW LEVEL SECURITY;
ALTER TABLE vasos_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumos_turno ENABLE ROW LEVEL SECURITY;

-- Datos base
INSERT INTO empresas (id, nombre)
VALUES (1, 'Centro de Eventos & Barra Principal')
ON CONFLICT (id) DO NOTHING;

INSERT INTO bodegas (id, empresa_id, nombre, tipo)
VALUES
  (1, 1, 'Bodega Central', 'Central'),
  (3, 1, 'Barra Principal', 'Barra')
ON CONFLICT (id) DO NOTHING;
