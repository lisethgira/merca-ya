const nodemailer = require('nodemailer');
const env = require('../config/env');

let transporter;

function mailer() {
  if (!env.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined,
    });
  }
  return transporter;
}

async function sendMail({ to, subject, text }) {
  const transport = mailer();
  if (!transport) {
    if (!env.isProduction) {
      console.log(`[correo simulado] Para: ${to} | ${subject}\n${text}`);
    }
    return false;
  }
  await transport.sendMail({ from: env.smtp.from, to, subject, text });
  return true;
}

module.exports = { sendMail };
