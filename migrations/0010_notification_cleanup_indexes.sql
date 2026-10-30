-- Speed up cleanup of legacy notification read and dismissal rows.
-- The newer v2 and target tables already have notification_id-leading indexes.
CREATE INDEX IF NOT EXISTS idx_yume_notification_reads_notification
  ON yume_notification_reads(notification_id);

CREATE INDEX IF NOT EXISTS idx_yume_notification_dismissals_notification
  ON yume_notification_dismissals(notification_id);
