-- 猎策分发站初始 schema
-- 由 db/schema.sql 草稿演进而来,增补:sessions 表、releases 运营字段、
-- entitlements.note、update_credentials 唯一活跃约束及列表索引。

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('admin', 'customer');
CREATE TYPE user_status AS ENUM ('active', 'disabled');
CREATE TYPE entitlement_status AS ENUM ('active', 'revoked');
CREATE TYPE token_status AS ENUM ('issued', 'redeemed', 'expired', 'revoked');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL,
  display_name text,
  role user_role NOT NULL DEFAULT 'customer',
  status user_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_lookup_idx ON sessions (token_hash, expires_at);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  product_id uuid NOT NULL REFERENCES products(id),
  status entitlement_status NOT NULL DEFAULT 'active',
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  note text NOT NULL DEFAULT '',
  granted_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);
CREATE INDEX entitlements_lookup_idx ON entitlements (user_id, product_id, status, expires_at);

CREATE TABLE releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  version text NOT NULL CHECK (version ~ '^\d+\.\d+\.\d+$'),
  package_key text NOT NULL,
  package_sha256 text NOT NULL,
  package_size_bytes bigint NOT NULL DEFAULT 0,
  downloads_count integer NOT NULL DEFAULT 0,
  release_notes text NOT NULL DEFAULT '',
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, version)
);
CREATE INDEX releases_latest_idx ON releases (product_id, is_published, published_at DESC);

CREATE TABLE install_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  product_id uuid NOT NULL REFERENCES products(id),
  token_hash text NOT NULL UNIQUE,
  status token_status NOT NULL DEFAULT 'issued',
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX install_tokens_lookup_idx ON install_tokens (token_hash, status, expires_at);
CREATE INDEX install_tokens_user_idx ON install_tokens (user_id, created_at DESC);

CREATE TABLE update_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  product_id uuid NOT NULL REFERENCES products(id),
  credential_hash text NOT NULL UNIQUE,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX update_credentials_lookup_idx ON update_credentials (credential_hash, revoked_at);
-- 每个 (用户, 商品) 最多一条未撤销凭据:重新安装即轮换,旧凭据作废
CREATE UNIQUE INDEX update_credentials_one_active_idx
  ON update_credentials (user_id, product_id) WHERE revoked_at IS NULL;

CREATE TABLE admin_audit_log (
  id bigserial PRIMARY KEY,
  actor_user_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_log_created_idx ON admin_audit_log (created_at DESC);
CREATE INDEX admin_audit_log_target_idx ON admin_audit_log (target_type, target_id);
