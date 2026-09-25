const { z } = require('zod');
const env = require('../config/env');
const { query, withTransaction } = require('../config/db');
const { badRequest, notFound, conflict, forbidden } = require('../utils/http');
const { summarize, unitPrice, orderCode } = require('../utils/pricing');
const { notify } = require('../utils/notify');
const { sendMail } = require('../utils/mailer');

function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) throw badRequest(result.error.issues.map((issue) => issue.message).join('. '));
  return result.data;
}

async function ensureCart(usuarioId) {
  const rows = await query('SELECT id FROM carritos WHERE usuario_id = ?', [usuarioId]);
  if (rows[0]) return rows[0];
  try {
    const result = await query('INSERT INTO carritos (usuario_id) VALUES (?)', [usuarioId]);
    return { id: result.insertId };
  } catch (error) {
    if (error.code !== 'ER_DUP_ENTRY') throw error;
    const again = await query('SELECT id FROM carritos WHERE usuario_id = ?', [usuarioId]);
    return again[0];
  }
}

async function getCart(usuarioId) {
  const cart = await ensureCart(usuarioId);
  const items = await query(
    `SELECT ci.id, ci.producto_id AS productoId, ci.cantidad, p.nombre, p.slug, p.precio, p.precio_oferta AS precioOferta,
            p.stock, p.estado, t.estado AS tiendaEstado, t.nombre AS tienda,
            (SELECT i.url FROM producto_imagenes i WHERE i.producto_id = p.id
             ORDER BY i.es_principal DESC, i.orden ASC LIMIT 1) AS imagen
     FROM carrito_items ci
     JOIN productos p ON p.id = ci.producto_id
     JOIN tiendas t ON t.id = p.tienda_id
     WHERE ci.carrito_id = ?
     ORDER BY ci.agregado_en DESC`,
    [cart.id]
  );
  const available = items.filter((item) => item.estado === 'publicado' && item.tiendaEstado === 'aprobada' && item.stock > 0);
  const totals = summarize(available.map((item) => ({
    precio: item.precio,
    precio_oferta: item.precioOferta,
    cantidad: Math.min(item.cantidad, item.stock),
  })), { envioBase: env.envioBase, envioGratisDesde: env.envioGratisDesde });
  return {
    items: items.map((item) => ({
      ...item,
      precio: Number(item.precio),
      precioOferta: item.precioOferta == null ? null : Number(item.precioOferta),
      disponible: item.estado === 'publicado' && item.tiendaEstado === 'aprobada' && item.stock > 0,
      agotado: item.stock <= 0,
    })),
    ...totals,
  };
}

async function addItem(usuarioId, productoId, cantidad = 1) {
  const qty = Number(cantidad) || 1;
  if (qty < 1) throw badRequest('La cantidad debe ser mayor que 0');
  const products = await query(
    `SELECT p.stock, p.estado, t.estado AS tiendaEstado
     FROM productos p JOIN tiendas t ON t.id = p.tienda_id WHERE p.id = ?`,
    [productoId]
  );
  const product = products[0];
  if (!product || product.estado !== 'publicado' || product.tiendaEstado !== 'aprobada') {
    throw notFound('Producto no disponible');
  }
  if (product.stock <= 0) throw conflict('Agotado');
  const cart = await ensureCart(usuarioId);
  const existing = await query(
    'SELECT id, cantidad FROM carrito_items WHERE carrito_id = ? AND producto_id = ?',
    [cart.id, productoId]
  );
  const next = (existing[0]?.cantidad || 0) + qty;
  if (next > product.stock) throw conflict('No puedes superar el stock disponible');
  if (existing[0]) await query('UPDATE carrito_items SET cantidad = ? WHERE id = ?', [next, existing[0].id]);
  else await query('INSERT INTO carrito_items (carrito_id, producto_id, cantidad) VALUES (?, ?, ?)', [cart.id, productoId, qty]);
  return getCart(usuarioId);
}

