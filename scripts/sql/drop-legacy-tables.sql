-- One-off cleanup for the shared Supabase project.
--
-- Removes the earlier asset/regulation model so the canonical schema in
-- backend/db/schema.sql is the only data model in `public`.
--
-- DESTRUCTIVE AND IRREVERSIBLE. Everything in these four tables is lost.
-- Take a backup first (Supabase Dashboard -> Database -> Backups), and get
-- agreement from whoever built them before running this.
--
-- Run BEFORE `npm run db:migrate`. Our tables share no names with these,
-- so the order only matters for keeping `public` clean.

BEGIN;

-- Child first: asset_dependencies and regulation_asset_impacts both
-- reference assets/regulations.
DROP TABLE IF EXISTS regulation_asset_impacts;
DROP TABLE IF EXISTS asset_dependencies;
DROP TABLE IF EXISTS assets;
DROP TABLE IF EXISTS regulations;

COMMIT;
