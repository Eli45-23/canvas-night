-- Empty private staging database only. Never replaces existing records.
CREATE TABLE IF NOT EXISTS shop_state (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shared_state (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, generation TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shared_state_parts (position INTEGER PRIMARY KEY, body TEXT NOT NULL);
