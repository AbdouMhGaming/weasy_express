import crypto from "node:crypto";

/** Server-only identity tag. Never send this tag or the API token to the browser. */
export function notificationSource(token: string): string {
  if (!token.trim()) throw new Error("Notification source requires an Ecotrack token");
  return crypto.createHash("sha256").update("weasy:ecotrack-notifications:v1\0").update(token).digest("hex");
}

/** Payout OTPs belong to the merchant account, not its external shipping API. */
export const CURRENT_NOTIFICATION_SOURCE_SQL = `(
  n.event_type='payout_otp' OR EXISTS (
    SELECT 1 FROM expediteur_ecotrack_notification_sources ns
    JOIN expediteur_ecotrack_notification_connections nc
      ON nc.expediteur_id=n.expediteur_id AND BINARY nc.source_hash=BINARY ns.source_hash
    JOIN expediteur_ecotrack_credentials ck
      ON ck.expediteur_id=nc.expediteur_id AND ck.connection_status='connected'
    WHERE ns.notification_id=n.id
  )
)`;
