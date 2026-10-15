-- Members sign in with passkeys only, so no passwords are stored anywhere.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  webauthn_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_used_at INTEGER
);
CREATE INDEX credentials_user ON credentials(user_id);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('community', 'blog')),
  title TEXT,
  body TEXT NOT NULL,
  image_key TEXT,
  image_alt TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected')),
  moderation_note TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  published_at INTEGER
);
CREATE INDEX posts_feed ON posts(kind, status, created_at DESC);
CREATE INDEX posts_author ON posts(author_id, created_at DESC);

CREATE TABLE uploads (
  key TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX uploads_owner ON uploads(owner_id, created_at DESC);

CREATE TABLE contact_messages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  country TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'archived')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX contact_inbox ON contact_messages(status, created_at DESC);

CREATE TABLE inbound_emails (
  id TEXT PRIMARY KEY,
  from_addr TEXT NOT NULL,
  to_addr TEXT NOT NULL,
  subject TEXT,
  text_body TEXT,
  received_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX inbound_recent ON inbound_emails(received_at DESC);

CREATE TABLE daily_stats (
  day TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
