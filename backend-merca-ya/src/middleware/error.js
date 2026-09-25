const multer = require('multer');
const env = require('../config/env');
const { HttpError } = require('../utils/http');

function notFound(_req, res) {
  res.status(404).json({ ok: false, message: 'Ruta no encontrada' });
}

function errorHandler(error, _req, res, _next) {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Cada imagen debe pesar máximo 2 MB'
      : 'No se pudo subir el archivo';
    return res.status(400).json({ ok: false, message });
  }
  if (error.code === 'DB_NOT_CONFIGURED') {
    return res.status(503).json({ ok: false, message: error.message });
  }
  if (error.code === 'ER_NO_SUCH_TABLE') {
    return res.status(503).json({
      ok: false,
      message: 'Falta el esquema de MercaYa. Ejecuta docs/mercaya_db.sql en la base de Clever Cloud.',
    });
  }
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  const message = status >= 500 && env.isProduction
    ? 'Error interno del servidor'
    : (error.message || 'Error interno del servidor');
  return res.status(status).json({ ok: false, message });
}

module.exports = { notFound, errorHandler, HttpError };
