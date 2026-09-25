const express = require('express');
const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const { checkConnection } = require('../config/db');
const { canPush } = require('../utils/push');
const {
  optionalAuth, requireAuth, requireRole, requireSeller, cookieOptions,
} = require('../middleware/auth');
const { upload, publicUrl } = require('../middleware/upload');
const auth = require('../services/auth.service');
const account = require('../services/account.service');
const catalog = require('../services/catalog.service');
const store = require('../services/store.service');
const commerce = require('../services/commerce.service');
const community = require('../services/community.service');
const admin = require('../services/admin.service');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiados intentos. Espera 15 minutos.' },
});

function sendSession(res, result, status = 200) {
  res.cookie('refresh_token', result.refreshToken, cookieOptions());
  res.status(status).json({ ok: true, data: { user: result.user, accessToken: result.accessToken } });
}

function maybeSingle(field) {
  return (req, res, next) => {
    if ((req.headers['content-type'] || '').includes('multipart/form-data')) {
      return upload.single(field)(req, res, next);
    }
    return next();
  };
}

router.get('/salud', async (_req, res) => {
  const db = await checkConnection();
  res.json({
    ok: true,
    data: {
      servicio: 'mercaya-api',
      baseDatos: db.status,
      mensaje: db.message || null,
      modoPago: env.paymentMode,
      envioBase: env.envioBase,
      envioGratisDesde: env.envioGratisDesde,
      vapidPublicKey: canPush() ? env.vapid.publicKey : null,
    },
  });
});

router.get('/openapi.json', (_req, res) => {
  res.json({
    openapi: '3.0.3',
    info: { title: 'MercaYa API', version: '1.0.0' },
    servers: [{ url: '/api/v1' }],
    paths: {
      '/auth/registro': { post: { summary: 'Registro de cliente' } },
      '/auth/ingreso': { post: { summary: 'Inicio de sesión' } },
      '/auth/refrescar': { post: { summary: 'Renovar token de acceso' } },
      '/auth/salir': { post: { summary: 'Cerrar sesión' } },
      '/productos': { get: { summary: 'Catálogo con búsqueda y filtros' } },
      '/pedidos': { post: { summary: 'Checkout' }, get: { summary: 'Historial del cliente' } },
      '/admin/indicadores': { get: { summary: 'Panel del administrador' } },
    },
  });
});

router.post('/auth/registro', async (req, res, next) => {
  try { sendSession(res, await auth.register(req.body), 201); } catch (error) { next(error); }
});
router.post('/auth/ingreso', loginLimiter, async (req, res, next) => {
  try { sendSession(res, await auth.login(req.body)); } catch (error) { next(error); }
});
router.post('/auth/refrescar', async (req, res, next) => {
  try { sendSession(res, await auth.refresh(req.cookies.refresh_token)); } catch (error) { next(error); }
});
router.post('/auth/salir', async (req, res, next) => {
  try {
    await auth.logout(req.cookies.refresh_token);
    res.clearCookie('refresh_token', cookieOptions());
    res.json({ ok: true, message: 'Sesión cerrada' });
  } catch (error) { next(error); }
});
router.post('/auth/recuperar', loginLimiter, async (req, res, next) => {
  try { res.json({ ok: true, ...(await auth.forgotPassword(req.body.email)) }); } catch (error) { next(error); }
});
router.post('/auth/restablecer', async (req, res, next) => {
  try { res.json({ ok: true, ...(await auth.resetPassword(req.body)) }); } catch (error) { next(error); }
});
router.get('/auth/yo', requireAuth, async (req, res, next) => {
  try {
    const user = await auth.findById(req.user.id);
    res.json({ ok: true, data: auth.publicUser(user) });
  } catch (error) { next(error); }
});
router.put('/auth/yo', requireAuth, async (req, res, next) => {
  try { res.json({ ok: true, data: await auth.updateProfile(req.user.id, req.body) }); } catch (error) { next(error); }
});
router.put('/auth/contrasena', requireAuth, async (req, res, next) => {
  try { sendSession(res, await auth.changePassword(req.user.id, req.body)); } catch (error) { next(error); }
});
router.delete('/auth/yo', requireAuth, async (req, res, next) => {
  try {
    const result = await auth.deleteAccount(req.user.id, req.body.password);
    res.clearCookie('refresh_token', cookieOptions());
    res.json({ ok: true, ...result });
  } catch (error) { next(error); }
});
router.post('/auth/avatar', requireAuth, upload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, message: 'Selecciona una imagen' });
    res.json({ ok: true, data: await auth.updateAvatar(req.user.id, publicUrl(req.file.filename)) });
  } catch (error) { next(error); }
});

