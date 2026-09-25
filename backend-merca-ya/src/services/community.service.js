const { z } = require('zod');
const { query } = require('../config/db');
const { badRequest, notFound, conflict, forbidden } = require('../utils/http');
const { notify, notifyAdmins } = require('../utils/notify');

function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) throw badRequest(result.error.issues.map((issue) => issue.message).join('. '));
  return result.data;
}

async function refreshRating(productoId) {
  const avg = await query(
    'SELECT ROUND(AVG(calificacion), 2) AS avgCal FROM resenas WHERE producto_id = ? AND visible = 1',
    [productoId]
  );
  await query('UPDATE productos SET calificacion_promedio = ? WHERE id = ?', [avg[0].avgCal || 0, productoId]);
  const store = await query('SELECT tienda_id FROM productos WHERE id = ?', [productoId]);
  const storeAvg = await query(
    `SELECT ROUND(AVG(r.calificacion), 2) AS avgCal
     FROM resenas r JOIN productos p ON p.id = r.producto_id
     WHERE p.tienda_id = ? AND r.visible = 1`,
    [store[0].tienda_id]
  );
  await query('UPDATE tiendas SET calificacion_promedio = ? WHERE id = ?', [storeAvg[0].avgCal || 0, store[0].tienda_id]);
}

async function createReview(usuarioId, body) {
  const data = parse(z.object({
    detallePedidoId: z.coerce.number().int().positive(),
    calificacion: z.coerce.number().int().min(1).max(5),
    comentario: z.string().trim().max(500).optional().or(z.literal('')),
  }), body);
  const rows = await query(
    `SELECT d.id, d.producto_id, d.estado_item, p.cliente_id
     FROM detalle_pedido d JOIN pedidos p ON p.id = d.pedido_id
     WHERE d.id = ?`,
    [data.detallePedidoId]
  );
  const item = rows[0];
  if (!item || item.cliente_id !== usuarioId) throw notFound('Compra no encontrada');
  if (item.estado_item !== 'entregado') throw forbidden('Solo puedes reseñar productos que ya recibiste');
  if (!item.producto_id) throw conflict('Este producto ya no está disponible para reseña');
  const existing = await query('SELECT id FROM resenas WHERE detalle_pedido_id = ?', [item.id]);
  if (existing[0]) throw conflict('Ya calificaste este producto');
  await query(
    `INSERT INTO resenas (producto_id, cliente_id, detalle_pedido_id, calificacion, comentario)
     VALUES (?, ?, ?, ?, ?)`,
    [item.producto_id, usuarioId, item.id, data.calificacion, data.comentario || null]
  );
  await refreshRating(item.producto_id);
  return { message: 'Gracias por tu reseña' };
}

async function askQuestion(usuarioId, productoId, pregunta) {
  const text = parse(z.object({ pregunta: z.string().trim().min(4).max(500) }), { pregunta }).pregunta;
  const products = await query(
    `SELECT p.id, p.nombre, t.usuario_id
     FROM productos p JOIN tiendas t ON t.id = p.tienda_id
     WHERE p.id = ? AND p.estado = 'publicado'`,
    [productoId]
  );
  if (!products[0]) throw notFound('Producto no encontrado');
  if (products[0].usuario_id === usuarioId) throw forbidden('No puedes preguntarte a ti mismo');
  const result = await query(
    'INSERT INTO preguntas_producto (producto_id, cliente_id, pregunta) VALUES (?, ?, ?)',
    [productoId, usuarioId, text]
  );
  await notify(products[0].usuario_id, 'pregunta', 'Nueva pregunta', `${products[0].nombre}: ${text}`.slice(0, 255), '/vendedor/preguntas');
  return { id: result.insertId, pregunta: text };
}

async function sellerQuestions(tiendaId) {
  return query(
    `SELECT q.id, q.pregunta, q.respuesta, q.created_at AS createdAt, q.respondida_en AS respondidaEn,
            p.nombre AS producto, p.slug, u.nombres
     FROM preguntas_producto q
     JOIN productos p ON p.id = q.producto_id
     JOIN usuarios u ON u.id = q.cliente_id
     WHERE p.tienda_id = ?
     ORDER BY q.respuesta IS NULL DESC, q.created_at DESC`,
    [tiendaId]
  );
}

