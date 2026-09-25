-- Tablas de sesión y recuperación de contraseña.
-- La API también las crea al arrancar si ya existe la tabla usuarios.
-- Ejecuta antes docs/mercaya_db.sql en la base de Clever Cloud.

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id   INT UNSIGNED NOT NULL,
  token_hash   CHAR(64)     NOT NULL,
  expires_at   DATETIME     NOT NULL,
  revoked      TINYINT(1)   NOT NULL DEFAULT 0,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_hash (token_hash),
  KEY idx_refresh_usuario (usuario_id),
  CONSTRAINT fk_refresh_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_resets (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id   INT UNSIGNED NOT NULL,
  token_hash   CHAR(64)     NOT NULL,
  expires_at   DATETIME     NOT NULL,
  used_at      DATETIME     NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reset_hash (token_hash),
  KEY idx_reset_usuario (usuario_id),
  CONSTRAINT fk_reset_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
