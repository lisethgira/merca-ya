const { z } = require('zod');
const { query, withTransaction } = require('../config/db');
const { badRequest, notFound } = require('../utils/http');

const addressSchema = z.object({
  alias: z.string().trim().min(2).max(40).optional(),
  departamento: z.string().trim().min(2).max(60),
  municipio: z.string().trim().min(2).max(60),
  barrio: z.string().trim().max(80).optional().or(z.literal('')),
  direccion: z.string().trim().min(5).max(150),
  referencia: z.string().trim().max(150).optional().or(z.literal('')),
  esPrincipal: z.boolean().optional(),
});

function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) throw badRequest(result.error.issues.map((issue) => issue.message).join('. '));
  return result.data;
}

function mapAddress(row) {
  return {
    id: row.id,
    alias: row.alias,
    departamento: row.departamento,
    municipio: row.municipio,
    barrio: row.barrio,
    direccion: row.direccion,
    referencia: row.referencia,
    esPrincipal: Boolean(row.es_principal),
  };
}

async function listAddresses(usuarioId) {
  const rows = await query(
    'SELECT * FROM direcciones WHERE usuario_id = ? ORDER BY es_principal DESC, id DESC',
    [usuarioId]
  );
  return rows.map(mapAddress);
}

async function createAddress(usuarioId, body) {
  const data = parse(addressSchema, body);
  return withTransaction(async (connection) => {
    const [existing] = await connection.query('SELECT id FROM direcciones WHERE usuario_id = ?', [usuarioId]);
    const principal = data.esPrincipal || existing.length === 0;
    if (principal) {
      await connection.query('UPDATE direcciones SET es_principal = 0 WHERE usuario_id = ?', [usuarioId]);
    }
    const [result] = await connection.query(
      `INSERT INTO direcciones (usuario_id, alias, departamento, municipio, barrio, direccion, referencia, es_principal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [usuarioId, data.alias || 'Casa', data.departamento, data.municipio, data.barrio || null, data.direccion, data.referencia || null, principal ? 1 : 0]
    );
    const [rows] = await connection.query('SELECT * FROM direcciones WHERE id = ?', [result.insertId]);
    return mapAddress(rows[0]);
  });
}

async function updateAddress(usuarioId, id, body) {
  const data = parse(addressSchema, body);
  return withTransaction(async (connection) => {
    const [rows] = await connection.query(
      'SELECT * FROM direcciones WHERE id = ? AND usuario_id = ?',
      [id, usuarioId]
    );
    if (!rows[0]) throw notFound('Dirección no encontrada');
    if (data.esPrincipal) {
      await connection.query('UPDATE direcciones SET es_principal = 0 WHERE usuario_id = ?', [usuarioId]);
    }
    await connection.query(
      `UPDATE direcciones
       SET alias = ?, departamento = ?, municipio = ?, barrio = ?, direccion = ?, referencia = ?, es_principal = ?
       WHERE id = ?`,
      [data.alias || 'Casa', data.departamento, data.municipio, data.barrio || null, data.direccion, data.referencia || null, data.esPrincipal ? 1 : rows[0].es_principal, id]
    );
    const [updated] = await connection.query('SELECT * FROM direcciones WHERE id = ?', [id]);
    return mapAddress(updated[0]);
  });
}

async function removeAddress(usuarioId, id) {
  const result = await query('DELETE FROM direcciones WHERE id = ? AND usuario_id = ?', [id, usuarioId]);
  if (!result.affectedRows) throw notFound('Dirección no encontrada');
  const remaining = await query(
    'SELECT id FROM direcciones WHERE usuario_id = ? ORDER BY id DESC LIMIT 1',
    [usuarioId]
  );
  if (remaining[0]) {
    const principal = await query(
      'SELECT id FROM direcciones WHERE usuario_id = ? AND es_principal = 1',
      [usuarioId]
    );
    if (!principal[0]) {
      await query('UPDATE direcciones SET es_principal = 1 WHERE id = ?', [remaining[0].id]);
    }
  }
}

async function markPrincipal(usuarioId, id) {
  await withTransaction(async (connection) => {
    const [rows] = await connection.query(
      'SELECT id FROM direcciones WHERE id = ? AND usuario_id = ?',
      [id, usuarioId]
    );
    if (!rows[0]) throw notFound('Dirección no encontrada');
    await connection.query('UPDATE direcciones SET es_principal = 0 WHERE usuario_id = ?', [usuarioId]);
    await connection.query('UPDATE direcciones SET es_principal = 1 WHERE id = ?', [id]);
  });
  return listAddresses(usuarioId);
}

module.exports = { listAddresses, createAddress, updateAddress, removeAddress, markPrincipal };
