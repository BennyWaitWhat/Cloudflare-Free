-- Daily spend counters, one row per UTC day, so anonymous visitors can't use up
-- the shared free allowances: Workers AI Neurons for the demos and KV writes.
CREATE TABLE ai_budget (day TEXT PRIMARY KEY, neurons INTEGER NOT NULL);
CREATE TABLE kv_budget (day TEXT PRIMARY KEY, writes INTEGER NOT NULL);

-- The image route checks whether a photo belongs to a rejected post.
CREATE INDEX posts_image ON posts(image_key) WHERE image_key IS NOT NULL;
