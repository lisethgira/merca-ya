const mysql = require('mysql2/promise');
const env = require('./env');

const RETRYABLE = new Set([
  'ER_CON_COUNT_ERROR',
  'ER_USER_LIMIT_REACHED',
  'PROTOCOL_CONNECTION_LOST',
  'ECONNRESET',
  'ETIMEDOUT',
  'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
]);

let pool;
let ensuring;

function isConfigured() {
  return Boolean(env.db.host && env.db.user && env.db.database);
}

function isRetryable(error) {
  return RETRYABLE.has(error?.code) || /too many connections/i.test(error?.message || '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function connectionOptions() {
  return {
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    charset: 'utf8mb4',
    timezone: '-05:00',
    decimalNumbers: true,
    connectTimeout: 10000,
  };
}

function getPool() {
  if (!isConfigured()) {
    const error = new Error('La base de datos no está configurada. Copia backend-merca-ya/.env.example a .env y pega las credenciales de Clever Cloud.');
    error.status = 503;
    error.code = 'DB_NOT_CONFIGURED';
    throw error;
  }
  if (!pool) {
    const requested = process.env.VERCEL ? 1 : (env.db.connectionLimit || 3);
    const limit = Math.min(Math.max(requested, 1), 4);
    pool = mysql.createPool({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: env.db.database,
      waitForConnections: true,
      connectionLimit: limit,
      maxIdle: 1,
      idleTimeout: 8000,
      charset: 'utf8mb4',
      timezone: '-05:00',
      decimalNumbers: true,
      enableKeepAlive: true,
    });
  }
  return pool;
}

async function withServerless(fn) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let connection;
    try {
      connection = await mysql.createConnection(connectionOptions());
      return await fn(connection);
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === 2) throw error;
      await sleep(400 * (attempt + 1));
    } finally {
      if (connection) await connection.end().catch(() => {});
    }
  }
  throw lastError;
}

async function raw(sql, params = []) {
  if (process.env.VERCEL) {
    return withServerless(async (connection) => {
      const [rows] = await connection.query(sql, params);
      return rows;
    });
  }
  const [rows] = await getPool().query(sql, params);
  return rows;
}

async function ensureExtraTables() {
  const found = await raw(
    `SELECT COUNT(*) AS total
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'usuarios'`
  );
  if (!found[0] || Number(found[0].total) === 0) return;

  await raw(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      usuario_id INT UNSIGNED NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      revoked TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_refresh_hash (token_hash),
      KEY idx_refresh_usuario (usuario_id),
      CONSTRAINT fk_refresh_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await raw(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      usuario_id INT UNSIGNED NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_reset_hash (token_hash),
      KEY idx_reset_usuario (usuario_id),
      CONSTRAINT fk_reset_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function ensureOnce() {
  if (!isConfigured()) return Promise.resolve();
  if (!ensuring) {
    ensuring = ensureExtraTables().catch((error) => {
      ensuring = null;
      throw error;
    });
  }
  return ensuring;
}

async function query(sql, params = []) {
  await ensureOnce();
  return raw(sql, params);
}

async function withTransaction(work) {
  await ensureOnce();
  if (process.env.VERCEL) {
    return withServerless(async (connection) => {
      try {
        await connection.beginTransaction();
        const result = await work(connection);
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
      }
    });
  }
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function checkConnection() {
  if (!isConfigured()) return { ok: false, status: 'not_configured' };
  try {
    await query('SELECT 1 AS ok');
    const tables = await query(
      `SELECT COUNT(*) AS total
       FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'usuarios'`
    );
    return { ok: true, status: Number(tables[0].total) > 0 ? 'ready' : 'empty_schema' };
  } catch (error) {
    return {
      ok: false,
      status: 'error',
      message: env.isProduction ? 'No se pudo conectar a MySQL' : error.message,
    };
  }
}

module.exports = { isConfigured, query, withTransaction, checkConnection, getPool };
