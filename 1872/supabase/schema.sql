-- ============================================================================
-- RSR NEXORA — PRODUCTION SUPABASE POSTGRESQL SCHEMA
-- Product: RSR Nexora | Studio: RSR Studios | Package ID: com.rsr.nexora
-- ============================================================================

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(128) PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  name VARCHAR(255) NOT NULL,
  password_hash TEXT,
  password_salt TEXT,
  is_guest BOOLEAN DEFAULT false,
  tier VARCHAR(32) DEFAULT 'free',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- 2. SESSIONS TABLE
CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  last_activity_at BIGINT NOT NULL,
  ip_address VARCHAR(64) DEFAULT '',
  user_agent TEXT DEFAULT ''
);

-- 3. SETTINGS TABLE
CREATE TABLE IF NOT EXISTS settings (
  user_id VARCHAR(128) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme VARCHAR(32) DEFAULT 'system',
  system_instruction TEXT DEFAULT '',
  temperature NUMERIC DEFAULT 0.7,
  web_search_enabled BOOLEAN DEFAULT true,
  memory_enabled BOOLEAN DEFAULT true,
  font_size VARCHAR(32) DEFAULT 'default',
  voice_speed NUMERIC DEFAULT 1.0,
  voice_pitch NUMERIC DEFAULT 1.0,
  updated_at BIGINT NOT NULL
);

-- 4. WORKSPACES TABLE
CREATE TABLE IF NOT EXISTS workspaces (
  id VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  icon VARCHAR(64) DEFAULT 'folder',
  custom_instructions TEXT DEFAULT '',
  is_default BOOLEAN DEFAULT false,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- 5. CONVERSATIONS TABLE
CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id VARCHAR(128) REFERENCES workspaces(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  model VARCHAR(64) DEFAULT 'gemini-3.8-flash',
  mode VARCHAR(64) DEFAULT 'chat',
  messages JSONB DEFAULT '[]'::jsonb,
  is_pinned BOOLEAN DEFAULT false,
  is_favorite BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- 6. MESSAGES TABLE
CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(128) PRIMARY KEY,
  conversation_id VARCHAR(128) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(32) NOT NULL,
  content TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at BIGINT NOT NULL
);

-- 7. MEMORIES TABLE
CREATE TABLE IF NOT EXISTS memories (
  id VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id VARCHAR(128) REFERENCES workspaces(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  category VARCHAR(64) DEFAULT 'preference',
  created_at BIGINT NOT NULL
);

-- 8. ATTACHMENTS TABLE
CREATE TABLE IF NOT EXISTS attachments (
  id VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_name VARCHAR(255) NOT NULL,
  storage_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(128) NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

-- 9. DAILY_USAGE TABLE
CREATE TABLE IF NOT EXISTS daily_usage (
  id VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  utc_date VARCHAR(16) NOT NULL,
  messages_used INTEGER DEFAULT 0,
  images_used INTEGER DEFAULT 0,
  searches_used INTEGER DEFAULT 0,
  files_used INTEGER DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  CONSTRAINT uq_daily_usage_user_date UNIQUE (user_id, utc_date)
);

-- 10. SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS subscriptions (
  subscription_id VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan VARCHAR(32) NOT NULL DEFAULT 'free',
  status VARCHAR(32) NOT NULL DEFAULT 'free',
  provider VARCHAR(64) DEFAULT 'razorpay',
  provider_customer_id VARCHAR(128) DEFAULT '',
  provider_subscription_id VARCHAR(128) DEFAULT '',
  current_period_start BIGINT DEFAULT 0,
  current_period_end BIGINT DEFAULT 0,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- 11. PAYMENT_METADATA TABLE
CREATE TABLE IF NOT EXISTS payment_metadata (
  id VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id VARCHAR(128) UNIQUE NOT NULL,
  payment_id VARCHAR(128) DEFAULT '',
  plan_id VARCHAR(32) NOT NULL,
  amount_paise BIGINT NOT NULL,
  currency VARCHAR(16) DEFAULT 'INR',
  status VARCHAR(32) DEFAULT 'created',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- INDEXES FOR PERFORMANCE AND FAST LOOKUP
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_user_id ON workspaces(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace_id ON conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_attachments_user_id ON attachments(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date ON daily_usage(user_id, utc_date);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_metadata_user_id ON payment_metadata(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_metadata_order_id ON payment_metadata(order_id);

-- ENABLE ROW LEVEL SECURITY (RLS) ON ALL PRODUCTION TABLES
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_metadata ENABLE ROW LEVEL SECURITY;

-- ROW LEVEL SECURITY POLICIES
-- Note: Service Role key automatically bypasses RLS for privileged server operations.

-- Users Isolation
CREATE POLICY users_owner_isolation ON users
  FOR ALL
  USING (auth.uid()::text = id)
  WITH CHECK (auth.uid()::text = id);

-- Sessions Isolation
CREATE POLICY sessions_owner_isolation ON sessions
  FOR ALL
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- Settings Isolation
CREATE POLICY settings_owner_isolation ON settings
  FOR ALL
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- Workspaces Isolation
CREATE POLICY workspaces_owner_isolation ON workspaces
  FOR ALL
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- Conversations Isolation
CREATE POLICY conversations_owner_isolation ON conversations
  FOR ALL
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- Messages Isolation
CREATE POLICY messages_owner_isolation ON messages
  FOR ALL
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- Memories Isolation
CREATE POLICY memories_owner_isolation ON memories
  FOR ALL
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- Attachments Isolation
CREATE POLICY attachments_owner_isolation ON attachments
  FOR ALL
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- Daily Usage Isolation
CREATE POLICY daily_usage_owner_isolation ON daily_usage
  FOR ALL
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- Subscriptions Isolation
CREATE POLICY subscriptions_owner_isolation ON subscriptions
  FOR ALL
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- Payment Metadata Isolation
CREATE POLICY payment_metadata_owner_isolation ON payment_metadata
  FOR ALL
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);