async function updateItem(usuarioId, itemId, cantidad) {
  const qty = Number(cantidad);
  if (!Number.isInteger(qty) || qty < 1) throw badRequest('La cantidad debe ser mayor que 0');
  const rows = await query(
    `SELECT ci.id, p.stock
     FROM carrito_items ci
     JOIN carritos c ON c.id = ci.carrito_id
     JOIN productos p ON p.id = ci.producto_id
     WHERE ci.id = ? AND c.usuario_id = ?`,
    [itemId, usuarioId]
  );
  if (!rows[0]) throw notFound('El producto no está en el carrito');
  if (qty > rows[0].stock) throw conflict('No puedes superar el stock disponible');
  await query('UPDATE carrito_items SET cantidad = ? WHERE id = ?', [qty, itemId]);
  return getCart(usuarioId);
}

async function removeItem(usuarioId, itemId) {
  const result = await query(
    `DELETE ci FROM carrito_items ci
     JOIN carritos c ON c.id = ci.carrito_id
     WHERE ci.id = ? AND c.usuario_id = ?`,
    [itemId, usuarioId]
  );
  if (!result.affectedRows) throw notFound('El producto no está en el carrito');
  return getCart(usuarioId);
}

async function listFavorites(usuarioId) {
  const rows = await query(
    `SELECT p.id, p.nombre, p.slug, p.precio, p.precio_oferta AS precioOferta, p.stock, p.estado,
            COALESCE(p.precio_oferta, p.precio) AS precioFinal, t.nombre AS tienda,
            (SELECT i.url FROM producto_imagenes i WHERE i.producto_id = p.id
             ORDER BY i.es_principal DESC, i.orden ASC LIMIT 1) AS imagen
     FROM favoritos f
     JOIN productos p ON p.id = f.producto_id
     JOIN tiendas t ON t.id = p.tienda_id
     WHERE f.usuario_id = ?
     ORDER BY f.created_at DESC`,
    [usuarioId]
  );
  return rows.map((row) => ({
    ...row,
    precio: Number(row.precio),
    precioOferta: row.precioOferta == null ? null : Number(row.precioOferta),
    precioFinal: Number(row.precioFinal),
    agotado: row.stock <= 0 || row.estado !== 'publicado',
  }));
}

async function addFavorite(usuarioId, productoId) {
  const products = await query('SELECT id FROM productos WHERE id = ?', [productoId]);
  if (!products[0]) throw notFound('Producto no encontrado');
  await query('INSERT IGNORE INTO favoritos (usuario_id, producto_id) VALUES (?, ?)', [usuarioId, productoId]);
  return { esFavorito: true };
}

async function removeFavorite(usuarioId, productoId) {
  await query('DELETE FROM favoritos WHERE usuario_id = ? AND producto_id = ?', [usuarioId, productoId]);
  return { esFavorito: false };
}

function paymentResult(metodo) {
  if (metodo === 'contraentrega') {
    return { pagoEstado: 'pendiente', pedidoEstado: 'pendiente_pago', proveedor: null };
  }
  if (env.paymentMode === 'demo') {
    return { pagoEstado: 'aprobado', pedidoEstado: 'pagado', proveedor: 'demo' };
  }
  const error = new Error('La pasarela de pagos aún no está configurada. Puedes pagar contraentrega.');
  error.status = 501;
  throw error;
}

