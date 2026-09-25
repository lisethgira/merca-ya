const { z } = require('zod');
const { query, withTransaction } = require('../config/db');
const { badRequest, notFound, conflict } = require('../utils/http');
const { slugify } = require('../utils/slug');
const { notify, notifyAdmins } = require('../utils/notify');
const { dateRange } = require('../utils/dates');
const { lowStock } = require('./catalog.service');

function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) throw badRequest(result.error.issues.map((issue) => issue.message).join('. '));
  return result.data;
}

const storeSchema = z.object({
  nombre: z.string().trim().min(3).max(100),
  descripcion: z.string().trim().max(2000).optional().or(z.literal('')),
  municipio: z.string().trim().min(2).max(60),
  telefonoContacto: z.string().trim().max(20).optional().or(z.literal('')),
});

function mapStore(row) {
  return {
    id: row.id,
    usuarioId: row.usuario_id,
    nombre: row.nombre,
    slug: row.slug,
    descripcion: row.descripcion,
    logoUrl: row.logo_url,
    telefonoContacto: row.telefono_contacto,
    municipio: row.municipio,
    estado: row.estado,
    motivoEstado: row.motivo_estado,
    calificacion: Number(row.calificacion_promedio || 0),
    createdAt: row.created_at,
  };
}

async function uniqueStoreSlug(nombre, ignoreId = null) {
  const base = slugify(nombre) || 'tienda';
  let slug = base;
  let index = 2;
  while (true) {
    const rows = await query('SELECT id FROM tiendas WHERE slug = ?', [slug]);
    if (!rows.length || (ignoreId && rows[0].id === ignoreId)) return slug;
    slug = `${base.slice(0, 110)}-${index++}`;
  }
}

async function getMine(usuarioId) {
  const rows = await query('SELECT * FROM tiendas WHERE usuario_id = ?', [usuarioId]);
  if (!rows[0]) throw notFound('Aún no tienes una tienda');
  return mapStore(rows[0]);
}

async function getPublic(slug) {
  const rows = await query("SELECT * FROM tiendas WHERE slug = ? AND estado = 'aprobada'", [slug]);
  if (!rows[0]) throw notFound('Tienda no encontrada');
  return mapStore(rows[0]);
}

async function createStore(usuarioId, body) {
  const data = parse(storeSchema, body);
  const existing = await query('SELECT id FROM tiendas WHERE usuario_id = ?', [usuarioId]);
  if (existing[0]) throw conflict('Ya enviaste una solicitud de tienda');
  const slug = await uniqueStoreSlug(data.nombre);
  const result = await query(
    `INSERT INTO tiendas (usuario_id, nombre, slug, descripcion, telefono_contacto, municipio, estado)
     VALUES (?, ?, ?, ?, ?, ?, 'pendiente')`,
    [usuarioId, data.nombre, slug, data.descripcion || null, data.telefonoContacto || null, data.municipio]
  );
  await notify(usuarioId, 'tienda', 'Solicitud enviada', 'Tu tienda quedó pendiente de aprobación.', '/mi-tienda');
  await notifyAdmins('tienda', 'Nueva tienda por aprobar', data.nombre, '/admin/tiendas');
  const rows = await query('SELECT * FROM tiendas WHERE id = ?', [result.insertId]);
  return mapStore(rows[0]);
}

async function updateStore(usuarioId, body, logoUrl) {
  const current = await query('SELECT * FROM tiendas WHERE usuario_id = ?', [usuarioId]);
  if (!current[0]) throw notFound('Aún no tienes una tienda');
  const data = parse(storeSchema, body);
  const slug = current[0].nombre === data.nombre ? current[0].slug : await uniqueStoreSlug(data.nombre, current[0].id);
  await query(
    `UPDATE tiendas
     SET nombre = ?, slug = ?, descripcion = ?, telefono_contacto = ?, municipio = ?, logo_url = COALESCE(?, logo_url)
     WHERE id = ?`,
    [data.nombre, slug, data.descripcion || null, data.telefonoContacto || null, data.municipio, logoUrl || null, current[0].id]
  );
  const rows = await query('SELECT * FROM tiendas WHERE id = ?', [current[0].id]);
  return mapStore(rows[0]);
}