router.get('/direcciones', requireAuth, async (req, res, next) => {
  try { res.json({ ok: true, data: await account.listAddresses(req.user.id) }); } catch (error) { next(error); }
});
router.post('/direcciones', requireAuth, async (req, res, next) => {
  try { res.status(201).json({ ok: true, data: await account.createAddress(req.user.id, req.body) }); } catch (error) { next(error); }
});
router.put('/direcciones/:id', requireAuth, async (req, res, next) => {
  try { res.json({ ok: true, data: await account.updateAddress(req.user.id, req.params.id, req.body) }); } catch (error) { next(error); }
});
router.delete('/direcciones/:id', requireAuth, async (req, res, next) => {
  try {
    await account.removeAddress(req.user.id, req.params.id);
    res.json({ ok: true, message: 'Dirección eliminada' });
  } catch (error) { next(error); }
});
router.patch('/direcciones/:id/principal', requireAuth, async (req, res, next) => {
  try { res.json({ ok: true, data: await account.markPrincipal(req.user.id, req.params.id) }); } catch (error) { next(error); }
});

router.get('/categorias', async (_req, res, next) => {
  try { res.json({ ok: true, data: await catalog.listCategories() }); } catch (error) { next(error); }
});
router.post('/categorias', requireAuth, requireRole('administrador'), async (req, res, next) => {
  try { res.status(201).json({ ok: true, data: await catalog.createCategory(req.body) }); } catch (error) { next(error); }
});
router.put('/categorias/:id', requireAuth, requireRole('administrador'), async (req, res, next) => {
  try { res.json({ ok: true, data: await catalog.updateCategory(req.params.id, req.body) }); } catch (error) { next(error); }
});
router.delete('/categorias/:id', requireAuth, requireRole('administrador'), async (req, res, next) => {
  try {
    await catalog.removeCategory(req.params.id);
    res.json({ ok: true, message: 'Categoría eliminada' });
  } catch (error) { next(error); }
});

router.get('/productos', optionalAuth, async (req, res, next) => {
  try {
    res.json({ ok: true, data: await catalog.listProducts(req.query, { type: 'public', userId: req.user?.id }) });
  } catch (error) { next(error); }
});
router.get('/productos/:slug', optionalAuth, async (req, res, next) => {
  try { res.json({ ok: true, data: await catalog.getProduct(req.params.slug, req.user) }); } catch (error) { next(error); }
});

router.post('/tiendas', requireAuth, async (req, res, next) => {
  try { res.status(201).json({ ok: true, data: await store.createStore(req.user.id, req.body) }); } catch (error) { next(error); }
});
router.get('/tiendas/mia', requireAuth, async (req, res, next) => {
  try { res.json({ ok: true, data: await store.getMine(req.user.id) }); } catch (error) { next(error); }
});
router.put('/tiendas/mia', requireAuth, maybeSingle('logo'), async (req, res, next) => {
  try {
    const logo = req.file ? publicUrl(req.file.filename) : null;
    res.json({ ok: true, data: await store.updateStore(req.user.id, req.body, logo) });
  } catch (error) { next(error); }
});
router.get('/tiendas/:slug', async (req, res, next) => {
  try { res.json({ ok: true, data: await store.getPublic(req.params.slug) }); } catch (error) { next(error); }
});

