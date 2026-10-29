-- Retire first-party visit analytics and remove its historical event data.
-- Apply this migration only after deploying the version that removes /api/analytics.
DROP TABLE IF EXISTS yume_analytics_events;
