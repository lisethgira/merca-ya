const { z } = require('zod');
const { query } = require('../config/db');
const { badRequest, notFound, forbidden } = require('../utils/http');
const { dateRange } = require('../utils/dates');
const { revokeAll } = require('../middleware/auth');

function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) throw badRequest(result.error.issues.map((issue) => issue.message).join('. '));
  return result.data;
}

async function indicators(filters) {
  const { start, end } = dateRange(filters.desde, filters.hasta);
  const sales = await query(
    `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS pedidos
     FROM pedidos
     WHERE estado NOT IN ('cancelado') AND created_at BETWEEN ? AND ?`,
    [start, end]
  );
  const byState = await query(
    `SELECT estado, COUNT(*) AS total FROM pedidos WHERE created_at BETWEEN ? AND ? GROUP BY estado`,
    [start, end]
  );
  const users = await query(
    'SELECT COUNT(*) AS total FROM usuarios WHERE created_at BETWEEN ? AND ?',
    [start, end]
  );
  const pendingStores = await query("SELECT COUNT(*) AS total FROM tiendas WHERE estado = 'pendiente'");
  const pendingProducts = await query("SELECT COUNT(*) AS total FROM productos WHERE estado = 'pendiente'");
  const openReports = await query("SELECT COUNT(*) AS total FROM reportes WHERE estado IN ('abierto', 'en_revision')");
  return {
    desde: start.slice(0, 10),
    hasta: end.slice(0, 10),
    ventas: Number(sales[0].total),
    pedidos: Number(sales[0].pedidos),
    pedidosPorEstado: byState.map((row) => ({ estado: row.estado, total: Number(row.total) })),
    usuariosNuevos: Number(users[0].total),
    tiendasPendientes: Number(pendingStores[0].total),
    productosPendientes: Number(pendingProducts[0].total),
    reportesAbiertos: Number(openReports[0].total),
  };
}

async function listUsers(filters) {
  const where = [];
  const params = [];
  if (filters.rol) {
    where.push('r.nombre = ?');
    params.push(filters.rol);
  }
  if (filters.estado) {
    where.push('u.estado = ?');
    params.push(filters.estado);
  }
  if (filters.q) {
    where.push('(u.email LIKE ? OR u.nombres LIKE ? OR u.apellidos LIKE ?)');
    const like = `%${filters.q}%`;
    params.push(like, like, like);
  }
  const rows = await query(
    `SELECT u.id, u.nombres, u.apellidos, u.email, u.telefono, u.estado, u.created_at AS createdAt, r.nombre AS rol, r.id AS rolId
     FROM usuarios u JOIN roles r ON r.id = u.rol_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY u.created_at DESC
     LIMIT 100`,
    params
  );
  return rows;
}

async function updateUser(adminId, userId, body) {
  const data = parse(z.object({
    estado: z.enum(['activo', 'inactivo', 'bloqueado']).optional(),
    rolId: z.coerce.number().int().min(1).max(3).optional(),
  }), body);
  if (Number(adminId) === Number(userId) && data.estado && data.estado !== 'activo') {
    throw forbidden('No puedes bloquear tu propia cuenta');
  }
  const rows = await query('SELECT id FROM usuarios WHERE id = ?', [userId]);
  if (!rows[0]) throw notFound('Usuario no encontrado');
  if (data.estado) await query('UPDATE usuarios SET estado = ? WHERE id = ?', [data.estado, userId]);
  if (data.rolId) await query('UPDATE usuarios SET rol_id = ? WHERE id = ?', [data.rolId, userId]);
  if (data.estado && data.estado !== 'activo') await revokeAll(userId);
  return listUsers({});
}

async function listReports() {
  return query(
    `SELECT rp.id, rp.motivo, rp.descripcion, rp.estado, rp.resolucion, rp.created_at AS createdAt,
            p.nombre AS producto, p.id AS productoId, p.slug, u.nombres AS reportante
     FROM reportes rp
     JOIN productos p ON p.id = rp.producto_id
     JOIN usuarios u ON u.id = rp.reportante_id
     ORDER BY rp.created_at DESC`
  );
}

async function resolveReport(adminId, id, body) {
  const data = parse(z.object({
    estado: z.enum(['en_revision', 'resuelto', 'descartado']),
    resolucion: z.string().trim().max(255).optional().or(z.literal('')),
    pausarProducto: z.boolean().optional(),
  }), body);
  const rows = await query('SELECT * FROM reportes WHERE id = ?', [id]);
  if (!rows[0]) throw notFound('Reporte no encontrado');
  await query(
    `UPDATE reportes
     SET estado = ?, resolucion = ?, admin_id = ?, resuelto_en = IF(? IN ('resuelto', 'descartado'), NOW(), NULL)
     WHERE id = ?`,
    [data.estado, data.resolucion || null, adminId, data.estado, id]
  );
  if (data.pausarProducto) {
    await query("UPDATE productos SET estado = 'pausado' WHERE id = ?", [rows[0].producto_id]);
  }
  return listReports();
}

async function listAllOrders(filters) {
  const where = ['1=1'];
  const params = [];
  if (filters.estado) {
    where.push('p.estado = ?');
    params.push(filters.estado);
  }
  if (filters.desde && filters.hasta) {
    const range = dateRange(filters.desde, filters.hasta);
    where.push('p.created_at BETWEEN ? AND ?');
    params.push(range.start, range.end);
  }
  if (filters.q) {
    where.push('(p.codigo LIKE ? OR u.email LIKE ?)');
    params.push(`%${filters.q}%`, `%${filters.q}%`);
  }
  return query(
    `SELECT p.codigo, p.estado, p.total, p.municipio_envio AS municipio, p.created_at AS createdAt,
            u.nombres, u.apellidos, u.email, pg.metodo, pg.estado AS estadoPago
     FROM pedidos p
     JOIN usuarios u ON u.id = p.cliente_id
     LEFT JOIN pagos pg ON pg.pedido_id = p.id
     WHERE ${where.join(' AND ')}
     ORDER BY p.created_at DESC
     LIMIT 200`,
    params
  );
}

async function salesCsv(filters) {
  const range = dateRange(filters.desde, filters.hasta);
  const rows = await query(
    `SELECT t.nombre AS tienda,
            COUNT(DISTINCT IF(p.created_at BETWEEN ? AND ?, d.pedido_id, NULL)) AS pedidos,
            COALESCE(SUM(IF(p.created_at BETWEEN ? AND ?, d.cantidad, 0)), 0) AS unidades,
            COALESCE(SUM(IF(p.created_at BETWEEN ? AND ?, d.subtotal, 0)), 0) AS total
     FROM tiendas t
     LEFT JOIN detalle_pedido d ON d.tienda_id = t.id AND d.estado_item <> 'cancelado'
     LEFT JOIN pedidos p ON p.id = d.pedido_id
     GROUP BY t.id, t.nombre
     ORDER BY total DESC`,
    [range.start, range.end, range.start, range.end, range.start, range.end]
  );
  const header = 'tienda,pedidos,unidades,total';
  const lines = rows.map((row) => `"${String(row.tienda).replace(/"/g, '""')}",${row.pedidos},${row.unidades},${row.total}`);
  return `${header}\n${lines.join('\n')}\n`;
}

module.exports = { indicators, listUsers, updateUser, listReports, resolveReport, listAllOrders, salesCsv };