async function setStoreStatus(adminId, id, { estado, motivo }) {
  if (!['aprobada', 'rechazada', 'suspendida'].includes(estado)) throw badRequest('Estado no permitido');
  if (estado !== 'aprobada' && !motivo) throw badRequest('Escribe el motivo');
  const rows = await query('SELECT * FROM tiendas WHERE id = ?', [id]);
  if (!rows[0]) throw notFound('Tienda no encontrada');
  await withTransaction(async (connection) => {
    await connection.query(
      `UPDATE tiendas
       SET estado = ?, motivo_estado = ?, aprobada_por = ?, aprobada_en = NOW()
       WHERE id = ?`,
      [estado, estado === 'aprobada' ? null : motivo.slice(0, 255), adminId, id]
    );
    await connection.query(
      'UPDATE usuarios SET rol_id = ? WHERE id = ?',
      [estado === 'aprobada' ? 2 : 3, rows[0].usuario_id]
    );
  });
  const message = estado === 'aprobada'
    ? 'Tu tienda fue aprobada. Ya puedes publicar productos.'
    : `Tu tienda fue ${estado}: ${motivo}`;
  await notify(rows[0].usuario_id, 'tienda', 'Estado de tu tienda', message.slice(0, 255), '/mi-tienda');
  const updated = await query('SELECT * FROM tiendas WHERE id = ?', [id]);
  return mapStore(updated[0]);
}

async function listStores(filters) {
  const where = [];
  const params = [];
  if (filters.estado) {
    where.push('t.estado = ?');
    params.push(filters.estado);
  }
  if (filters.q) {
    where.push('(t.nombre LIKE ? OR u.email LIKE ?)');
    params.push(`%${filters.q}%`, `%${filters.q}%`);
  }
  const rows = await query(
    `SELECT t.*, u.nombres, u.apellidos, u.email
     FROM tiendas t JOIN usuarios u ON u.id = t.usuario_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY t.created_at DESC`,
    params
  );
  return rows.map((row) => ({
    ...mapStore(row),
    dueno: `${row.nombres} ${row.apellidos}`,
    email: row.email,
  }));
}

async function sellerSummary(tienda, range) {
  const { start, end } = dateRange(range.desde, range.hasta);
  const totals = await query(
    `SELECT COUNT(DISTINCT d.pedido_id) AS pedidos,
            COALESCE(SUM(d.cantidad), 0) AS unidades,
            COALESCE(SUM(d.subtotal), 0) AS ingresos
     FROM detalle_pedido d
     JOIN pedidos p ON p.id = d.pedido_id
     WHERE d.tienda_id = ? AND d.estado_item <> 'cancelado' AND p.created_at BETWEEN ? AND ?`,
    [tienda.id, start, end]
  );
  const top = await query(
    `SELECT d.nombre_producto AS nombre, SUM(d.cantidad) AS unidades, SUM(d.subtotal) AS ingresos
     FROM detalle_pedido d
     JOIN pedidos p ON p.id = d.pedido_id
     WHERE d.tienda_id = ? AND d.estado_item <> 'cancelado' AND p.created_at BETWEEN ? AND ?
     GROUP BY d.nombre_producto
     ORDER BY ingresos DESC
     LIMIT 5`,
    [tienda.id, start, end]
  );
  const pendientes = await query(
    `SELECT COUNT(*) AS total FROM detalle_pedido
     WHERE tienda_id = ? AND estado_item IN ('pendiente', 'en_preparacion')`,
    [tienda.id]
  );
  const preguntas = await query(
    `SELECT COUNT(*) AS total
     FROM preguntas_producto q JOIN productos p ON p.id = q.producto_id
     WHERE p.tienda_id = ? AND q.respuesta IS NULL`,
    [tienda.id]
  );
  return {
    desde: start.slice(0, 10),
    hasta: end.slice(0, 10),
    pedidos: Number(totals[0].pedidos),
    unidades: Number(totals[0].unidades),
    ingresos: Number(totals[0].ingresos),
    calificacion: Number(tienda.calificacion_promedio || 0),
    top,
    ventasPendientes: Number(pendientes[0].total),
    preguntasSinResponder: Number(preguntas[0].total),
    stockBajo: await lowStock(tienda.id),
  };
}

module.exports = {
  getMine,
  getPublic,
  createStore,
  updateStore,
  setStoreStatus,
  listStores,
  sellerSummary,
};
