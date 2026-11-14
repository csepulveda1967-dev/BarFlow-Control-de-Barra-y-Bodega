import ExcelJS from 'exceljs';
import { DEFAULT_SEED_CATEGORIES } from '../db/shared';
import type { EstadoApp } from '../types';

const VALID_UNITS = ['unidad', 'botella', 'lata', 'ml', 'L', 'barril', 'caja'];

export async function buildPlantillaProductosBuffer(
  snapshotCategorias: Array<{ nombre: string }>
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BarFlow Plantilla Comercial';
  const ws = wb.addWorksheet('Productos_Barra', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { key: 'codigo', header: 'Codigo', width: 14 },
    { key: 'nombre', header: 'Nombre', width: 38 },
    { key: 'categoria', header: 'Categoria', width: 18 },
    { key: 'unidad', header: 'Unidad', width: 12 },
    { key: 'stock_central', header: 'Stock_Inicial_Central', width: 22 },
    { key: 'stock_barra', header: 'Stock_Inicial_Barra', width: 20 },
    { key: 'stock_minimo', header: 'Stock_Minimo_Barra', width: 20 },
    { key: 'costo', header: 'Costo_Unitario', width: 16 },
    { key: 'tipo_envase', header: 'Tipo_Envase', width: 14 },
    { key: 'contenido', header: 'Contenido_Envase', width: 18 },
    { key: 'unidad_cont', header: 'Unidad_Contenido', width: 18 },
  ];

  const ejemplos = [
    { codigo: 'WHI-001', nombre: 'WHISKY CHIVAS REGAL 12 ANOS 750 ML', categoria: 'Whisky', unidad: 'botella', stock_central: 12, stock_barra: 3, stock_minimo: 4, costo: 24500, tipo_envase: 'botella', contenido: 750, unidad_cont: 'ml' },
    { codigo: 'PIS-001', nombre: 'PISCO MISTRAL NOBEL 40° 750 ML', categoria: 'Piscos', unidad: 'botella', stock_central: 18, stock_barra: 4, stock_minimo: 5, costo: 11200, tipo_envase: 'botella', contenido: 750, unidad_cont: 'ml' },
    { codigo: 'CER-001', nombre: 'CERVEZA HEINEKEN BOTELLA 330 ML', categoria: 'Cervezas', unidad: 'unidad', stock_central: 120, stock_barra: 36, stock_minimo: 48, costo: 1150, tipo_envase: 'botella', contenido: 330, unidad_cont: 'ml' },
    { codigo: 'OTR-001', nombre: 'RAMAZZOTTI APERITIVO ROSATO 700 ML', categoria: 'Otros Licores', unidad: 'botella', stock_central: 10, stock_barra: 4, stock_minimo: 4, costo: 12400, tipo_envase: 'botella', contenido: 700, unidad_cont: 'ml' },
    { codigo: 'GAS-001', nombre: 'SPRITE LATA 350 ML', categoria: 'Gaseosas', unidad: 'lata', stock_central: 96, stock_barra: 36, stock_minimo: 36, costo: 650, tipo_envase: 'lata', contenido: 350, unidad_cont: 'ml' },
    { codigo: 'JUG-001', nombre: 'JUGO DE MARACUYA PULPA 1 LT', categoria: 'Jugos', unidad: 'botella', stock_central: 12, stock_barra: 4, stock_minimo: 5, costo: 3200, tipo_envase: 'botella', contenido: 1000, unidad_cont: 'ml' },
  ];
  for (const row of ejemplos) ws.addRow(row);

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };

  const allCats = Array.from(new Set([...DEFAULT_SEED_CATEGORIES, ...snapshotCategorias.map((c) => c.nombre)]));
  const guide = wb.addWorksheet('Categorias_Validas');
  guide.columns = [
    { key: 'cat', header: 'Categorias Sugeridas (o personalizada)', width: 34 },
    { key: 'uni', header: 'Unidades Permitidas', width: 22 },
  ];
  for (let i = 0; i < Math.max(allCats.length, VALID_UNITS.length); i++) {
    guide.addRow({
      cat: allCats[i] || '',
      uni: VALID_UNITS[i] || '',
    });
  }

  return wb.xlsx.writeBuffer();
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.includes(',') ? base64.split(',').pop() || '' : base64;
  const binaryString = atob(clean);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function parseXlsxRowsFromBase64(content: string): Promise<Array<Record<string, unknown>>> {
  const bytes = base64ToUint8Array(content);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) {
    throw new Error('El archivo Excel no tiene hojas válidas');
  }
  const headers: string[] = [];
  ws.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber] = String(cell.value || '').trim().toLowerCase().replace(/\s+/g, '_');
  });
  const rawItems: Array<Record<string, unknown>> = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const rec: Record<string, unknown> = {};
    let hasData = false;
    row.eachCell((cell, colNumber) => {
      const h = headers[colNumber];
      if (!h) return;
      const v = cell.value && typeof cell.value === 'object' && 'result' in cell.value ? cell.value.result : cell.value;
      if (v != null && String(v).trim() !== '') hasData = true;
      rec[h] = v;
    });
    if (hasData) rawItems.push(rec);
  });
  return rawItems;
}

