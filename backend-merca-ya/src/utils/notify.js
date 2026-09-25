const { query } = require('../config/db');
const { sendPush } = require('./push');

async function notify(usuarioId, tipo, titulo, mensaje, urlDestino = null) {
  await query(
    `INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
     VALUES (?, ?, ?, ?, ?)`,
    [usuarioId, tipo, titulo.slice(0, 120), mensaje.slice(0, 255), urlDestino]
  );
  try {
    await sendPush(usuarioId, { title: titulo, body: mensaje, url: urlDestino || '/' });
  } catch (error) {
    console.error('Push:', error.message);
  }
}

async function notifyAdmins(tipo, titulo, mensaje, urlDestino = null) {
  const admins = await query(
    "SELECT id FROM usuarios WHERE rol_id = 1 AND estado = 'activo'"
  );
  await Promise.all(admins.map((admin) => notify(admin.id, tipo, titulo, mensaje, urlDestino)));
}

module.exports = { notify, notifyAdmins };
