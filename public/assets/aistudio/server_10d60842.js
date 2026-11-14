import ExcelJS from 'exceljs';
import 'dotenv/config';
import express from 'express';
import {createClient} from '@libsql/client';
import jwt from 'jsonwebtoken';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const app=express();app.disable('x-powered-by');app.use(express.json({limit:'30kb'}));
const required=['TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','JWT_SECRET','ADMIN_EMAIL','ADMIN_PASSWORD','BAR_EMAIL','BAR_PASSWORD'];
for(const k of required)if(!process.env[k]||process.env[k].startsWith('REEMPLAZAR')||process.env[k].startsWith('PEGAR_'))throw Error('Configura '+k+' en .env');
if(process.env.JWT_SECRET.length<32)throw Error('JWT_SECRET requiere 32+ caracteres');
if(!process.env.TURSO_DATABASE_URL.includes('pruebas-migracion-productos'))throw Error('Por seguridad, este piloto solo admite la rama de pruebas');
const empresa=Number(process.env.EMPRESA_ID||1);if(!Number.isInteger(empresa)||empresa<1)throw Error('EMPRESA_ID invalido');
const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
// Migración aditiva: conserva productos, lotes y movimientos existentes.
async function asegurarEnvases(){
 const info=await db.execute('PRAGMA table_info(productos)');
 const cols=new Set(info.rows.map(r=>String(r.name)));
 for(const [col,definition] of [
  ['tipo_envase',"TEXT"],
  ['contenido_envase',"REAL"],
  ['unidad_contenido',"TEXT"]
 ])if(!cols.has(col))await db.execute(`ALTER TABLE productos ADD COLUMN ${col} ${definition}`);
}
const root=path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(root,'public'),{index:'index.html'}));
const wrap=fn=>(req,res)=>Promise.resolve(fn(req,res)).catch(e=>{console.error(e);res.status(500).json({error:'No se pudo completar la operación'});});
function auth(req,res,next){try{const raw=String(req.headers.authorization||'').replace(/^Bearer /,'');req.user=jwt.verify(raw,process.env.JWT_SECRET,{algorithms:['HS256']});if(req.user.empresa!==empresa)throw Error('empresa');next()}catch{res.status(401).json({error:'Inicia sesión nuevamente'})}}
function admin(req,res,next){if(req.user.rol!=='Gerencia')return res.status(403).json({error:'Solo Gerencia'});next()}
function npos(v){const n=Number(v);return Number.isFinite(n)&&n>0?n:null}
function unit(v){return ['kg','g','L','ml','unidad','botella','barril'].includes(v)}
const stockSQL=`SELECT p.id,p.codigo,p.nombre,p.categoria,p.area,p.unidad,p.stock_minimo,p.costo_referencia,p.tipo_envase,p.contenido_envase,p.unidad_contenido,COALESCE(SUM(CASE WHEN l.bodega_id=2 THEN l.cantidad_disponible ELSE 0 END),0) AS cocina,COALESCE(SUM(CASE WHEN l.bodega_id=3 THEN l.cantidad_disponible ELSE 0 END),0) AS bar FROM productos p LEFT JOIN lotes l ON l.producto_id=p.id AND l.empresa_id=p.empresa_id WHERE p.empresa_id=? AND p.activo=1 GROUP BY p.id ORDER BY p.nombre`;
app.post('/api/login',wrap(async(req,res)=>{const email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');let rol;if(email===process.env.ADMIN_EMAIL.toLowerCase()&&password===process.env.ADMIN_PASSWORD)rol='Gerencia';else if(email===process.env.BAR_EMAIL.toLowerCase()&&password===process.env.BAR_PASSWORD)rol='Bar';else return res.status(401).json({error:'Credenciales incorrectas'});res.json({token:jwt.sign({email,rol,empresa},process.env.JWT_SECRET,{algorithm:'HS256',expiresIn:'8h'}),rol})}));
app.get('/api/estado',auth,wrap(async(req,res)=>{const [p,s,m]=await Promise.all([db.execute({sql:stockSQL,args:[empresa]}),db.execute({sql:`SELECT s.id,s.fecha,s.cantidad_solicitada,s.cantidad_entregada,s.estado,s.observacion,p.nombre AS producto,p.unidad FROM solicitudes s JOIN productos p ON p.id=s.producto_id AND p.empresa_id=s.empresa_id WHERE s.empresa_id=? AND s.bodega_destino_id=3 ORDER BY s.id DESC LIMIT 100`,args:[empresa]}),db.execute({sql:`SELECT m.id,m.fecha,m.tipo,m.cantidad,m.motivo,p.nombre AS producto FROM movimientos m JOIN productos p ON p.id=m.producto_id AND p.empresa_id=m.empresa_id WHERE m.empresa_id=? AND m.bodega_id=3 ORDER BY m.id DESC LIMIT 100`,args:[empresa]})]);res.json({productos:p.rows,solicitudes:s.rows,movimientos:m.rows,rol:req.user.rol})}));
function areaReporte(v){return ['General','Bar','Cocina'].includes(v)?v:null}
async function enviarExcel(res,nombre,hoja,columnas,filas){
 const wb=new ExcelJS.Workbook();wb.creator='Inventario piloto';const sh=wb.addWorksheet(hoja,{views:[{state:'frozen',ySplit:1}]});sh.columns=columnas;
 filas.forEach(f=>sh.addRow(f));sh.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sh.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF173450'}};
 sh.autoFilter={from:{row:1,column:1},to:{row:Math.max(2,sh.rowCount),column:columnas.length}};
 res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition',`attachment; filename="${nombre}"`);res.end(Buffer.from(await wb.xlsx.writeBuffer()));
}
app.get('/api/exportar/inventario.xlsx',auth,admin,wrap(async(req,res)=>{
 const area=areaReporte(String(req.query.area||'General'));if(!area)return res.status(400).json({error:'Área inválida'});
 const r=await db.execute({sql:stockSQL,args:[empresa]});
 const prods=r.rows.filter(p=>area==='General'||p.area===area||p.area==='Ambos');
 const columnas=[['codigo','Código',17],['nombre','Producto',30],['area','Área producto',17],['unidad','Unidad',14],['tipo_envase','Envase',15],['contenido_envase','Contenido',15],['unidad_contenido','Unidad contenido',17],['cocina','Stock Cocina',17],['bar','Stock Bar',17],['total','Stock total',17],['stock_minimo','Mínimo',13],['costo_referencia','Costo ref.',16],['valor','Valor referencial',21]].map(([key,header,width])=>({key,header,width}));
 const filas=prods.map(p=>{const bar=Number(p.bar)||0,cocina=Number(p.cocina)||0,costo=Number(p.costo_referencia)||0;return {codigo:String(p.codigo||''),nombre:String(p.nombre||''),area:String(p.area||''),unidad:String(p.unidad||''),tipo_envase:String(p.tipo_envase||''),contenido_envase:p.contenido_envase==null?'':Number(p.contenido_envase),unidad_contenido:String(p.unidad_contenido||''),cocina,bar,total:bar+cocina,stock_minimo:Number(p.stock_minimo)||0,costo_referencia:costo,valor:(bar+cocina)*costo}});
 await enviarExcel(res,`inventario_${area.toLowerCase()}.xlsx`,'Inventario',columnas,filas);
}));
app.get('/api/exportar/movimientos.xlsx',auth,admin,wrap(async(req,res)=>{
 const area=areaReporte(String(req.query.area||'General'));if(!area)return res.status(400).json({error:'Área inválida'});
 const bodega=area==='Bar'?3:area==='Cocina'?2:null;
 const r=await db.execute({sql:`SELECT m.fecha,m.tipo,p.codigo,p.nombre AS producto,b.nombre AS bodega,m.cantidad,m.costo_unitario,m.motivo,m.responsable FROM movimientos m JOIN productos p ON p.id=m.producto_id AND p.empresa_id=m.empresa_id LEFT JOIN bodegas b ON b.id=m.bodega_id AND b.empresa_id=m.empresa_id WHERE m.empresa_id=? ${bodega?'AND m.bodega_id=?':''} ORDER BY m.id DESC LIMIT 10000`,args:bodega?[empresa,bodega]:[empresa]});
 const columnas=[['fecha','Fecha',23],['tipo','Tipo',18],['codigo','Código',17],['producto','Producto',32],['bodega','Bodega',16],['cantidad','Cantidad',16],['costo_unitario','Costo unitario',18],['motivo','Motivo',32],['responsable','Responsable',30]].map(([key,header,width])=>({key,header,width}));
 await enviarExcel(res,`movimientos_${area.toLowerCase()}.xlsx`,'Movimientos',columnas,r.rows.map(x=>Object.fromEntries(columnas.map(c=>[c.key,['cantidad','costo_unitario'].includes(c.key)?Number(x[c.key]||0):String(x[c.key]??'')]))));
}));
app.get('/api/movimientos-gerencia',auth,admin,wrap(async(req,res)=>{
 const r=await db.execute({sql:`SELECT m.id,m.fecha,m.tipo,m.cantidad,m.motivo,p.nombre AS producto,b.nombre AS bodega FROM movimientos m JOIN productos p ON p.id=m.producto_id AND p.empresa_id=m.empresa_id LEFT JOIN bodegas b ON b.id=m.bodega_id AND b.empresa_id=m.empresa_id WHERE m.empresa_id=? ORDER BY m.id DESC LIMIT 300`,args:[empresa]});res.json({movimientos:r.rows});
}));

// NUEVA RUTA: Aprobación de Solicitudes y Traspaso Físico Real de Inventario por Lotes (FEFO/FIFO)
app.post('/api/solicitudes/:id/aprobar', auth, admin, wrap(async (req, res) => {
    const solicitudId = req.params.id;
    const solicitudQuery = await db.execute({
        sql: "SELECT producto_id, cantidad_solicitada, bodega_destino_id FROM solicitudes WHERE id = ? AND estado = 'Pendiente' AND empresa_id = ?",
        args: [solicitudId, empresa]
    });
    if (solicitudQuery.rows.length === 0) {
        return res.status(404).json({ error: "La solicitud no existe o ya fue procesada" });
    }
    const solicitud = solicitudQuery.rows[0];
    const productoId = solicitud.producto_id;
    const cantidadTraspaso = parseInt(solicitud.cantidad_solicitada);
    const bodegaDestino = solicitud.bodega_destino_id;
    const bodegaOrigen = 1;

    const lotesQuery = await db.execute({
        sql: `SELECT id, cantidad_disponible, costo_unitario, fecha_vencimiento FROM lotes WHERE producto_id = ? AND bodega_id = ? AND cantidad_disponible > 0 AND empresa_id = ? ORDER BY CASE WHEN fecha_vencimiento IS NULL THEN 1 ELSE 0 END, fecha_vencimiento ASC, id ASC`,
        args: [productoId, bodegaOrigen, empresa]
    });
    const lotesCentral = lotesQuery.rows;
    const stockTotalCentral = lotesCentral.reduce((sum, r) => sum + Number(r.cantidad_disponible || 0), 0);
    if (stockTotalCentral < cantidadTraspaso) {
        return res.status(400).json({ error: `Stock insuficiente en Bodega Central. Disponible: ${stockTotalCentral}` });
    }

    let restante = cantidadTraspaso;
    for (const lote of lotesCentral) {
        if (restante <= 0) break;
        const disponibleLote = Number(lote.cantidad_disponible || 0);
        const aDescontar = Math.min(disponibleLote, restante);
        const costo = Number(lote.costo_unitario || 0);
        const vencimiento = lote.fecha_vencimiento;

        await db.execute({