async function answerQuestion(tiendaId, id, respuesta) {
  const text = parse(z.object({ respuesta: z.string().trim().min(2).max(500) }), { respuesta }).respuesta;
  const rows = await query(
    `SELECT q.*, p.tienda_id, p.slug, p.nombre
     FROM preguntas_producto q JOIN productos p ON p.id = q.producto_id
     WHERE q.id = ?`,
    [id]
  );
  if (!rows[0] || rows[0].tienda_id !== tiendaId) throw notFound('Pregunta no encontrada');
  if (rows[0].respuesta) throw conflict('Esta pregunta ya fue respondida');
  await query('UPDATE preguntas_producto SET respuesta = ?, respondida_en = NOW() WHERE id = ?', [text, id]);
  await notify(rows[0].cliente_id, 'pregunta', 'Respondieron tu pregunta', rows[0].nombre, `/producto/${rows[0].slug}`);
  return sellerQuestions(tiendaId);
}

async function createReport(usuarioId, body) {
  const data = parse(z.object({
    productoId: z.coerce.number().int().positive(),
    motivo: z.enum(['fraude', 'prohibido', 'contenido_inapropiado', 'informacion_falsa', 'otro']),
    descripcion: z.string().trim().max(500).optional().or(z.literal('')),
  }), body);
  const products = await query('SELECT id, nombre FROM productos WHERE id = ?', [data.productoId]);
  if (!products[0]) throw notFound('Producto no encontrado');
  const result = await query(
    `INSERT INTO reportes (reportante_id, producto_id, motivo, descripcion) VALUES (?, ?, ?, ?)`,
    [usuarioId, data.productoId, data.motivo, data.descripcion || null]
  );
  await notifyAdmins('sistema', 'Nuevo reporte', products[0].nombre, '/admin/reportes');
  return { id: result.insertId, message: 'Recibimos tu reporte' };
}

async function listNotifications(usuarioId) {
  const rows = await query(
    `SELECT id, tipo, titulo, mensaje, url_destino AS url, leida, created_at AS createdAt
     FROM notificaciones WHERE usuario_id = ? ORDER BY created_at DESC LIMIT 50`,
    [usuarioId]
  );
  const unread = await query(
    'SELECT COUNT(*) AS total FROM notificaciones WHERE usuario_id = ? AND leida = 0',
    [usuarioId]
  );
  return { items: rows.map((row) => ({ ...row, leida: Boolean(row.leida) })), noLeidas: Number(unread[0].total) };
}

async function markRead(usuarioId, id) {
  await query('UPDATE notificaciones SET leida = 1 WHERE id = ? AND usuario_id = ?', [id, usuarioId]);
  return listNotifications(usuarioId);
}

async function markAllRead(usuarioId) {
  await query('UPDATE notificaciones SET leida = 1 WHERE usuario_id = ? AND leida = 0', [usuarioId]);
  return listNotifications(usuarioId);
}

async function subscribePush(usuarioId, body, dispositivo) {
  const data = parse(z.object({
    endpoint: z.string().url().max(500),
    keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(5) }),
  }), body);
  await query(
    `INSERT INTO suscripciones_push (usuario_id, endpoint, p256dh, auth, dispositivo)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE usuario_id = VALUES(usuario_id), p256dh = VALUES(p256dh), auth = VALUES(auth)`,
    [usuarioId, data.endpoint, data.keys.p256dh, data.keys.auth, dispositivo || null]
  );
  return { ok: true };
}

async function unsubscribePush(usuarioId, endpoint) {
  await query('DELETE FROM suscripciones_push WHERE usuario_id = ? AND endpoint = ?', [usuarioId, endpoint]);
}

module.exports = {
  createReview,
  askQuestion,
  sellerQuestions,
  answerQuestion,
  createReport,
  listNotifications,
  markRead,
  markAllRead,
  subscribePush,
  unsubscribePush,
};
