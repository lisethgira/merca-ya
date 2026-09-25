const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { unauthorized, forbidden } = require('../utils/http');
const { query } = require('../config/db');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function signAccess(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, rol: user.rol, rolId: user.rol_id },
    env.jwtAccessSecret,
    { expiresIn: '15m' }
  );
}

async function issueSession(user) {
  const accessToken = signAccess(user);
  const refreshToken = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await query(
    'INSERT INTO refresh_tokens (usuario_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [user.id, sha256(refreshToken), expiresAt]
  );
  return { accessToken, refreshToken };
}

async function revokeAll(usuarioId) {
  await query('UPDATE refresh_tokens SET revoked = 1 WHERE usuario_id = ? AND revoked = 0', [usuarioId]);
}

function readUser(payload) {
  return { id: payload.sub, email: payload.email, rol: payload.rol, rolId: payload.rolId };
}

function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    req.user = readUser(jwt.verify(token, env.jwtAccessSecret));
  } catch {
    req.user = null;
  }
  return next();
}

function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized());
  try {
    req.user = readUser(jwt.verify(token, env.jwtAccessSecret));
    return next();
  } catch {
    return next(unauthorized('Sesión expirada'));
  }
}

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) return next(forbidden());
    return next();
  };
}

async function requireSeller(req, _res, next) {
  try {
    if (!req.user || req.user.rol !== 'vendedor') throw forbidden('Necesitas una tienda aprobada');
    const rows = await query('SELECT * FROM tiendas WHERE usuario_id = ?', [req.user.id]);
    if (!rows[0] || rows[0].estado !== 'aprobada') throw forbidden('Tu tienda aún no está aprobada');
    req.tienda = rows[0];
    return next();
  } catch (error) {
    return next(error);
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

module.exports = {
  sha256,
  issueSession,
  revokeAll,
  optionalAuth,
  requireAuth,
  requireRole,
  requireSeller,
  cookieOptions,
};
