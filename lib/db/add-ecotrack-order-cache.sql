CREATE TABLE IF NOT EXISTS expediteur_ecotrack_order_cache (
  id BIGINT NOT NULL AUTO_INCREMENT,
  expediteur_id INT NOT NULL,
  tracking VARCHAR(255) NOT NULL,
  reference_value VARCHAR(255) NULL,
  client_name VARCHAR(255) NULL,
  phone VARCHAR(64) NULL,
  status_value VARCHAR(255) NULL,
  montant DECIMAL(14,2) NULL,
  tarif_prestation DECIMAL(14,2) NULL,
  tarif_retour DECIMAL(14,2) NULL,
  created_at_remote DATETIME NULL,
  last_updated_at_remote DATETIME NULL,
  raw_order JSON NOT NULL,
  fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ecotrack_cache_expediteur_tracking (expediteur_id, tracking),
  KEY ix_ecotrack_cache_expediteur_status (expediteur_id, status_value),
  KEY ix_ecotrack_cache_expediteur_fetched (expediteur_id, fetched_at)
);

CREATE TABLE IF NOT EXISTS expediteur_ecotrack_sync_state (
  expediteur_id INT NOT NULL,
  next_page INT NOT NULL DEFAULT 1,
  last_page INT NULL,
  last_synced_at TIMESTAMP NULL DEFAULT NULL,
  blocked_until TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (expediteur_id)
);