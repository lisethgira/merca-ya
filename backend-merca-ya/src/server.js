const app = require('./app');
const env = require('./config/env');
const { isConfigured } = require('./config/db');

if (env.isProduction && (!process.env.JWT_ACCESS_SECRET || !isConfigured())) {
  console.error('En producción hacen falta JWT_ACCESS_SECRET y las credenciales de MySQL.');
  process.exit(1);
}

if (!isConfigured()) {
  console.warn('MySQL sin configurar. Copia .env.example a .env y pega las credenciales de Clever Cloud.');
}

app.listen(env.port, () => {
  console.log(`MercaYa API en http://localhost:${env.port}/api/v1/salud`);
});
