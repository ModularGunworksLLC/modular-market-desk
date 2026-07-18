-- Market data bank: observation labels + weekly sync runs
ALTER TABLE web_price_observations ADD COLUMN source text NOT NULL DEFAULT 'tavily';
ALTER TABLE web_price_observations ADD COLUMN kind text NOT NULL DEFAULT 'ask';
ALTER TABLE web_price_observations ADD COLUMN geo text NOT NULL DEFAULT 'national';
CREATE INDEX IF NOT EXISTS web_price_obs_source_idx ON web_price_observations (source);

CREATE TABLE IF NOT EXISTS market_sync_runs (
  id text PRIMARY KEY NOT NULL,
  status text NOT NULL,
  started_at integer DEFAULT (unixepoch()) NOT NULL,
  finished_at integer,
  error text,
  meta text DEFAULT '{}' NOT NULL
);
