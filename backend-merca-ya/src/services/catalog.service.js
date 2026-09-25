const { z } = require('zod');
const { query, withTransaction } = require('../config/db');
const { badRequest, notFound, forbidden, conflict } = require('../utils/http');
const { slugify, likeTerm } = require('../utils/slug');
const { notify, notifyAdmins } = require('../utils/notify');

function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) throw badRequest(result.error.issues.map((issue) => issue.message).join('. '));
  return result.data;
}

async function uniqueSlug(table, text, ignoreId = null) {
  const allowed = ['productos', 'categorias', 'tiendas'];
  if (!allowed.includes(table)) throw new Error('Tabla no permitida');
  const base = slugify(text) || 'item';
  let slug = base;
  let index = 2;
  while (true) {
    const rows = await query(`SELECT id FROM ${table} WHERE slug = ?`, [slug]);
    if (!rows.length || (ignoreId && rows[0].id === ignoreId)) return slug;
    slug = `${base.slice(0, 140)}-${index++}`;
  }
}

function mapCategory(row) {
  return {
    id: row.id,
    padreId: row.padre_id,
    nombre: row.nombre,
    slug: row.slug,
    descripcion: row.descripcion,
    icono: row.icono,
    activa: Boolean(row.activa),
  };
}

function mapProduct(row) {
  const precio = Number(row.precio);
  const precioOferta = row.precio_oferta == null ? null : Number(row.precio_oferta);
  return {
    id: row.id,
    nombre: row.nombre,
    slug: row.slug,
    descripcion: row.descripcion ?? undefined,
    precio,
    precioOferta,
    precioFinal: Number(row.precio_final ?? precioOferta ?? precio),
    stock: Number(row.stock),
    sku: row.sku,
    condicion: row.condicion,
    estado: row.estado,
    motivoRechazo: row.motivo_rechazo,
    vistas: Number(row.vistas || 0),
    calificacion: Number(row.calificacion_promedio || 0),
    imagen: row.imagen || null,
    esFavorito: Boolean(row.es_favorito),
    agotado: Number(row.stock) <= 0,
    categoria: row.categoria ? { id: row.categoria_id, nombre: row.categoria, slug: row.categoria_slug } : undefined,
    tienda: row.tienda ? {
      id: row.tienda_id,
      nombre: row.tienda,
      slug: row.tienda_slug,
      municipio: row.municipio,
      logoUrl: row.logo_url || null,
      calificacion: row.tienda_calificacion == null ? undefined : Number(row.tienda_calificacion),
    } : undefined,
    createdAt: row.created_at,
  };
}

async function listCategories() {
  const rows = await query('SELECT * FROM categorias ORDER BY padre_id IS NOT NULL, nombre');
  return rows.map(mapCategory);
}

const categorySchema = z.object({
  nombre: z.string().trim().min(2).max(80),
  descripcion: z.string().trim().max(255).optional().or(z.literal('')),
  icono: z.string().trim().max(60).optional().or(z.literal('')),
  padreId: z.coerce.number().int().positive().optional().nullable(),
  activa: z.boolean().optional(),
});

