-- =====================================================================
--  MercaYa - PWA de compra y venta de productos varios
--  Script de base de datos (MySQL 8.x - Clever Cloud)
--  Autora: Liseth Arelis Giraldo Morales
--  Fecha: 2026-09-24
--
--  NOTAS PARA CLEVER CLOUD
--  * Clever Cloud crea la base de datos por ti (nombre tipo "bxxxxxxxxx").
--    NO ejecutes CREATE DATABASE: conéctate a esa base y ejecuta este script
--    (desde phpMyAdmin del add-on, MySQL Workbench o la CLI de mysql).
--  * Si trabajas en local, descomenta las dos líneas siguientes.
-- =====================================================================
-- CREATE DATABASE IF NOT EXISTS mercaya CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE mercaya;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS reportes;
DROP TABLE IF EXISTS suscripciones_push;
DROP TABLE IF EXISTS notificaciones;
DROP TABLE IF EXISTS preguntas_producto;
DROP TABLE IF EXISTS resenas;
DROP TABLE IF EXISTS pagos;
DROP TABLE IF EXISTS detalle_pedido;
DROP TABLE IF EXISTS pedidos;
DROP TABLE IF EXISTS favoritos;
DROP TABLE IF EXISTS carrito_items;
DROP TABLE IF EXISTS carritos;
DROP TABLE IF EXISTS producto_imagenes;
DROP TABLE IF EXISTS productos;
DROP TABLE IF EXISTS categorias;
DROP TABLE IF EXISTS tiendas;
DROP TABLE IF EXISTS direcciones;
DROP TABLE IF EXISTS usuarios;
DROP TABLE IF EXISTS roles;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- 1. ROLES (administrador, vendedor, cliente)
-- ---------------------------------------------------------------------
CREATE TABLE roles (
  id            TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre        VARCHAR(30)  NOT NULL,
  descripcion   VARCHAR(150) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 2. USUARIOS
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  rol_id             TINYINT UNSIGNED NOT NULL,
  nombres            VARCHAR(80)  NOT NULL,
  apellidos          VARCHAR(80)  NOT NULL,
  tipo_documento     ENUM('CC','CE','TI','PASAPORTE','NIT') NULL,
  numero_documento   VARCHAR(20)  NULL,
  email              VARCHAR(120) NOT NULL,
  password_hash      VARCHAR(255) NOT NULL,          -- bcrypt
  telefono           VARCHAR(20)  NULL,
  avatar_url         VARCHAR(255) NULL,
  email_verificado   TINYINT(1)   NOT NULL DEFAULT 0,
  estado             ENUM('activo','inactivo','bloqueado') NOT NULL DEFAULT 'activo',
  ultimo_acceso      DATETIME     NULL,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_email (email),
  UNIQUE KEY uq_usuarios_documento (tipo_documento, numero_documento),
  KEY idx_usuarios_rol (rol_id),
  CONSTRAINT fk_usuarios_rol FOREIGN KEY (rol_id) REFERENCES roles (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 3. DIRECCIONES (un usuario puede tener varias direcciones de envío)
-- ---------------------------------------------------------------------
CREATE TABLE direcciones (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id     INT UNSIGNED NOT NULL,
  alias          VARCHAR(40)  NOT NULL DEFAULT 'Casa',
  departamento   VARCHAR(60)  NOT NULL,
  municipio      VARCHAR(60)  NOT NULL,
  barrio         VARCHAR(80)  NULL,
  direccion      VARCHAR(150) NOT NULL,
  referencia     VARCHAR(150) NULL,
  es_principal   TINYINT(1)   NOT NULL DEFAULT 0,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_direcciones_usuario (usuario_id),
  CONSTRAINT fk_direcciones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 4. TIENDAS (perfil comercial del vendedor, 1 a 1 con usuario)
-- ---------------------------------------------------------------------
CREATE TABLE tiendas (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id             INT UNSIGNED NOT NULL,
  nombre                 VARCHAR(100) NOT NULL,
  slug                   VARCHAR(120) NOT NULL,
  descripcion            TEXT         NULL,
  logo_url               VARCHAR(255) NULL,
  telefono_contacto      VARCHAR(20)  NULL,
  municipio              VARCHAR(60)  NULL,
  estado                 ENUM('pendiente','aprobada','rechazada','suspendida') NOT NULL DEFAULT 'pendiente',
  motivo_estado          VARCHAR(255) NULL,
  calificacion_promedio  DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  aprobada_por           INT UNSIGNED NULL,             -- administrador que aprobó
  aprobada_en            DATETIME     NULL,
  created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tiendas_usuario (usuario_id),
  UNIQUE KEY uq_tiendas_slug (slug),
  KEY idx_tiendas_estado (estado),
  CONSTRAINT fk_tiendas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_tiendas_admin FOREIGN KEY (aprobada_por) REFERENCES usuarios (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 5. CATEGORIAS (jerárquicas: categoría / subcategoría)
-- ---------------------------------------------------------------------
CREATE TABLE categorias (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  padre_id     INT UNSIGNED NULL,
  nombre       VARCHAR(80)  NOT NULL,
  slug         VARCHAR(100) NOT NULL,
  descripcion  VARCHAR(255) NULL,
  icono        VARCHAR(60)  NULL,
  activa       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categorias_slug (slug),
  KEY idx_categorias_padre (padre_id),
  CONSTRAINT fk_categorias_padre FOREIGN KEY (padre_id) REFERENCES categorias (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 6. PRODUCTOS
-- ---------------------------------------------------------------------
CREATE TABLE productos (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tienda_id       INT UNSIGNED NOT NULL,
  categoria_id    INT UNSIGNED NOT NULL,
  nombre          VARCHAR(150) NOT NULL,
  slug            VARCHAR(170) NOT NULL,
  descripcion     TEXT         NULL,
  precio          DECIMAL(12,2) NOT NULL,
  precio_oferta   DECIMAL(12,2) NULL,
  stock           INT UNSIGNED NOT NULL DEFAULT 0,
  sku             VARCHAR(50)  NULL,
  condicion       ENUM('nuevo','usado','reacondicionado') NOT NULL DEFAULT 'nuevo',
  estado          ENUM('borrador','pendiente','publicado','pausado','rechazado') NOT NULL DEFAULT 'pendiente',
  motivo_rechazo  VARCHAR(255) NULL,
  vistas          INT UNSIGNED NOT NULL DEFAULT 0,
  calificacion_promedio DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_productos_slug (slug),
  UNIQUE KEY uq_productos_tienda_sku (tienda_id, sku),
  KEY idx_productos_categoria (categoria_id),
  KEY idx_productos_estado_precio (estado, precio),
  FULLTEXT KEY ft_productos_busqueda (nombre, descripcion),
  CONSTRAINT chk_productos_precio CHECK (precio >= 0),
  CONSTRAINT chk_productos_oferta CHECK (precio_oferta IS NULL OR (precio_oferta >= 0 AND precio_oferta < precio)),
  CONSTRAINT fk_productos_tienda FOREIGN KEY (tienda_id) REFERENCES tiendas (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_productos_categoria FOREIGN KEY (categoria_id) REFERENCES categorias (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 7. IMÁGENES DE PRODUCTO (URLs en Cloudinary / Cellar S3 de Clever Cloud)
-- ---------------------------------------------------------------------
CREATE TABLE producto_imagenes (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  producto_id   INT UNSIGNED NOT NULL,
  url           VARCHAR(255) NOT NULL,
  orden         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  es_principal  TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_imagenes_producto (producto_id),
  CONSTRAINT fk_imagenes_producto FOREIGN KEY (producto_id) REFERENCES productos (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 8. CARRITOS y 9. CARRITO_ITEMS
-- ---------------------------------------------------------------------
CREATE TABLE carritos (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id   INT UNSIGNED NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_carritos_usuario (usuario_id),
  CONSTRAINT fk_carritos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE carrito_items (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  carrito_id    INT UNSIGNED NOT NULL,
  producto_id   INT UNSIGNED NOT NULL,
  cantidad      SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  agregado_en   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_carrito_producto (carrito_id, producto_id),
  KEY idx_carrito_items_producto (producto_id),
  CONSTRAINT chk_carrito_cantidad CHECK (cantidad > 0),
  CONSTRAINT fk_items_carrito FOREIGN KEY (carrito_id) REFERENCES carritos (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_items_producto FOREIGN KEY (producto_id) REFERENCES productos (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 10. FAVORITOS (lista de deseos)
-- ---------------------------------------------------------------------
CREATE TABLE favoritos (
  usuario_id    INT UNSIGNED NOT NULL,
  producto_id   INT UNSIGNED NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, producto_id),
  KEY idx_favoritos_producto (producto_id),
  CONSTRAINT fk_favoritos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_favoritos_producto FOREIGN KEY (producto_id) REFERENCES productos (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 11. PEDIDOS (la dirección se copia para conservar el histórico)
-- ---------------------------------------------------------------------
CREATE TABLE pedidos (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo             VARCHAR(20)  NOT NULL,              -- ej. MY-2026-000123
  cliente_id         INT UNSIGNED NOT NULL,
  direccion_id       INT UNSIGNED NULL,
  direccion_envio    VARCHAR(255) NOT NULL,              -- copia textual
  municipio_envio    VARCHAR(60)  NOT NULL,
  telefono_contacto  VARCHAR(20)  NOT NULL,
  subtotal           DECIMAL(12,2) NOT NULL,
  costo_envio        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  descuento          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total              DECIMAL(12,2) NOT NULL,
  estado             ENUM('pendiente_pago','pagado','en_preparacion','enviado','entregado','cancelado')
                     NOT NULL DEFAULT 'pendiente_pago',
  notas              VARCHAR(255) NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pedidos_codigo (codigo),
  KEY idx_pedidos_cliente_fecha (cliente_id, created_at),
  KEY idx_pedidos_estado (estado),
  CONSTRAINT chk_pedidos_total CHECK (total >= 0),
  CONSTRAINT fk_pedidos_cliente FOREIGN KEY (cliente_id) REFERENCES usuarios (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_pedidos_direccion FOREIGN KEY (direccion_id) REFERENCES direcciones (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 12. DETALLE_PEDIDO (un pedido puede incluir productos de varias tiendas)
-- ---------------------------------------------------------------------
CREATE TABLE detalle_pedido (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  pedido_id         INT UNSIGNED NOT NULL,
  producto_id       INT UNSIGNED NULL,
  tienda_id         INT UNSIGNED NOT NULL,
  nombre_producto   VARCHAR(150) NOT NULL,              -- copia histórica
  cantidad          SMALLINT UNSIGNED NOT NULL,
  precio_unitario   DECIMAL(12,2) NOT NULL,
  subtotal          DECIMAL(12,2) NOT NULL,
  estado_item       ENUM('pendiente','en_preparacion','enviado','entregado','cancelado')
                    NOT NULL DEFAULT 'pendiente',
  guia_envio        VARCHAR(60)  NULL,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_detalle_pedido (pedido_id),
  KEY idx_detalle_tienda_estado (tienda_id, estado_item),
  KEY idx_detalle_producto (producto_id),
  CONSTRAINT chk_detalle_cantidad CHECK (cantidad > 0),
  CONSTRAINT fk_detalle_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_detalle_producto FOREIGN KEY (producto_id) REFERENCES productos (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_detalle_tienda FOREIGN KEY (tienda_id) REFERENCES tiendas (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 13. PAGOS
-- ---------------------------------------------------------------------
CREATE TABLE pagos (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  pedido_id            INT UNSIGNED NOT NULL,
  metodo               ENUM('tarjeta','pse','nequi','daviplata','contraentrega','transferencia') NOT NULL,
  proveedor            VARCHAR(40)  NULL,               -- ej. Wompi, Mercado Pago
  referencia_externa   VARCHAR(100) NULL,
  monto                DECIMAL(12,2) NOT NULL,
  estado               ENUM('pendiente','aprobado','rechazado','reembolsado') NOT NULL DEFAULT 'pendiente',
  respuesta_pasarela   JSON         NULL,
  pagado_en            DATETIME     NULL,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pagos_referencia (referencia_externa),
  KEY idx_pagos_pedido (pedido_id),
  CONSTRAINT fk_pagos_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 14. RESEÑAS (solo sobre productos comprados y entregados)
-- ---------------------------------------------------------------------
CREATE TABLE resenas (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  producto_id        INT UNSIGNED NOT NULL,
  cliente_id         INT UNSIGNED NOT NULL,
  detalle_pedido_id  INT UNSIGNED NOT NULL,
  calificacion       TINYINT UNSIGNED NOT NULL,
  comentario         VARCHAR(500) NULL,
  visible            TINYINT(1)   NOT NULL DEFAULT 1,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_resenas_detalle (detalle_pedido_id),     -- 1 reseña por ítem comprado
  KEY idx_resenas_producto (producto_id),
  KEY idx_resenas_cliente (cliente_id),
  CONSTRAINT chk_resenas_calificacion CHECK (calificacion BETWEEN 1 AND 5),
  CONSTRAINT fk_resenas_producto FOREIGN KEY (producto_id) REFERENCES productos (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_resenas_cliente FOREIGN KEY (cliente_id) REFERENCES usuarios (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_resenas_detalle FOREIGN KEY (detalle_pedido_id) REFERENCES detalle_pedido (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 15. PREGUNTAS DE PRODUCTO (cliente pregunta, vendedor responde)
-- ---------------------------------------------------------------------
CREATE TABLE preguntas_producto (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  producto_id      INT UNSIGNED NOT NULL,
  cliente_id       INT UNSIGNED NOT NULL,
  pregunta         VARCHAR(500) NOT NULL,
  respuesta        VARCHAR(500) NULL,
  respondida_en    DATETIME     NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_preguntas_producto (producto_id),
  KEY idx_preguntas_cliente (cliente_id),
  CONSTRAINT fk_preguntas_producto FOREIGN KEY (producto_id) REFERENCES productos (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_preguntas_cliente FOREIGN KEY (cliente_id) REFERENCES usuarios (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 16. NOTIFICACIONES (bandeja dentro de la app)
-- ---------------------------------------------------------------------
CREATE TABLE notificaciones (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id   INT UNSIGNED NOT NULL,
  tipo         ENUM('pedido','pago','producto','pregunta','tienda','sistema') NOT NULL DEFAULT 'sistema',
  titulo       VARCHAR(120) NOT NULL,
  mensaje      VARCHAR(255) NOT NULL,
  url_destino  VARCHAR(255) NULL,
  leida        TINYINT(1)   NOT NULL DEFAULT 0,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notificaciones_usuario_leida (usuario_id, leida),
  CONSTRAINT fk_notificaciones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 17. SUSCRIPCIONES PUSH (Web Push de la PWA - librería web-push)
-- ---------------------------------------------------------------------
CREATE TABLE suscripciones_push (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id   INT UNSIGNED NOT NULL,
  endpoint     VARCHAR(500) NOT NULL,
  p256dh       VARCHAR(255) NOT NULL,
  auth         VARCHAR(100) NOT NULL,
  dispositivo  VARCHAR(120) NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_push_endpoint (endpoint(255)),
  KEY idx_push_usuario (usuario_id),
  CONSTRAINT fk_push_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 18. REPORTES (denuncias de productos, moderadas por el administrador)
-- ---------------------------------------------------------------------
CREATE TABLE reportes (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  reportante_id   INT UNSIGNED NOT NULL,
  producto_id     INT UNSIGNED NOT NULL,
  motivo          ENUM('fraude','prohibido','contenido_inapropiado','informacion_falsa','otro') NOT NULL,
  descripcion     VARCHAR(500) NULL,
  estado          ENUM('abierto','en_revision','resuelto','descartado') NOT NULL DEFAULT 'abierto',
  admin_id        INT UNSIGNED NULL,
  resolucion      VARCHAR(255) NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resuelto_en     DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_reportes_estado (estado),
  KEY idx_reportes_producto (producto_id),
  CONSTRAINT fk_reportes_reportante FOREIGN KEY (reportante_id) REFERENCES usuarios (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_reportes_producto FOREIGN KEY (producto_id) REFERENCES productos (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_reportes_admin FOREIGN KEY (admin_id) REFERENCES usuarios (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- VISTAS DE APOYO
-- =====================================================================
CREATE OR REPLACE VIEW v_catalogo AS
SELECT p.id, p.nombre, p.slug, p.precio, p.precio_oferta,
       COALESCE(p.precio_oferta, p.precio) AS precio_final,
       p.stock, p.condicion, p.calificacion_promedio,
       c.id AS categoria_id, c.nombre AS categoria,
       t.id AS tienda_id, t.nombre AS tienda, t.municipio,
       (SELECT i.url FROM producto_imagenes i
         WHERE i.producto_id = p.id
         ORDER BY i.es_principal DESC, i.orden ASC LIMIT 1) AS imagen,
       p.created_at
FROM productos p
JOIN categorias c ON c.id = p.categoria_id
JOIN tiendas    t ON t.id = p.tienda_id
WHERE p.estado = 'publicado' AND t.estado = 'aprobada' AND c.activa = 1;

CREATE OR REPLACE VIEW v_ventas_por_tienda AS
SELECT t.id AS tienda_id, t.nombre AS tienda,
       COUNT(DISTINCT d.pedido_id)  AS pedidos,
       COALESCE(SUM(d.cantidad), 0) AS unidades_vendidas,
       COALESCE(SUM(d.subtotal), 0) AS total_vendido
FROM tiendas t
LEFT JOIN detalle_pedido d ON d.tienda_id = t.id AND d.estado_item <> 'cancelado'
GROUP BY t.id, t.nombre;

-- =====================================================================
-- DATOS INICIALES (SEED)
-- =====================================================================
INSERT INTO roles (id, nombre, descripcion) VALUES
  (1, 'administrador', 'Gestiona usuarios, tiendas, categorías, moderación y reportes'),
  (2, 'vendedor',      'Publica productos y gestiona sus ventas'),
  (3, 'cliente',       'Explora, compra y califica productos');

-- Contraseña de todos los usuarios de prueba: MercaYa2026*
-- (hash bcrypt con 10 rondas; cámbiala después del primer ingreso)
INSERT INTO usuarios (id, rol_id, nombres, apellidos, tipo_documento, numero_documento, email, password_hash, telefono, email_verificado) VALUES
  (1, 1, 'Admin',  'MercaYa', 'CC', '1000000001', 'admin@mercaya.com',    '$2b$10$lniMIU9g8.syYfPDESFysevNet2Q0eVkvUjJXybr/pgDLpoFrB77u', '3000000001', 1),
  (2, 2, 'Laura',  'Gómez',   'CC', '1000000002', 'vendedor@mercaya.com', '$2b$10$lniMIU9g8.syYfPDESFysevNet2Q0eVkvUjJXybr/pgDLpoFrB77u', '3000000002', 1),
  (3, 3, 'Carlos', 'Restrepo','CC', '1000000003', 'cliente@mercaya.com',  '$2b$10$lniMIU9g8.syYfPDESFysevNet2Q0eVkvUjJXybr/pgDLpoFrB77u', '3000000003', 1);
-- Para generar otro hash en Node:  node -e "console.log(require('bcrypt').hashSync('TuClave', 10))"

INSERT INTO direcciones (usuario_id, alias, departamento, municipio, barrio, direccion, es_principal) VALUES
  (3, 'Casa', 'Antioquia', 'Rionegro', 'San Antonio', 'Calle 50 # 45-20', 1);

INSERT INTO tiendas (id, usuario_id, nombre, slug, descripcion, municipio, estado, aprobada_por, aprobada_en) VALUES
  (1, 2, 'Tecno Laura', 'tecno-laura', 'Accesorios de tecnología nuevos y usados', 'Rionegro', 'aprobada', 1, NOW());

INSERT INTO categorias (id, padre_id, nombre, slug, icono) VALUES
  (1,  NULL, 'Tecnología',         'tecnologia',        'laptop'),
  (2,  NULL, 'Hogar',              'hogar',             'home'),
  (3,  NULL, 'Moda',               'moda',              'shirt'),
  (4,  NULL, 'Deportes',           'deportes',          'bike'),
  (5,  NULL, 'Libros y papelería', 'libros-papeleria',  'book'),
  (6,  NULL, 'Otros',              'otros',             'package'),
  (7,  1,    'Celulares',          'celulares',         'smartphone'),
  (8,  1,    'Computadores',       'computadores',      'monitor'),
  (9,  1,    'Accesorios',         'accesorios-tecno',  'headphones'),
  (10, 2,    'Cocina',             'cocina',            'utensils');

INSERT INTO productos (id, tienda_id, categoria_id, nombre, slug, descripcion, precio, precio_oferta, stock, sku, condicion, estado) VALUES
  (1, 1, 9, 'Audífonos Bluetooth X200', 'audifonos-bluetooth-x200', 'Audífonos inalámbricos con cancelación de ruido y 30 h de batería.', 189900, 159900, 15, 'TL-AUD-001', 'nuevo', 'publicado'),
  (2, 1, 8, 'Portátil Lenovo i5 8GB',   'portatil-lenovo-i5-8gb',   'Portátil reacondicionado, SSD 256 GB, garantía 3 meses.',          1450000, NULL, 3, 'TL-PC-001', 'reacondicionado', 'publicado'),
  (3, 1, 9, 'Mouse inalámbrico',        'mouse-inalambrico',        'Mouse ergonómico 2.4 GHz.',                                         45000, NULL, 40, 'TL-MOU-001', 'nuevo', 'pendiente');

INSERT INTO producto_imagenes (producto_id, url, orden, es_principal) VALUES
  (1, 'https://res.cloudinary.com/demo/image/upload/mercaya/audifonos.jpg', 0, 1),
  (2, 'https://res.cloudinary.com/demo/image/upload/mercaya/portatil.jpg',  0, 1);

INSERT INTO carritos (usuario_id) VALUES (3);

-- =====================================================================
-- CONSULTAS DE EJEMPLO PARA EL BACKEND (Express + mysql2)
-- =====================================================================
-- Catálogo con búsqueda y filtro:
--   SELECT * FROM v_catalogo WHERE categoria_id = ? AND precio_final BETWEEN ? AND ?
--   ORDER BY created_at DESC LIMIT ? OFFSET ?;
-- Búsqueda de texto:
--   SELECT id, nombre FROM productos
--   WHERE estado = 'publicado' AND MATCH(nombre, descripcion) AGAINST (? IN NATURAL LANGUAGE MODE);
-- Pedidos pendientes de un vendedor:
--   SELECT p.codigo, d.nombre_producto, d.cantidad, d.estado_item
--   FROM detalle_pedido d JOIN pedidos p ON p.id = d.pedido_id
--   WHERE d.tienda_id = ? AND d.estado_item IN ('pendiente','en_preparacion');
-- Descontar stock dentro de la transacción de checkout (evita sobreventa):
--   UPDATE productos SET stock = stock - ? WHERE id = ? AND stock >= ?;
--   -- si affectedRows = 0 -> ROLLBACK y avisar "sin stock suficiente"
-- =====================================================================
-- FIN DEL SCRIPT
-- =====================================================================