router.get('/vendedor/resumen', requireAuth, requireSeller, async (req, res, next) => {
  try { res.json({ ok: true, data: await store.sellerSummary(req.tienda, req.query) }); } catch (error) { next(error); }
});
router.get('/vendedor/productos/:id', requireAuth, requireSeller, async (req, res, next) => {
  try { res.json({ ok: true, data: await catalog.getOwnedProduct(req.tienda.id, req.params.id) }); } catch (error) { next(error); }
});
router.get('/vendedor/productos', requireAuth, requireSeller, async (req, res, next) => {
  try {
    res.json({ ok: true, data: await catalog.listProducts(req.query, { type: 'seller', tiendaId: req.tienda.id, userId: req.user.id }) });
  } catch (error) { next(error); }
});
router.post('/vendedor/productos', requireAuth, requireSeller, async (req, res, next) => {
  try { res.status(201).json({ ok: true, data: await catalog.createProduct(req.tienda, req.body) }); } catch (error) { next(error); }
});
router.put('/vendedor/productos/:id', requireAuth, requireSeller, async (req, res, next) => {
  try { res.json({ ok: true, data: await catalog.updateProduct(req.tienda, req.params.id, req.body) }); } catch (error) { next(error); }
});
router.delete('/vendedor/productos/:id', requireAuth, requireSeller, async (req, res, next) => {
  try {
    await catalog.removeProduct(req.tienda.id, req.params.id);
    res.json({ ok: true, message: 'Producto eliminado' });
  } catch (error) { next(error); }
});
router.patch('/vendedor/productos/:id/estado', requireAuth, requireSeller, async (req, res, next) => {
  try { res.json({ ok: true, data: await catalog.changeSellerStatus(req.tienda, req.params.id, req.body.estado) }); } catch (error) { next(error); }
});
router.post('/vendedor/productos/:id/imagenes', requireAuth, requireSeller, upload.array('imagenes', 6), async (req, res, next) => {
  try { res.json({ ok: true, data: await catalog.addImages(req.tienda.id, req.params.id, req.files) }); } catch (error) { next(error); }
});
router.delete('/vendedor/productos/:id/imagenes/:imageId', requireAuth, requireSeller, async (req, res, next) => {
  try { res.json({ ok: true, data: await catalog.removeImage(req.tienda.id, req.params.id, req.params.imageId) }); } catch (error) { next(error); }
});
router.patch('/vendedor/productos/:id/imagenes/:imageId/principal', requireAuth, requireSeller, async (req, res, next) => {
  try { res.json({ ok: true, data: await catalog.setPrincipalImage(req.tienda.id, req.params.id, req.params.imageId) }); } catch (error) { next(error); }
});
router.get('/vendedor/ventas', requireAuth, requireSeller, async (req, res, next) => {
  try { res.json({ ok: true, data: await commerce.sellerSales(req.tienda.id) }); } catch (error) { next(error); }
});
router.patch('/vendedor/ventas/:id', requireAuth, requireSeller, async (req, res, next) => {
  try { res.json({ ok: true, data: await commerce.updateSale(req.tienda.id, req.params.id, req.body) }); } catch (error) { next(error); }
});
router.get('/vendedor/preguntas', requireAuth, requireSeller, async (req, res, next) => {
  try { res.json({ ok: true, data: await community.sellerQuestions(req.tienda.id) }); } catch (error) { next(error); }
});
router.post('/vendedor/preguntas/:id/responder', requireAuth, requireSeller, async (req, res, next) => {
  try { res.json({ ok: true, data: await community.answerQuestion(req.tienda.id, req.params.id, req.body.respuesta) }); } catch (error) { next(error); }
});

router.get('/carrito', requireAuth, async (req, res, next) => {
  try { res.json({ ok: true, data: await commerce.getCart(req.user.id) }); } catch (error) { next(error); }
});
router.post('/carrito/items', requireAuth, async (req, res, next) => {
  try { res.json({ ok: true, data: await commerce.addItem(req.user.id, req.body.productoId, req.body.cantidad) }); } catch (error) { next(error); }
});
router.patch('/carrito/items/:id', requireAuth, async (req, res, next) => {
  try { res.json({ ok: true, data: await commerce.updateItem(req.user.id, req.params.id, req.body.cantidad) }); } catch (error) { next(error); }
});
router.delete('/carrito/items/:id', requireAuth, async (req, res, next) => {
  try { res.json({ ok: true, data: await commerce.removeItem(req.user.id, req.params.id) }); } catch (error) { next(error); }
});

router.get('/favoritos', requireAuth, async (req, res, next) => {
  try { res.json({ ok: true, data: await commerce.listFavorites(req.user.id) }); } catch (error) { next(error); }
});
router.post('/favoritos/:productoId', requireAuth, async (req, res, next) => {
  try { res.json({ ok: true, data: await commerce.addFavorite(req.user.id, req.params.productoId) }); } catch (error) { next(error); }
});
router.delete('/favoritos/:productoId', requireAuth, async (req, res, next) => {
  try { res.json({ ok: true, data: await commerce.removeFavorite(req.user.id, req.params.productoId) }); } catch (error) { next(error); }
});

router.post('/pedidos', requireAuth, async (req, res, next) => {
  try { res.status(201).json({ ok: true, data: await commerce.checkout(req.user.id, req.body) }); } catch (error) { next(error); }
});
router.get('/pedidos', requireAuth, async (req, res, next) => {
  try { res.json({ ok: true, data: await commerce.listOrders(req.user.id) }); } catch (error) { next(error); }
});
router.get('/pedidos/:codigo', requireAuth, async (req, res, next) => {
  try { res.json({ ok: true, data: await commerce.getOrder(req.user.id, req.params.codigo) }); } catch (error) { next(error); }
});
router.post('/pedidos/:codigo/cancelar', requireAuth, async (req, res, next) => {
  try { res.json({ ok: true, data: await commerce.cancelOrder(req.user.id, req.params.codigo) }); } catch (error) { next(error); }
});

