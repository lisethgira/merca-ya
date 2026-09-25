const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { query } = require('../config/db');
const env = require('../config/env');
const { badRequest, unauthorized, forbidden, conflict, notFound } = require('../utils/http');
const { PASSWORD_MESSAGE, isStrongPassword } = require('../utils/password');
const { sendMail } = require('../utils/mailer');
const { notify } = require('../utils/notify');
const { sha256, issueSession, revokeAll } = require('../middleware/auth');

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;

const passwordSchema = z.string().regex(/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,72}$/, PASSWORD_MESSAGE);

const registerSchema = z.object({
  nombres: z.string().trim().min(2, 'Ingresa tus nombres').max(80),
  apellidos: z.string().trim().min(2, 'Ingresa tus apellidos').max(80),
  email: z.string().trim().email('Correo inválido').max(120),
  password: passwordSchema,
  telefono: z.string().trim().max(20).optional().or(z.literal('')),
  aceptaPolitica: z.literal(true, { errorMap: () => ({ message: 'Debes aceptar la política de tratamiento de datos' }) }),
});

const loginSchema = z.object({
  email: z.string().trim().email('Correo inválido'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
});

function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(result.error.issues.map((issue) => issue.message).join('. '));
  }
  return result.data;
}

function publicUser(row) {
  return {
    id: row.id,
    rol: row.rol,
    rolId: row.rol_id,
    nombres: row.nombres,
    apellidos: row.apellidos,
    email: row.email,
    telefono: row.telefono,
    avatarUrl: row.avatar_url,
    tipoDocumento: row.tipo_documento,
    numeroDocumento: row.numero_documento,
    emailVerificado: Boolean(row.email_verificado),
    estado: row.estado,
  };
}

async function findByEmail(email) {
  const rows = await query(
    `SELECT u.*, r.nombre AS rol
     FROM usuarios u JOIN roles r ON r.id = u.rol_id
     WHERE u.email = ?`,
    [email.toLowerCase()]
  );
  return rows[0] || null;
}

async function findById(id) {
  const rows = await query(
    `SELECT u.*, r.nombre AS rol
     FROM usuarios u JOIN roles r ON r.id = u.rol_id
     WHERE u.id = ?`,
    [id]
  );
  return rows[0] || null;
}

function assertNotLocked(email) {
  const record = attempts.get(email);
  if (record && record.count >= 5 && Date.now() - record.first < WINDOW_MS) {
    throw new (require('../utils/http').HttpError)(429, 'Demasiados intentos. Espera 15 minutos.');
  }
}

function registerFailure(email) {
  const now = Date.now();
  const record = attempts.get(email);
  if (!record || now - record.first > WINDOW_MS) attempts.set(email, { count: 1, first: now });
  else record.count += 1;
}

async function register(body) {
  const data = parse(registerSchema, body);
  const email = data.email.toLowerCase();
  if (await findByEmail(email)) throw conflict('El correo ya está registrado');
  const passwordHash = await bcrypt.hash(data.password, 10);
  const result = await query(
    `INSERT INTO usuarios (rol_id, nombres, apellidos, email, password_hash, telefono)
     VALUES (3, ?, ?, ?, ?, ?)`,
    [data.nombres, data.apellidos, email, passwordHash, data.telefono || null]
  );
  await query('INSERT INTO carritos (usuario_id) VALUES (?)', [result.insertId]);
  const user = await findById(result.insertId);
  await notify(user.id, 'sistema', 'Bienvenido a MercaYa', 'Tu cuenta de cliente ya está lista.', '/');
  await sendMail({
    to: user.email,
    subject: 'Bienvenido a MercaYa',
    text: `Hola ${user.nombres}, tu cuenta en MercaYa fue creada. Ya puedes explorar y comprar.`,
  });
  const session = await issueSession(user);
  return { user: publicUser(user), accessToken: session.accessToken, refreshToken: session.refreshToken };
}

async function login(body) {
  const data = parse(loginSchema, body);
  const email = data.email.toLowerCase();
  assertNotLocked(email);
  const user = await findByEmail(email);
  const matches = user ? await bcrypt.compare(data.password, user.password_hash) : false;
  if (!user || !matches) {
    registerFailure(email);
    throw unauthorized('Correo o contraseña incorrectos');
  }
  if (user.estado === 'bloqueado') throw forbidden('Tu cuenta está bloqueada');
  if (user.estado !== 'activo') throw forbidden('Tu cuenta no está activa');
  attempts.delete(email);
  await query('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?', [user.id]);
  const session = await issueSession(user);
  return { user: publicUser(user), accessToken: session.accessToken, refreshToken: session.refreshToken };
}

