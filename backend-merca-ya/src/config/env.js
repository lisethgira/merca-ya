const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

function pick(...keys) {
  for (const key of keys) {
    if (process.env[key]) return process.env[key];
  }
  return '';
}

const nodeEnv = process.env.NODE_ENV || 'development';

module.exports = {
  nodeEnv,
  port: Number(process.env.PORT || 4000),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-mercaya',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-mercaya',
  paymentMode: process.env.PAYMENT_MODE || 'demo',
  envioBase: Number(process.env.ENVIO_BASE || 8000),
  envioGratisDesde: Number(process.env.ENVIO_GRATIS_DESDE || 150000),
  db: {
    host: pick('DB_HOST', 'MYSQL_ADDON_HOST'),
    port: Number(pick('DB_PORT', 'MYSQL_ADDON_PORT') || 3306),
    user: pick('DB_USER', 'MYSQL_ADDON_USER'),
    password: pick('DB_PASSWORD', 'MYSQL_ADDON_PASSWORD'),
    database: pick('DB_NAME', 'MYSQL_ADDON_DB', 'MYSQL_ADDON_DATABASE'),
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 5),
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || 'MercaYa <no-reply@mercaya.com>',
  },
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@mercaya.com',
  },
  isProduction: nodeEnv === 'production',
};