export async function buildReporteGerencialBuffer(estado: Omit<EstadoApp, 'rol' | 'email'>): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BarFlow Gerencia';

  const styleHeader = (sheet: ExcelJS.Worksheet, cols: number) => {
    const row = sheet.getRow(1);
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(2, sheet.rowCount), column: cols },
    };
  };

  const s1 = wb.addWorksheet('Stock_Valorizado', { views: [{ state: 'frozen', ySplit: 1 }] });
  s1.columns = [
    { key: 'codigo', header: 'Código', width: 14 },
    { key: 'nombre', header: 'Producto', width: 36 },
    { key: 'categoria', header: 'Categoría', width: 18 },
    { key: 'unidad', header: 'Unidad', width: 12 },
    { key: 'stock_ini', header: 'Stock Inicial Sist.', width: 17 },
    { key: 'bar', header: 'Stock Barra', width: 14 },
    { key: 'central', header: 'Stock Central', width: 15 },
    { key: 'minimo', header: 'Mínimo Barra', width: 14 },
    { key: 'costo', header: 'Costo Ref. ($)', width: 15 },
    { key: 'valor_bar', header: 'Valor Barra ($)', width: 17 },
    { key: 'valor_central', header: 'Valor Central ($)', width: 18 },
    { key: 'estado', header: 'Estado Barra', width: 16 },
  ];
  for (const p of estado.productos) {
    s1.addRow({
      codigo: p.codigo,
      nombre: p.nombre,
      categoria: p.categoria,
      unidad: p.unidad,
      stock_ini: p.stock_inicial_sistema,
      bar: p.bar,
      central: p.central,
      minimo: p.stock_minimo,
      costo: p.costo_referencia || 0,
      valor_bar: p.valor_bar || 0,
      valor_central: p.valor_central || 0,
      estado: p.bar <= 0 ? 'SIN STOCK' : p.bar < p.stock_minimo ? 'BAJO MÍNIMO' : 'OK',
    });
  }
  styleHeader(s1, 12);

  const s2 = wb.addWorksheet('Comparativa_Cierres_AM_PM', { views: [{ state: 'frozen', ySplit: 1 }] });
  s2.columns = [
    { key: 'fecha', header: 'Fecha', width: 14 },
    { key: 'turno', header: 'Turno', width: 10 },
    { key: 'codigo', header: 'Código', width: 13 },
    { key: 'producto', header: 'Producto', width: 34 },
    { key: 'inicio', header: 'Stock Inicio', width: 14 },
    { key: 'ingresos', header: 'Ingresos', width: 12 },
    { key: 'mermas', header: 'Mermas', width: 12 },
    { key: 'teorico', header: 'Teórico Esperado', width: 17 },
    { key: 'cierre', header: 'Cierre Manual', width: 15 },
    { key: 'diferencia', header: 'Dif. Comparativa', width: 17 },
    { key: 'dif_valor', header: 'Impacto ($)', width: 15 },
    { key: 'responsable', header: 'Responsable', width: 26 },
  ];
  for (const c of estado.cierres) {
    s2.addRow({
      fecha: c.fecha,
      turno: c.turno,
      codigo: c.codigo,
      producto: c.producto,
      inicio: c.stock_inicio,
      ingresos: c.ingresos,
      mermas: c.mermas,
      teorico: c.stock_teorico_esperado,
      cierre: c.stock_cierre,
      diferencia: c.diferencia_comparativa,
      dif_valor: c.diferencia_valor || 0,
      responsable: c.responsable,
    });
  }
  styleHeader(s2, 12);

  const s3 = wb.addWorksheet('Costeo_Cocteles', { views: [{ state: 'frozen', ySplit: 1 }] });
  s3.columns = [
    { key: 'codigo', header: 'Código', width: 12 },
    { key: 'nombre', header: 'Cóctel / Trago', width: 30 },
    { key: 'categoria', header: 'Categoría', width: 20 },
    { key: 'ingredientes', header: 'Composición', width: 45 },
    { key: 'costo', header: 'Costo Receta ($)', width: 16 },
    { key: 'precio', header: 'Precio Venta ($)', width: 16 },
    { key: 'margen', header: 'Margen Bruto ($)', width: 16 },
    { key: 'pct', header: 'Margen (%)', width: 14 },
  ];
  for (const r of estado.recetas) {
    s3.addRow({
      codigo: r.codigo,
      nombre: r.nombre,
      categoria: r.categoria,
      ingredientes: r.ingredientes.map((i) => `${i.cantidad_ml_o_unidad}${i.unidad_medida} ${i.producto_nombre}`).join(' + '),
      costo: r.costo_total || 0,
      precio: r.precio_venta || 0,
      margen: r.margen_bruto || 0,
      pct: r.margen_pct || 0,
    });
  }
  styleHeader(s3, 8);

  const s4 = wb.addWorksheet('Insumos_y_Proveedores', { views: [{ state: 'frozen', ySplit: 1 }] });
  s4.columns = [
    { key: 'codigo', header: 'Código', width: 12 },
    { key: 'nombre', header: 'Insumo', width: 34 },
    { key: 'unidad', header: 'Unidad', width: 12 },
    { key: 'stock', header: 'Stock Actual', width: 14 },
    { key: 'minimo', header: 'Stock Mínimo', width: 14 },
    { key: 'costo', header: 'Costo Unit. ($)', width: 15 },
    { key: 'proveedor', header: 'Proveedor Asignado', width: 30 },
    { key: 'wsp', header: 'WhatsApp', width: 18 },
  ];
  for (const i of estado.insumos) {
    s4.addRow({
      codigo: i.codigo,
      nombre: i.nombre,
      unidad: i.unidad,
      stock: i.stock_actual,
      minimo: i.stock_minimo,
      costo: i.costo_unitario || 0,
      proveedor: i.proveedor_nombre || 'Sin asignar',
      wsp: i.proveedor_wsp || '',
    });
  }
  styleHeader(s4, 8);

  const s5 = wb.addWorksheet('Maestro_Vasos', { views: [{ state: 'frozen', ySplit: 1 }] });
  s5.columns = [
    { key: 'codigo', header: 'Código', width: 12 },
    { key: 'nombre', header: 'Tipo de Vaso / Copa', width: 30 },
    { key: 'cap', header: 'Capacidad (ml)', width: 15 },
    { key: 'inicial', header: 'Stock Inicial', width: 14 },
    { key: 'disponible', header: 'Disponible', width: 14 },
    { key: 'roturas', header: 'Roturas Acum.', width: 15 },
    { key: 'minimo', header: 'Mínimo', width: 12 },
    { key: 'costo', header: 'Costo Reposición ($)', width: 18 },
  ];
  for (const v of estado.vasos) {
    s5.addRow({
      codigo: v.codigo,
      nombre: v.nombre,
      cap: v.capacidad_ml,
      inicial: v.stock_inicial,
      disponible: v.stock_disponible,
      roturas: v.roturas_acumuladas,
      minimo: v.stock_minimo,
      costo: v.costo_reposicion || 0,
    });
  }
  styleHeader(s5, 8);

  const s6 = wb.addWorksheet('Auditoria_Movimientos', { views: [{ state: 'frozen', ySplit: 1 }] });
  s6.columns = [
    { key: 'fecha', header: 'Fecha / Hora', width: 21 },
    { key: 'tipo', header: 'Tipo Evento', width: 18 },
    { key: 'codigo', header: 'Código', width: 13 },
    { key: 'producto', header: 'Producto', width: 34 },
    { key: 'bodega', header: 'Bodega', width: 18 },
    { key: 'cantidad', header: 'Cantidad', width: 12 },
    { key: 'costo', header: 'Costo Unit. ($)', width: 15 },
    { key: 'motivo', header: 'Detalle / Auditoría', width: 38 },
    { key: 'responsable', header: 'Responsable', width: 28 },
  ];
  for (const m of estado.movimientos) {
    s6.addRow({
      fecha: m.fecha,
      tipo: m.tipo,
      codigo: m.codigo,
      producto: m.producto,
      bodega: m.bodega,
      cantidad: m.cantidad,
      costo: m.costo_unitario || 0,
      motivo: m.motivo || '',
      responsable: m.responsable,
    });
  }
  styleHeader(s6, 9);

  return wb.xlsx.writeBuffer();
}