async function refresh(rawToken) {
  if (!rawToken) throw unauthorized('Sesión no válida');
  const rows = await query(
    `SELECT rt.id, rt.expires_at, rt.revoked, u.*, r.nombre AS rol
     FROM refresh_tokens rt
     JOIN usuarios u ON u.id = rt.usuario_id
     JOIN roles r ON r.id = u.rol_id
     WHERE rt.token_hash = ?`,
    [sha256(rawToken)]
  );
  const row = rows[0];
  if (!row || row.revoked || new Date(row.expires_at) < new Date()) throw unauthorized('Sesión expirada');
  if (row.estado !== 'activo') throw forbidden('Tu cuenta no está activa');
  await query('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?', [row.id]);
  const session = await issueSession(row);
  return { user: publicUser(row), accessToken: session.accessToken, refreshToken: session.refreshToken };
}

async function logout(rawToken) {
  if (!rawToken) return;
  await query('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?', [sha256(rawToken)]);
}

async function forgotPassword(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const user = normalized ? await findByEmail(normalized) : null;
  if (user && user.estado === 'activo') {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await query(
      'INSERT INTO password_resets (usuario_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [user.id, sha256(token), expiresAt]
    );
    const link = `${env.frontendUrl}/restablecer?token=${token}`;
    await sendMail({
      to: user.email,
      subject: 'Restablece tu contraseña de MercaYa',
      text: `Hola ${user.nombres}, este enlace vence en 30 minutos y solo puede usarse una vez:\n${link}`,
    });
  }
  return { message: 'Si el correo está registrado, enviaremos un enlace para restablecer la contraseña.' };
}

async function resetPassword(body) {
  const data = parse(z.object({
    token: z.string().min(20, 'Enlace inválido'),
    password: passwordSchema,
  }), body);
  const rows = await query(
    `SELECT * FROM password_resets
     WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()`,
    [sha256(data.token)]
  );
  const reset = rows[0];
  if (!reset) throw badRequest('El enlace no es válido o ya venció');
  const passwordHash = await bcrypt.hash(data.password, 10);
  await query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [passwordHash, reset.usuario_id]);
  await query('UPDATE password_resets SET used_at = NOW() WHERE id = ?', [reset.id]);
  await revokeAll(reset.usuario_id);
  return { message: 'Contraseña actualizada. Ingresa de nuevo.' };
}

async function updateProfile(userId, body) {
  const data = parse(z.object({
    nombres: z.string().trim().min(2).max(80),
    apellidos: z.string().trim().min(2).max(80),
    telefono: z.string().trim().max(20).optional().or(z.literal('')),
    tipoDocumento: z.enum(['CC', 'CE', 'TI', 'PASAPORTE', 'NIT']).optional().nullable(),
    numeroDocumento: z.string().trim().max(20).optional().or(z.literal('')),
  }), body);
  await query(
    `UPDATE usuarios
     SET nombres = ?, apellidos = ?, telefono = ?, tipo_documento = ?, numero_documento = ?
     WHERE id = ?`,
    [
      data.nombres,
      data.apellidos,
      data.telefono || null,
      data.tipoDocumento || null,
      data.numeroDocumento || null,
      userId,
    ]
  );
  return publicUser(await findById(userId));
}

async function changePassword(userId, body) {
  const data = parse(z.object({
    actual: z.string().min(1, 'Ingresa tu contraseña actual'),
    nueva: passwordSchema,
  }), body);
  const user = await findById(userId);
  if (!user) throw notFound('Usuario no encontrado');
  const matches = await bcrypt.compare(data.actual, user.password_hash);
  if (!matches) throw unauthorized('La contraseña actual no es correcta');
  await query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [await bcrypt.hash(data.nueva, 10), userId]);
  await revokeAll(userId);
  const session = await issueSession(await findById(userId));
  return { user: publicUser(await findById(userId)), accessToken: session.accessToken, refreshToken: session.refreshToken };
}

async function deleteAccount(userId, password) {
  const user = await findById(userId);
  if (!user) throw notFound('Usuario no encontrado');
  if (user.rol === 'administrador') throw forbidden('La cuenta de administrador no se puede eliminar desde aquí');
  const matches = await bcrypt.compare(password || '', user.password_hash);
  if (!matches) throw unauthorized('La contraseña no es correcta');
  await query(
    `UPDATE usuarios
     SET estado = 'inactivo', email = ?, nombres = 'Usuario', apellidos = 'Eliminado',
         telefono = NULL, avatar_url = NULL, tipo_documento = NULL, numero_documento = NULL,
         password_hash = ?
     WHERE id = ?`,
    [`eliminado+${userId}@mercaya.local`, await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10), userId]
  );
  await revokeAll(userId);
  return { message: 'Tu cuenta fue eliminada' };
}

async function updateAvatar(userId, url) {
  await query('UPDATE usuarios SET avatar_url = ? WHERE id = ?', [url, userId]);
  return publicUser(await findById(userId));
}

module.exports = {
  publicUser,
  findById,
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  updateProfile,
  changePassword,
  deleteAccount,
  updateAvatar,
  isStrongPassword,
};