async function checkout(usuarioId, body) {
  const data = parse(z.object({
    direccionId: z.coerce.number().int().positive(),
    metodo: z.enum(['tarjeta', 'pse', 'nequi', 'daviplata', 'contraentrega', 'transferencia']),
    telefono: z.string().trim().min(7).max(20),
    notas: z.string().trim().max(255).optional().or(z.literal('')),
  }), body);
  const payment = paymentResult(data.metodo);

  const codigo = await withTransaction(async (connection) => {
    const [addresses] = await connection.query(
      'SELECT * FROM direcciones WHERE id = ? AND usuario_id = ?',
      [data.direccionId, usuarioId]
    );
    const address = addresses[0];
    if (!address) throw badRequest('Selecciona una dirección de envío');

    const [carts] = await connection.query('SELECT id FROM carritos WHERE usuario_id = ? FOR UPDATE', [usuarioId]);
    if (!carts[0]) throw badRequest('Tu carrito está vacío');
    const [items] = await connection.query(
      `SELECT ci.producto_id, ci.cantidad, p.nombre, p.precio, p.precio_oferta, p.stock, p.estado,
              p.tienda_id, t.estado AS tienda_estado, t.usuario_id AS vendedor_id
       FROM carrito_items ci
       JOIN productos p ON p.id = ci.producto_id
       JOIN tiendas t ON t.id = p.tienda_id
       WHERE ci.carrito_id = ?
       FOR UPDATE`,
      [carts[0].id]
    );
    if (!items.length) throw badRequest('Tu carrito está vacío');
    for (const item of items) {
      if (item.estado !== 'publicado' || item.tienda_estado !== 'aprobada') {
        throw conflict(`${item.nombre} ya no está disponible`);
      }
      if (item.cantidad > item.stock) throw conflict(`${item.nombre} no tiene stock suficiente`);
    }
    const totals = summarize(items, { envioBase: env.envioBase, envioGratisDesde: env.envioGratisDesde });
    const direccionEnvio = [address.direccion, address.barrio, address.municipio, address.departamento].filter(Boolean).join(', ');
    const [pedido] = await connection.query(
      `INSERT INTO pedidos (codigo, cliente_id, direccion_id, direccion_envio, municipio_envio, telefono_contacto,
                            subtotal, costo_envio, descuento, total, estado, notas)
       VALUES ('TMP', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [usuarioId, address.id, direccionEnvio.slice(0, 255), address.municipio, data.telefono, totals.subtotal, totals.costoEnvio, totals.descuento, totals.total, payment.pedidoEstado, data.notas || null]
    );
    const code = orderCode(pedido.insertId);
    await connection.query('UPDATE pedidos SET codigo = ? WHERE id = ?', [code, pedido.insertId]);
    const low = [];
    for (const item of items) {
      const price = unitPrice(item.precio, item.precio_oferta);
      const [stockUpdate] = await connection.query(
        'UPDATE productos SET stock = stock - ? WHERE id = ? AND stock >= ?',
        [item.cantidad, item.producto_id, item.cantidad]
      );
      if (!stockUpdate.affectedRows) throw conflict(`${item.nombre} no tiene stock suficiente`);
      await connection.query(
        `INSERT INTO detalle_pedido (pedido_id, producto_id, tienda_id, nombre_producto, cantidad, precio_unitario, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [pedido.insertId, item.producto_id, item.tienda_id, item.nombre, item.cantidad, price, price * item.cantidad]
      );
      if (item.stock - item.cantidad <= 3) low.push({ vendedorId: item.vendedor_id, nombre: item.nombre, stock: item.stock - item.cantidad });
    }
    await connection.query(
      `INSERT INTO pagos (pedido_id, metodo, proveedor, monto, estado, pagado_en)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [pedido.insertId, data.metodo, payment.proveedor, totals.total, payment.pagoEstado, payment.pagoEstado === 'aprobado' ? new Date() : null]
    );
    await connection.query('DELETE FROM carrito_items WHERE carrito_id = ?', [carts[0].id]);
    return { code, totals, low, items };
  });

  const user = await query('SELECT email, nombres FROM usuarios WHERE id = ?', [usuarioId]);
  await notify(usuarioId, 'pedido', 'Pedido confirmado', `Tu pedido ${codigo.code} fue registrado.`, `/cuenta/pedidos/${codigo.code}`);
  await sendMail({
    to: user[0].email,
    subject: `Pedido ${codigo.code} en MercaYa`,
    text: `Hola ${user[0].nombres}, recibimos tu pedido ${codigo.code} por ${codigo.totals.total} COP. Método: ${data.metodo}.`,
  });
  const sellers = new Set(codigo.items.map((item) => item.vendedor_id));
  for (const sellerId of sellers) {
    await notify(sellerId, 'pedido', 'Nueva venta', `Tienes productos en el pedido ${codigo.code}.`, '/vendedor/ventas');
  }
  for (const item of codigo.low) {
    await notify(item.vendedorId, 'producto', 'Stock bajo', `${item.nombre} quedó con ${item.stock} unidades.`, '/vendedor/productos');
  }
  return { codigo: codigo.code, ...codigo.totals, estado: payment.pedidoEstado, metodo: data.metodo, modoPago: env.paymentMode };
}

function mapOrder(row, items) {
  return {
    id: row.id,
    codigo: row.codigo,
    direccionEnvio: row.direccion_envio,
    municipioEnvio: row.municipio_envio,
    telefono: row.telefono_contacto,
    subtotal: Number(row.subtotal),
    costoEnvio: Number(row.costo_envio),
    descuento: Number(row.descuento),
    total: Number(row.total),
    estado: row.estado,
    notas: row.notas,
    createdAt: row.created_at,
    metodoPago: row.metodo || null,
    estadoPago: row.estado_pago || null,
    items,
  };
}

async function listOrders(usuarioId) {
  const rows = await query(
    `SELECT p.*, pg.metodo, pg.estado AS estado_pago
     FROM pedidos p
     LEFT JOIN pagos pg ON pg.pedido_id = p.id
     WHERE p.cliente_id = ?
     ORDER BY p.created_at DESC`,
    [usuarioId]
  );
  return Promise.all(rows.map(async (row) => {
    const items = await query(
      `SELECT id, nombre_producto AS nombre, cantidad, precio_unitario AS precioUnitario, subtotal, estado_item AS estado, guia_envio AS guia
       FROM detalle_pedido WHERE pedido_id = ?`,
      [row.id]
    );
    return mapOrder(row, items);
  }));
}

async function getOrder(usuarioId, codigo) {
  const rows = await query(
    `SELECT p.*, pg.metodo, pg.estado AS estado_pago
     FROM pedidos p LEFT JOIN pagos pg ON pg.pedido_id = p.id
     WHERE p.codigo = ? AND p.cliente_id = ?`,
    [codigo, usuarioId]
  );
  if (!rows[0]) throw notFound('Pedido no encontrado');
  const items = await query(
    `SELECT d.id, d.nombre_producto AS nombre, d.cantidad, d.precio_unitario AS precioUnitario, d.subtotal,
            d.estado_item AS estado, d.guia_envio AS guia, d.producto_id AS productoId, pr.slug, t.nombre AS tienda
     FROM detalle_pedido d
     LEFT JOIN productos pr ON pr.id = d.producto_id
     JOIN tiendas t ON t.id = d.tienda_id
     WHERE d.pedido_id = ?`,
    [rows[0].id]
  );
  return mapOrder(rows[0], items);
}

async function cancelOrder(usuarioId, codigo) {
  const order = await getOrder(usuarioId, codigo);
  await withTransaction(async (connection) => {
    const [blocked] = await connection.query(
      `SELECT id FROM detalle_pedido WHERE pedido_id = ? AND estado_item IN ('enviado', 'entregado') LIMIT 1`,
      [order.id]
    );
    if (blocked.length) throw forbidden('No puedes cancelar un pedido que ya fue enviado');
    if (order.estado === 'cancelado') throw conflict('El pedido ya está cancelado');
    const [items] = await connection.query('SELECT producto_id, cantidad FROM detalle_pedido WHERE pedido_id = ?', [order.id]);
    for (const item of items) {
      if (item.producto_id) {
        await connection.query('UPDATE productos SET stock = stock + ? WHERE id = ?', [item.cantidad, item.producto_id]);
      }
    }
    await connection.query("UPDATE detalle_pedido SET estado_item = 'cancelado' WHERE pedido_id = ?", [order.id]);
    await connection.query("UPDATE pedidos SET estado = 'cancelado' WHERE id = ?", [order.id]);
    await connection.query("UPDATE pagos SET estado = 'rechazado' WHERE pedido_id = ? AND estado = 'pendiente'", [order.id]);
  });
  await notify(usuarioId, 'pedido', 'Pedido cancelado', `Cancelaste el pedido ${codigo}.`, `/cuenta/pedidos/${codigo}`);
  return getOrder(usuarioId, codigo);
}

async function sellerSales(tiendaId) {
  return query(
    `SELECT d.id, d.nombre_producto AS nombre, d.cantidad, d.precio_unitario AS precioUnitario, d.subtotal,
            d.estado_item AS estado, d.guia_envio AS guia, p.codigo, p.created_at AS createdAt,
            p.municipio_envio AS municipio, p.direccion_envio AS direccion, u.nombres, u.apellidos, p.telefono_contacto AS telefono
     FROM detalle_pedido d
     JOIN pedidos p ON p.id = d.pedido_id
     JOIN usuarios u ON u.id = p.cliente_id
     WHERE d.tienda_id = ?
     ORDER BY p.created_at DESC`,
    [tiendaId]
  );
}

async function updateSale(tiendaId, detalleId, body) {
  const data = parse(z.object({
    estado: z.enum(['en_preparacion', 'enviado', 'entregado']),
    guia: z.string().trim().max(60).optional().or(z.literal('')),
  }), body);
  if (data.estado === 'enviado' && !data.guia) throw badRequest('Registra el número de guía para marcar el envío');

  const result = await withTransaction(async (connection) => {
    const [rows] = await connection.query(
      `SELECT d.*, p.cliente_id, p.codigo, p.estado AS pedido_estado
       FROM detalle_pedido d JOIN pedidos p ON p.id = d.pedido_id
       WHERE d.id = ? AND d.tienda_id = ? FOR UPDATE`,
      [detalleId, tiendaId]
    );
    const item = rows[0];
    if (!item) throw notFound('Venta no encontrada');
    if (item.pedido_estado === 'cancelado' || item.estado_item === 'cancelado') throw conflict('El pedido está cancelado');
    const next = {
      pendiente: 'en_preparacion',
      en_preparacion: 'enviado',
      enviado: 'entregado',
    };
    if (next[item.estado_item] !== data.estado) throw badRequest('Ese cambio de estado no está permitido');
    await connection.query(
      'UPDATE detalle_pedido SET estado_item = ?, guia_envio = COALESCE(?, guia_envio) WHERE id = ?',
      [data.estado, data.guia || null, detalleId]
    );
    const [states] = await connection.query('SELECT estado_item FROM detalle_pedido WHERE pedido_id = ?', [item.pedido_id]);
    const values = states.map((row) => row.estado_item);
    let pedidoEstado = 'pagado';
    if (values.every((value) => value === 'cancelado')) pedidoEstado = 'cancelado';
    else if (values.every((value) => value === 'entregado' || value === 'cancelado')) pedidoEstado = 'entregado';
    else if (values.some((value) => value === 'enviado')) pedidoEstado = 'enviado';
    else if (values.some((value) => value === 'en_preparacion')) pedidoEstado = 'en_preparacion';
    await connection.query('UPDATE pedidos SET estado = ? WHERE id = ?', [pedidoEstado, item.pedido_id]);
    return item;
  });

  const labels = { en_preparacion: 'en preparación', enviado: 'enviado', entregado: 'entregado' };
  await notify(
    result.cliente_id,
    'pedido',
    'Actualización de tu pedido',
    `${result.nombre_producto} está ${labels[data.estado]}.`,
    `/cuenta/pedidos/${result.codigo}`
  );
  return sellerSales(tiendaId);
}

module.exports = {
  getCart,
  addItem,
  updateItem,
  removeItem,
  listFavorites,
  addFavorite,
  removeFavorite,
  checkout,
  listOrders,
  getOrder,
  cancelOrder,
  sellerSales,
  updateSale,
};