router.post('/resenas', requireAuth, async (req, res, next) => {
  try { res.status(201).json({ ok: true, ...(await community.createReview(req.user.id, req.body)) }); } catch (error) { next(error); }
});
router.post('/productos/:id/preguntas', requireAuth, async (req, res, next) => {
  try { res.status(201).json({ ok: true, data: await community.askQuestion(req.user.id, Number(req.params.id), req.body.pregunta) }); } catch (error) { next(error); }
});
router.post('/reportes', requireAuth, async (req, res, next) => {
  try { res.status(201).json({ ok: true, ...(await community.createReport(req.user.id, req.body)) }); } catch (error) { next(error); }
});

router.get('/notificaciones', requireAuth, async (req, res, next) => {
  try { res.json({ ok: true, data: await community.listNotifications(req.user.id) }); } catch (error) { next(error); }
});
router.patch('/notificaciones/:id/leida', requireAuth, async (req, res, next) => {
  try { res.json({ ok: true, data: await community.markRead(req.user.id, req.params.id) }); } catch (error) { next(error); }
});
router.post('/notificaciones/leer-todas', requireAuth, async (req, res, next) => {
  try { res.json({ ok: true, data: await community.markAllRead(req.user.id) }); } catch (error) { next(error); }
});
router.post('/push/suscribir', requireAuth, async (req, res, next) => {
  try { res.json({ ok: true, data: await community.subscribePush(req.user.id, req.body, req.headers['user-agent']) }); } catch (error) { next(error); }
});
router.delete('/push/suscribir', requireAuth, async (req, res, next) => {
  try {
    await community.unsubscribePush(req.user.id, req.body.endpoint);
    res.json({ ok: true, message: 'Notificaciones desactivadas' });
  } catch (error) { next(error); }
});

router.get('/admin/indicadores', requireAuth, requireRole('administrador'), async (req, res, next) => {
  try { res.json({ ok: true, data: await admin.indicators(req.query) }); } catch (error) { next(error); }
});
router.get('/admin/usuarios', requireAuth, requireRole('administrador'), async (req, res, next) => {
  try { res.json({ ok: true, data: await admin.listUsers(req.query) }); } catch (error) { next(error); }
});
router.patch('/admin/usuarios/:id', requireAuth, requireRole('administrador'), async (req, res, next) => {
  try { res.json({ ok: true, data: await admin.updateUser(req.user.id, req.params.id, req.body) }); } catch (error) { next(error); }
});
router.get('/admin/tiendas', requireAuth, requireRole('administrador'), async (req, res, next) => {
  try { res.json({ ok: true, data: await store.listStores(req.query) }); } catch (error) { next(error); }
});
router.patch('/admin/tiendas/:id', requireAuth, requireRole('administrador'), async (req, res, next) => {
  try { res.json({ ok: true, data: await store.setStoreStatus(req.user.id, req.params.id, req.body) }); } catch (error) { next(error); }
});
router.get('/admin/productos', requireAuth, requireRole('administrador'), async (req, res, next) => {
  try { res.json({ ok: true, data: await catalog.listProducts(req.query, { type: 'admin', userId: req.user.id }) }); } catch (error) { next(error); }
});
router.patch('/admin/productos/:id', requireAuth, requireRole('administrador'), async (req, res, next) => {
  try { res.json({ ok: true, data: await catalog.moderateProduct(req.params.id, req.body) }); } catch (error) { next(error); }
});
router.get('/admin/reportes', requireAuth, requireRole('administrador'), async (req, res, next) => {
  try { res.json({ ok: true, data: await admin.listReports() }); } catch (error) { next(error); }
});
router.patch('/admin/reportes/:id', requireAuth, requireRole('administrador'), async (req, res, next) => {
  try { res.json({ ok: true, data: await admin.resolveReport(req.user.id, req.params.id, req.body) }); } catch (error) { next(error); }
});
router.get('/admin/pedidos', requireAuth, requireRole('administrador'), async (req, res, next) => {
  try { res.json({ ok: true, data: await admin.listAllOrders(req.query) }); } catch (error) { next(error); }
});
router.get('/admin/ventas.csv', requireAuth, requireRole('administrador'), async (req, res, next) => {
  try {
    const csv = await admin.salesCsv(req.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(csv);
  } catch (error) { next(error); }
});

module.exports = router;
