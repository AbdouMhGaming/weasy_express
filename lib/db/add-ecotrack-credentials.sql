CREATE TABLE IF NOT EXISTS expediteur_ecotrack_credentials (
  id INT NOT NULL AUTO_INCREMENT,
  expediteur_id INT NOT NULL,
  token_ciphertext TEXT NOT NULL,
  token_iv VARCHAR(64) NOT NULL,
  token_auth_tag VARCHAR(64) NOT NULL,
  token_hint VARCHAR(16) NULL,
  connection_status VARCHAR(20) NOT NULL DEFAULT 'connected',
  last_validated_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_expediteur_ecotrack_credentials_expediteur (expediteur_id)
);