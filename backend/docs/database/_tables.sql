CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_name TEXT NULL,
  tax_id TEXT NULL,
  tax_office TEXT NULL,
  address TEXT NULL,
  city TEXT NULL,
  postal_code TEXT NULL,
  country TEXT NULL,
  phone TEXT NULL,
  email TEXT NULL,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID NULL REFERENCES subscriptions(id) ON DELETE SET NULL,
  logo_url TEXT NULL,
  settings JSONB NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE company_industries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  industry_id UUID NOT NULL REFERENCES industries(id) ON DELETE CASCADE,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE company_plugins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plugin_key TEXT NOT NULL REFERENCES plugins(plugin_key) ON DELETE CASCADE,
  subscription_item_id UUID NULL REFERENCES subscription_items(id) ON DELETE CASCADE,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  activated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMP NULL,

  settings JSONB NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE company_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NULL REFERENCES roles(id) ON DELETE SET NULL,

  is_owner BOOLEAN NOT NULL DEFAULT FALSE,
  invited_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'active',
  -- Recommended statuses: 'active', 'pending', 'disabled'

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  full_name TEXT NOT NULL,
  email TEXT NULL,
  phone TEXT NULL,

  tax_id TEXT NULL,
  address TEXT NULL,
  city TEXT NULL,
  postal_code TEXT NULL,
  country TEXT NULL,
  notes TEXT NULL,

  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE default_role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  default_role_key TEXT NOT NULL REFERENCES default_roles(key) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permissions(permission_key) ON DELETE CASCADE,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE default_role_plugin_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  default_role_key TEXT NOT NULL REFERENCES default_roles(key) ON DELETE CASCADE,
  plugin_key TEXT NOT NULL REFERENCES plugins(plugin_key) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permissions(permission_key) ON DELETE CASCADE,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE default_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_id UUID NULL REFERENCES industries(id) ON DELETE CASCADE,

  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE industries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  photo_url TEXT NOT NULL,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INT NOT NULL DEFAULT 100,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,

  current_step INT NULL DEFAULT 1,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,

  extra_data JSONB NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NULL REFERENCES companies(id) ON DELETE CASCADE,

  key TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'system', -- plugin, custom

  added_by_plugin_key TEXT NULL REFERENCES plugins(plugin_key) ON DELETE SET NULL,
  added_by_user UUID NULL REFERENCES users(id) ON DELETE SET NULL,

  priority INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  metadata JSONB NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NULL,

  max_users_per_store INT NULL,

  features JSONB NULL,

  stripe_price_id_monthly TEXT NULL,
  stripe_price_id_yearly TEXT NULL,
  stripe_extra_store_price_id TEXT NULL,

  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  priority INT NOT NULL DEFAULT 100,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE plugin_industries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  plugin_key TEXT NOT NULL REFERENCES plugins(key) ON DELETE CASCADE,
  industry_id UUID NOT NULL REFERENCES industries(id) ON DELETE SET NULL,

  priority INT NOT NULL DEFAULT 100,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE plugin_industry_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  industry_id UUID NULL REFERENCES industries(id) ON DELETE SET NULL,
  plugin_key TEXT NOT NULL REFERENCES plugins(key) ON DELETE CASCADE,

  priority INT NOT NULL DEFAULT 100,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE plugin_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  plugin_key TEXT NOT NULL REFERENCES plugins(plugin_key) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE plugins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,

  name TEXT NOT NULL,
  description TEXT NULL,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  default_settings JSONB NULL,

  stripe_price_id_monthly TEXT NULL,
  stripe_price_id_yearly TEXT NULL,

  photo_url TEXT NULL,
  current_version TEXT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE product_categories (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,,

  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,

  parent_id BIGINT NULL REFERENCES product_categories(id) ON DELETE SET NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE product_variants (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,,

  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  sku TEXT NULL UNIQUE,
  barcode TEXT NULL,

  cost_price NUMERIC(10,2) NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,,

  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_category_id BIGINT NULL REFERENCES product_categories(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  description TEXT NULL,

  unit_id BIGINT NULL REFERENCES units(id) ON DELETE SET NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE purchase_items (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,,

  purchase_id BIGINT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,

  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE,

  quantity NUMERIC(12,3) NOT NULL,
  cost_price NUMERIC(10,2) NOT NULL,
  total_cost NUMERIC(12,2) GENERATED ALWAYS AS (quantity * cost_price) STORED,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE purchases (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,,

  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  vendor_id UUID NULL REFERENCES vendors(id) ON DELETE SET NULL,
  payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,

  invoice_number TEXT NULL,
  invoice_date DATE NULL,

  subtotal NUMERIC(12,2) NULL,
  vat_total NUMERIC(12,2) NULL,
  total_amount NUMERIC(12,2) NOT NULL,

  notes TEXT NULL,
  status TEXT NOT NULL DEFAULT 'completed',

  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,

  source TEXT NOT NULL DEFAULT 'system',
  plugin_key TEXT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE role_store_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE sale_items (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,,

  sale_id BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,

  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE,

  quantity NUMERIC(12,3) NOT NULL,
  sale_price NUMERIC(10,2) NOT NULL,
  total_price NUMERIC(12,2) GENERATED ALWAYS AS (sale_price * quantity) STORED,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE sales (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,,

  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id UUID NULL REFERENCES customers(id) ON DELETE SET NULL,
  payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,

  invoice_number TEXT NULL,
  invoice_type TEXT NOT NULL DEFAULT 'receipt',

  subtotal NUMERIC(12,2) NULL,
  vat_total NUMERIC(12,2) NULL,
  total_amount NUMERIC(12,2) NOT NULL,

  amount_paid NUMERIC(12,2) NULL,
  change_returned NUMERIC(12,2) NULL,

  notes TEXT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'completed',

  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE stock_movements (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE,
  quantity NUMERIC(12,3) NOT NULL,
  movement_type TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  related_document_id UUID NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE store_plugins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_plugin_id UUID NOT NULL REFERENCES company_plugins(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  settings JSONB NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE store_products (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,,

  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE,

  stock_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  store_sale_price NUMERIC(12,2) NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  address TEXT NULL,
  city TEXT NULL,
  postal_code TEXT NULL,
  country TEXT NULL,
  phone TEXT NULL,
  email TEXT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE subscription_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,

  item_type TEXT NOT NULL CHECK (item_type IN ('plan', 'addon', 'extra_store')),
  stripe_subscription_item_id TEXT NOT NULL,
  stripe_price_id TEXT NOT NULL,

  plugin_key TEXT NULL REFERENCES plugins(key) ON DELETE SET NULL,

  quantity INT NOT NULL DEFAULT 1,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,

  subscription_code TEXT NOT NULL,

  stripe_customer_id TEXT NULL,
  stripe_subscription_id TEXT NULL,

  billing_period TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_period IN ('monthly', 'yearly')),

  billing_status TEXT NOT NULL DEFAULT 'active'
    CHECK (billing_status IN ('active', 'past_due', 'canceled', 'incomplete')),

  current_period_start TIMESTAMP NULL,
  current_period_end TIMESTAMP NULL,

  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  cancel_at TIMESTAMP NULL,
  canceled_at TIMESTAMP NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE units (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,

  unit_key TEXT NOT NULL UNIQUE,

  name_singular TEXT NOT NULL,
  name_plural TEXT NOT NULL,

  symbol TEXT NULL,
  description TEXT NULL,

  is_system BOOLEAN DEFAULT FALSE,
  added_by_plugin_key TEXT NULL,

  decimals SMALLINT NOT NULL DEFAULT 2,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  fingerprint TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL,

  ip_address TEXT NULL,
  user_agent TEXT NULL,

  expires_at TIMESTAMP NOT NULL,

  revoked BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMP NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMP NULL
);

CREATE TABLE user_store_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  first_name TEXT NULL,
  last_name TEXT NULL,

  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,

  phone TEXT NULL,
  
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,

  status TEXT NOT NULL DEFAULT 'active',

  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  profile_photo_url TEXT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  contact_name TEXT NULL,
  phone TEXT NULL,
  email TEXT NULL,
  address TEXT NULL,
  city TEXT NULL,
  postal_code TEXT NULL,
  country TEXT NULL,
  tax_id TEXT NULL,
  notes TEXT NULL,

  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NULL REFERENCES users(id) ON DELETE CASCADE,

  email TEXT NULL,
  phone TEXT NULL,
  code_hash TEXT NOT NULL,

  delivery_method TEXT NOT NULL CHECK (delivery_method IN ('email', 'sms', 'device')),

  type TEXT NOT NULL CHECK (type IN ('signup', 'password_reset', 'email_change')),

  expires_at TIMESTAMP NOT NULL,

  consumed BOOLEAN NOT NULL DEFAULT FALSE,
  consumed_at TIMESTAMP NULL,

  ip_address TEXT NULL,
  fingerprint TEXT NULL,
  attempts INT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);