async function createCategory(body) {
  const data = parse(categorySchema, body);
  if (data.padreId) {
    const parent = await query('SELECT id FROM categorias WHERE id = ?', [data.padreId]);
    if (!parent[0]) throw badRequest('La categoría padre no existe');
  }
  const slug = await uniqueSlug('categorias', data.nombre);
  const result = await query(
    `INSERT INTO categorias (padre_id, nombre, slug, descripcion, icono, activa)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.padreId || null, data.nombre, slug, data.descripcion || null, data.icono || null, data.activa === false ? 0 : 1]
  );
  const rows = await query('SELECT * FROM categorias WHERE id = ?', [result.insertId]);
  return mapCategory(rows[0]);
}

async function updateCategory(id, body) {
  const current = await query('SELECT * FROM categorias WHERE id = ?', [id]);
  if (!current[0]) throw notFound('Categoría no encontrada');
  const data = parse(categorySchema, body);
  if (data.padreId && Number(data.padreId) === Number(id)) throw badRequest('Una categoría no puede ser su propio padre');
  const slug = current[0].nombre === data.nombre ? current[0].slug : await uniqueSlug('categorias', data.nombre, Number(id));
  await query(
    `UPDATE categorias SET padre_id = ?, nombre = ?, slug = ?, descripcion = ?, icono = ?, activa = ? WHERE id = ?`,
    [data.padreId || null, data.nombre, slug, data.descripcion || null, data.icono || null, data.activa === false ? 0 : 1, id]
  );
  const rows = await query('SELECT * FROM categorias WHERE id = ?', [id]);
  return mapCategory(rows[0]);
}

async function removeCategory(id) {
  const products = await query('SELECT id FROM productos WHERE categoria_id = ? LIMIT 1', [id]);
  const children = await query('SELECT id FROM categorias WHERE padre_id = ? LIMIT 1', [id]);
  if (products.length || children.length) {
    throw conflict('No puedes eliminar una categoría con productos o subcategorías. Desactívala.');
  }
  const result = await query('DELETE FROM categorias WHERE id = ?', [id]);
  if (!result.affectedRows) throw notFound('Categoría no encontrada');
}

const productSchema = z.object({
  nombre: z.string().trim().min(3).max(150),
  descripcion: z.string().trim().max(5000).optional().or(z.literal('')),
  categoriaId: z.coerce.number().int().positive(),
  precio: z.coerce.number().positive('El precio debe ser mayor que 0'),
  precioOferta: z.union([z.coerce.number().nonnegative(), z.literal(''), z.null()]).optional(),
  stock: z.coerce.number().int().nonnegative(),
  sku: z.string().trim().max(50).optional().or(z.literal('')),
  condicion: z.enum(['nuevo', 'usado', 'reacondicionado']).default('nuevo'),
});

function offerValue(precio, precioOferta) {
  if (precioOferta == null || precioOferta === '') return null;
  const offer = Number(precioOferta);
  if (Number.isNaN(offer)) throw badRequest('Precio de oferta inválido');
  if (offer >= Number(precio)) throw badRequest('El precio de oferta debe ser menor que el precio normal');
  return offer;
}

async function listProducts(filters, scope) {
  const page = Math.max(1, parseInt(filters.page || '1', 10) || 1);
  const limit = Math.min(48, Math.max(1, parseInt(filters.limit || '12', 10) || 12));
  const offset = (page - 1) * limit;
  const where = [];
  const params = [];

  if (scope.type === 'public') {
    where.push("p.estado = 'publicado'", "t.estado = 'aprobada'", 'c.activa = 1');
  } else if (scope.type === 'seller') {
    where.push('p.tienda_id = ?');
    params.push(scope.tiendaId);
  } else if (filters.estado) {
    where.push('p.estado = ?');
    params.push(filters.estado);
  }

  const q = String(filters.q || '').trim();
  if (q) {
    where.push(`(p.nombre LIKE ? ESCAPE '\\\\' OR IFNULL(p.descripcion, '') LIKE ? ESCAPE '\\\\' OR MATCH(p.nombre, p.descripcion) AGAINST (? IN NATURAL LANGUAGE MODE))`);
    const like = likeTerm(q);
    params.push(like, like, q);
  }
  if (filters.categoria) {
    const asId = /^\d+$/.test(String(filters.categoria)) ? Number(filters.categoria) : 0;
    where.push(`(
      c.slug = ? OR c.id = ? OR c.padre_id = (
        SELECT id FROM (SELECT id FROM categorias WHERE slug = ? OR id = ? LIMIT 1) padre
      )
    )`);
    params.push(filters.categoria, asId, filters.categoria, asId);
  }
  if (filters.precioMin) {
    where.push('COALESCE(p.precio_oferta, p.precio) >= ?');
    params.push(Number(filters.precioMin));
  }
  if (filters.precioMax) {
    where.push('COALESCE(p.precio_oferta, p.precio) <= ?');
    params.push(Number(filters.precioMax));
  }
  if (['nuevo', 'usado', 'reacondicionado'].includes(filters.condicion)) {
    where.push('p.condicion = ?');
    params.push(filters.condicion);
  }
  if (filters.municipio) {
    where.push("t.municipio LIKE ? ESCAPE '\\\\'");
    params.push(likeTerm(filters.municipio));
  }
  if (filters.calificacion) {
    where.push('p.calificacion_promedio >= ?');
    params.push(Number(filters.calificacion));
  }
  if (filters.tienda) {
    where.push('t.slug = ?');
    params.push(filters.tienda);
  }

  const orders = {
    recientes: 'p.created_at DESC',
    precio_asc: 'precio_final ASC',
    precio_desc: 'precio_final DESC',
    calificacion: 'p.calificacion_promedio DESC',
  };
  let orderSql = orders[filters.orden] || (q ? 'p.created_at DESC' : 'p.created_at DESC');
  const dataParams = params.slice();
  if (filters.orden === 'relevancia' && q) {
    orderSql = `(p.nombre LIKE ? ESCAPE '\\\\') DESC, p.created_at DESC`;
    dataParams.push(likeTerm(q));
  }

  const userId = scope.userId || 0;
  const whereSql = where.length ? where.join(' AND ') : '1=1';
  const from = `FROM productos p
    JOIN categorias c ON c.id = p.categoria_id
    JOIN tiendas t ON t.id = p.tienda_id`;
  const rows = await query(
    `SELECT p.id, p.nombre, p.slug, p.precio, p.precio_oferta,
            COALESCE(p.precio_oferta, p.precio) AS precio_final,
            p.stock, p.condicion, p.estado, p.motivo_rechazo, p.vistas, p.calificacion_promedio, p.created_at,
            c.id AS categoria_id, c.nombre AS categoria, c.slug AS categoria_slug,
            t.id AS tienda_id, t.nombre AS tienda, t.slug AS tienda_slug, t.municipio,
            (SELECT i.url FROM producto_imagenes i WHERE i.producto_id = p.id
             ORDER BY i.es_principal DESC, i.orden ASC LIMIT 1) AS imagen,
            EXISTS(SELECT 1 FROM favoritos f WHERE f.usuario_id = ? AND f.producto_id = p.id) AS es_favorito
     ${from}
     WHERE ${whereSql}
     ORDER BY ${orderSql}
     LIMIT ${limit} OFFSET ${offset}`,
    [userId, ...dataParams]
  );
  const totalRows = await query(`SELECT COUNT(*) AS total ${from} WHERE ${whereSql}`, params);
  return {
    items: rows.map(mapProduct),
    page,
    limit,
    total: Number(totalRows[0].total),
  };
}

async function getProduct(slug, user) {
  const rows = await query(
    `SELECT p.*, c.nombre AS categoria, c.slug AS categoria_slug, c.activa AS categoria_activa,
            t.nombre AS tienda, t.slug AS tienda_slug, t.municipio, t.estado AS tienda_estado,
            t.usuario_id AS vendedor_id, t.logo_url, t.calificacion_promedio AS tienda_calificacion,
            COALESCE(p.precio_oferta, p.precio) AS precio_final,
            EXISTS(SELECT 1 FROM favoritos f WHERE f.usuario_id = ? AND f.producto_id = p.id) AS es_favorito
     FROM productos p
     JOIN categorias c ON c.id = p.categoria_id
     JOIN tiendas t ON t.id = p.tienda_id
     WHERE p.slug = ?`,
    [user?.id || 0, slug]
  );
  const row = rows[0];
  if (!row) throw notFound('Producto no encontrado');
  const visible = row.estado === 'publicado' && row.tienda_estado === 'aprobada' && row.categoria_activa;
  const owns = user && (user.rol === 'administrador' || user.id === row.vendedor_id);
  if (!visible && !owns) throw notFound('Producto no encontrado');
  if (visible) await query('UPDATE productos SET vistas = vistas + 1 WHERE id = ?', [row.id]);

  const imagenes = await query(
    'SELECT id, url, orden, es_principal AS esPrincipal FROM producto_imagenes WHERE producto_id = ? ORDER BY es_principal DESC, orden ASC',
    [row.id]
  );
  const resenas = await query(
    `SELECT r.id, r.calificacion, r.comentario, r.created_at AS createdAt, u.nombres
     FROM resenas r JOIN usuarios u ON u.id = r.cliente_id
     WHERE r.producto_id = ? AND r.visible = 1
     ORDER BY r.created_at DESC LIMIT 20`,
    [row.id]
  );
  const preguntas = await query(
    `SELECT q.id, q.pregunta, q.respuesta, q.respondida_en AS respondidaEn, q.created_at AS createdAt, u.nombres
     FROM preguntas_producto q JOIN usuarios u ON u.id = q.cliente_id
     WHERE q.producto_id = ?
     ORDER BY q.created_at DESC`,
    [row.id]
  );
  const product = mapProduct({ ...row, imagen: imagenes[0]?.url || null });
  product.imagenes = imagenes.map((image) => ({ ...image, esPrincipal: Boolean(image.esPrincipal) }));
  product.resenas = resenas;
  product.preguntas = preguntas;
  return product;
}

async function assertCategory(categoriaId) {
  const rows = await query('SELECT id, activa FROM categorias WHERE id = ?', [categoriaId]);
  if (!rows[0] || !rows[0].activa) throw badRequest('Selecciona una categoría activa');
}

async function createProduct(tienda, body) {
  const data = parse(productSchema, body);
  await assertCategory(data.categoriaId);
  const oferta = offerValue(data.precio, data.precioOferta);
  const slug = await uniqueSlug('productos', data.nombre);
  const result = await query(
    `INSERT INTO productos (tienda_id, categoria_id, nombre, slug, descripcion, precio, precio_oferta, stock, sku, condicion, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')`,
    [tienda.id, data.categoriaId, data.nombre, slug, data.descripcion || null, data.precio, oferta, data.stock, data.sku || null, data.condicion]
  );
  await notify(tienda.usuario_id, 'producto', 'Producto en revisión', `${data.nombre} quedó pendiente de aprobación.`, '/vendedor/productos');
  await notifyAdmins('producto', 'Producto por moderar', data.nombre, '/admin/productos');
  return getOwnedProduct(tienda.id, result.insertId);
}

async function getOwnedProduct(tiendaId, id) {
  const rows = await query(
    `SELECT p.*, c.nombre AS categoria, c.slug AS categoria_slug, t.nombre AS tienda, t.slug AS tienda_slug, t.municipio,
            COALESCE(p.precio_oferta, p.precio) AS precio_final
     FROM productos p
     JOIN categorias c ON c.id = p.categoria_id
     JOIN tiendas t ON t.id = p.tienda_id
     WHERE p.id = ? AND p.tienda_id = ?`,
    [id, tiendaId]
  );
  if (!rows[0]) throw notFound('Producto no encontrado');
  const imagenes = await query(
    'SELECT id, url, orden, es_principal AS esPrincipal FROM producto_imagenes WHERE producto_id = ? ORDER BY orden',
    [id]
  );
  const product = mapProduct(rows[0]);
  product.imagenes = imagenes.map((image) => ({ ...image, esPrincipal: Boolean(image.esPrincipal) }));
  return product;
}

async function updateProduct(tienda, id, body) {
  const current = await getOwnedProduct(tienda.id, id);
  const data = parse(productSchema, body);
  await assertCategory(data.categoriaId);
  const oferta = offerValue(data.precio, data.precioOferta);
  const slug = current.nombre === data.nombre ? current.slug : await uniqueSlug('productos', data.nombre, Number(id));
  let estado = current.estado;
  if (estado === 'rechazado' || estado === 'borrador') estado = 'pendiente';
  await query(
    `UPDATE productos
     SET categoria_id = ?, nombre = ?, slug = ?, descripcion = ?, precio = ?, precio_oferta = ?, stock = ?, sku = ?, condicion = ?, estado = ?, motivo_rechazo = IF(? = 'pendiente', NULL, motivo_rechazo)
     WHERE id = ? AND tienda_id = ?`,
    [data.categoriaId, data.nombre, slug, data.descripcion || null, data.precio, oferta, data.stock, data.sku || null, data.condicion, estado, estado, id, tienda.id]
  );
  if (Number(data.stock) <= 3) {
    await notify(tienda.usuario_id, 'producto', 'Stock bajo', `${data.nombre} tiene ${data.stock} unidades.`, '/vendedor/productos');
  }
  return getOwnedProduct(tienda.id, id);
}

async function removeProduct(tiendaId, id) {
  const used = await query('SELECT id FROM detalle_pedido WHERE producto_id = ? LIMIT 1', [id]);
  if (used.length) throw conflict('Este producto tiene ventas. Puedes pausarlo en lugar de eliminarlo.');
  const result = await query('DELETE FROM productos WHERE id = ? AND tienda_id = ?', [id, tiendaId]);
  if (!result.affectedRows) throw notFound('Producto no encontrado');
}

async function changeSellerStatus(tienda, id, estado) {
  const product = await getOwnedProduct(tienda.id, id);
  const allowed = (
    (estado === 'pausado' && product.estado === 'publicado')
    || (estado === 'publicado' && product.estado === 'pausado')
    || (estado === 'pendiente' && ['rechazado', 'borrador'].includes(product.estado))
  );
  if (!allowed) throw badRequest('No puedes cambiar el producto a ese estado');
  await query(
    'UPDATE productos SET estado = ?, motivo_rechazo = IF(? = \'pendiente\', NULL, motivo_rechazo) WHERE id = ?',
    [estado, estado, id]
  );
  return getOwnedProduct(tienda.id, id);
}

async function addImages(tiendaId, productoId, files) {
  await getOwnedProduct(tiendaId, productoId);
  if (!files?.length) throw badRequest('Selecciona al menos una imagen');
  const current = await query('SELECT id, es_principal FROM producto_imagenes WHERE producto_id = ?', [productoId]);
  if (current.length + files.length > 6) throw badRequest('Puedes subir hasta 6 imágenes por producto');
  const hasPrincipal = current.some((image) => image.es_principal);
  let orden = current.length;
  for (let index = 0; index < files.length; index += 1) {
    await query(
      'INSERT INTO producto_imagenes (producto_id, url, orden, es_principal) VALUES (?, ?, ?, ?)',
      [productoId, `/uploads/${files[index].filename}`, orden, !hasPrincipal && index === 0 ? 1 : 0]
    );
    orden += 1;
  }
  return getOwnedProduct(tiendaId, productoId);
}

async function removeImage(tiendaId, productoId, imageId) {
  await getOwnedProduct(tiendaId, productoId);
  const result = await query('DELETE FROM producto_imagenes WHERE id = ? AND producto_id = ?', [imageId, productoId]);
  if (!result.affectedRows) throw notFound('Imagen no encontrada');
  const principal = await query('SELECT id FROM producto_imagenes WHERE producto_id = ? AND es_principal = 1', [productoId]);
  if (!principal[0]) {
    await query(
      `UPDATE producto_imagenes SET es_principal = 1
       WHERE producto_id = ? ORDER BY orden ASC LIMIT 1`,
      [productoId]
    );
  }
  return getOwnedProduct(tiendaId, productoId);
}

async function setPrincipalImage(tiendaId, productoId, imageId) {
  await getOwnedProduct(tiendaId, productoId);
  await withTransaction(async (connection) => {
    await connection.query('UPDATE producto_imagenes SET es_principal = 0 WHERE producto_id = ?', [productoId]);
    const [result] = await connection.query(
      'UPDATE producto_imagenes SET es_principal = 1 WHERE id = ? AND producto_id = ?',
      [imageId, productoId]
    );
    if (!result.affectedRows) throw notFound('Imagen no encontrada');
  });
  return getOwnedProduct(tiendaId, productoId);
}

async function moderateProduct(id, { estado, motivo }) {
  const rows = await query(
    `SELECT p.*, t.usuario_id FROM productos p JOIN tiendas t ON t.id = p.tienda_id WHERE p.id = ?`,
    [id]
  );
  if (!rows[0]) throw notFound('Producto no encontrado');
  if (estado === 'publicado') {
    await query("UPDATE productos SET estado = 'publicado', motivo_rechazo = NULL WHERE id = ?", [id]);
    await notify(rows[0].usuario_id, 'producto', 'Producto publicado', `${rows[0].nombre} ya está en el catálogo.`, `/producto/${rows[0].slug}`);
  } else if (estado === 'rechazado') {
    if (!motivo) throw badRequest('Indica el motivo del rechazo');
    await query("UPDATE productos SET estado = 'rechazado', motivo_rechazo = ? WHERE id = ?", [motivo.slice(0, 255), id]);
    await notify(rows[0].usuario_id, 'producto', 'Producto rechazado', motivo.slice(0, 255), '/vendedor/productos');
  } else if (estado === 'pausado') {
    await query("UPDATE productos SET estado = 'pausado' WHERE id = ?", [id]);
  } else {
    throw badRequest('Estado no permitido');
  }
  const product = await query('SELECT slug FROM productos WHERE id = ?', [id]);
  return { id: Number(id), estado, slug: product[0].slug };
}

async function lowStock(tiendaId) {
  const rows = await query(
    `SELECT id, nombre, slug, stock, estado FROM productos
     WHERE tienda_id = ? AND stock <= 3 AND estado IN ('publicado', 'pausado', 'pendiente')
     ORDER BY stock ASC`,
    [tiendaId]
  );
  return rows;
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  removeCategory,
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  removeProduct,
  changeSellerStatus,
  addImages,
  removeImage,
  setPrincipalImage,
  moderateProduct,
  lowStock,
  getOwnedProduct,
};
