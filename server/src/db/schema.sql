CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('Admin', 'Sales', 'Warehouse', 'Accounts');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE customer_type AS ENUM ('Retail', 'Wholesale', 'Distributor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE customer_status AS ENUM ('Lead', 'Active', 'Inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE movement_type AS ENUM ('IN', 'OUT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE challan_status AS ENUM ('Draft', 'Confirmed', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE followup_status AS ENUM ('Pending', 'Completed', 'Rescheduled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(180) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name VARCHAR(150) NOT NULL,
  mobile VARCHAR(20) NOT NULL,
  email VARCHAR(180),
  business_name VARCHAR(180) NOT NULL,
  gst_number VARCHAR(20),
  customer_type customer_type NOT NULL,
  address TEXT NOT NULL,
  status customer_status NOT NULL DEFAULT 'Lead',
  follow_up_date DATE,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customers_search ON customers(customer_name, business_name, mobile);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(customer_type);
CREATE INDEX IF NOT EXISTS idx_customers_followup ON customers(follow_up_date) WHERE follow_up_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS customer_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  next_follow_up_date DATE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE customer_followups ADD COLUMN IF NOT EXISTS status followup_status NOT NULL DEFAULT 'Pending';
ALTER TABLE customer_followups ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE customer_followups ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE customer_followups ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES users(id);
ALTER TABLE customer_followups ADD COLUMN IF NOT EXISTS rescheduled_at TIMESTAMPTZ;
ALTER TABLE customer_followups ADD COLUMN IF NOT EXISTS rescheduled_by UUID REFERENCES users(id);
ALTER TABLE customer_followups ADD COLUMN IF NOT EXISTS rescheduled_to UUID REFERENCES customer_followups(id);
UPDATE customer_followups
SET scheduled_at = next_follow_up_date::timestamp + INTERVAL '10 hours'
WHERE scheduled_at IS NULL AND next_follow_up_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_followups_schedule ON customer_followups(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_followups_customer_created ON customer_followups(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name VARCHAR(180) NOT NULL,
  sku VARCHAR(60) UNIQUE NOT NULL,
  category VARCHAR(100) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  current_stock INTEGER NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  minimum_stock INTEGER NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  warehouse_location VARCHAR(120) NOT NULL,
  image_url TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
CREATE INDEX IF NOT EXISTS idx_products_search ON products(product_name, sku, category);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_warehouse ON products(warehouse_location);

CREATE TABLE IF NOT EXISTS challans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_number VARCHAR(30) UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  customer_snapshot JSONB NOT NULL,
  total_quantity INTEGER NOT NULL CHECK (total_quantity > 0),
  total_amount NUMERIC(14,2) NOT NULL CHECK (total_amount >= 0),
  status challan_status NOT NULL DEFAULT 'Draft',
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS challan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_id UUID NOT NULL REFERENCES challans(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  product_name VARCHAR(180) NOT NULL,
  sku VARCHAR(60) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total NUMERIC(14,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  quantity_changed INTEGER NOT NULL CHECK (quantity_changed > 0),
  movement_type movement_type NOT NULL,
  reason VARCHAR(255) NOT NULL,
  challan_id UUID REFERENCES challans(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id),
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id UUID,
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL,
  title VARCHAR(140) NOT NULL,
  message TEXT NOT NULL,
  to_path TEXT,
  dedupe_key VARCHAR(220) NOT NULL,
  entity_type VARCHAR(60),
  entity_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_challans_status_created ON challans(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_challans_number ON challans(challan_number);

CREATE SEQUENCE IF NOT EXISTS challan_number_seq START 1001;
