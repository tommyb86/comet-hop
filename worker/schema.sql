-- One row per player per day, holding that player's best run.
CREATE TABLE IF NOT EXISTS scores (
  day TEXT NOT NULL,          -- UTC date, YYYY-MM-DD
  player TEXT NOT NULL,       -- sha256 of the player's private key, hex
  nickname TEXT NOT NULL,
  score INTEGER NOT NULL,
  hops INTEGER NOT NULL,
  bulls INTEGER NOT NULL,
  chain INTEGER NOT NULL,
  updated_at TEXT NOT NULL,   -- ISO time of the last submission
  PRIMARY KEY (day, player)
);
CREATE INDEX IF NOT EXISTS scores_by_day ON scores (day, score DESC);
