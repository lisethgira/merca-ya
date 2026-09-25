const webpush = require('web-push');
const env = require('../config/env');
const { query } = require('../config/db');

let configured = false;

function canPush() {
  return Boolean(env.vapid.publicKey && env.vapid.privateKey);
}

function configure() {
  if (configured || !canPush()) return;
  webpush.setVapidDetails(env.vapid.subject, env.vapid.publicKey, env.vapid.privateKey);
  configured = true;
}

async function sendPush(usuarioId, payload) {
  if (!canPush()) return;
  configure();
  const subs = await query(
    'SELECT id, endpoint, p256dh, auth FROM suscripciones_push WHERE usuario_id = ?',
    [usuarioId]
  );
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await query('DELETE FROM suscripciones_push WHERE id = ?', [sub.id]);
      }
    }
  }));
}

module.exports = { canPush, sendPush };
