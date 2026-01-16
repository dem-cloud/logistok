CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Χωρίς Όνομα',
  display_name TEXT NULL,
  tax_id TEXT NULL,
  tax_office TEXT NULL,
  address TEXT NULL,
  city TEXT NULL,
  postal_code TEXT NULL,
  country TEXT NULL,
  phone TEXT NULL,
  email TEXT NULL,
  logo_url TEXT NULL,
  settings JSONB NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
  stripe_customer_id TEXT NULL UNIQUE,
);

CREATE TABLE company_industries (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  industry_key TEXT NOT NULL REFERENCES industries(key) ON DELETE CASCADE,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()

  PRIMARY KEY (company_id, industry_key)
);

CREATE TABLE company_plugins (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plugin_key TEXT NOT NULL REFERENCES plugins(key) ON DELETE CASCADE,

  subscription_item_id UUID NULL REFERENCES subscription_items(id) ON DELETE CASCADE,

  -- 🔄 ΒΕΛΤΙΩΣΗ: Πιο explicit status
  status TEXT NOT NULL DEFAULT 'active' 
    CHECK (status IN ('active', 'inactive', 'suspended')),
  
  activated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMP NULL,

  settings JSONB NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(), -- 🆕 ΠΡΟΣΘΗΚΗ

  PRIMARY KEY (company_id, plugin_key)
);

CREATE TABLE company_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NULL REFERENCES roles(id) ON DELETE SET NULL,

  is_owner BOOLEAN NOT NULL DEFAULT FALSE,

  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'disabled')),

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
  default_role_key TEXT NOT NULL REFERENCES default_roles(key) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()

  PRIMARY KEY (default_role_key, permission_key)
);

CREATE TABLE default_roles (
  key TEXT PRIMARY KEY,           -- 'admin', 'manager'
  industry_id UUID NULL REFERENCES industries(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE industries (
  key TEXT PRIMARY KEY,        -- 'construction', 'retail'

  name TEXT NOT NULL,
  description TEXT NOT NULL,
  photo_url TEXT NOT NULL,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INT NOT NULL DEFAULT 100,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    invited_email TEXT NOT NULL,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,

    invited_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,

    token UUID NOT NULL DEFAULT gen_random_uuid(),

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMP NULL,
    expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE TABLE onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,

  current_step INT NOT NULL DEFAULT 1,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,

  data JSONB NOT NULL DEFAULT '{
      "company": {
          "name": "",
          "phone": ""
      },
      "industries": [],
      "plan": null,
      "plugins": [],
      "branches": 0
  }',

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()

);

CREATE TABLE payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  
  stripe_payment_intent_id TEXT NULL,
  stripe_invoice_id TEXT NULL,
  stripe_charge_id TEXT NULL,
  
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'eur',
  
  status TEXT NOT NULL CHECK (status IN (
    'pending', 'succeeded', 'failed', 'canceled', 'refunded'
  )),
  
  payment_method TEXT NULL, -- 'card', 'sepa_debit', etc.
  
  failure_reason TEXT NULL,
  
  metadata JSONB NULL,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NULL REFERENCES companies(id) ON DELETE CASCADE,

  key TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'system' CHECK (type IN ('system', 'plugin', 'custom')),

  added_by_plugin_key TEXT NULL REFERENCES plugins(key) ON DELETE SET NULL,
  added_by_user UUID NULL REFERENCES users(id) ON DELETE SET NULL,

  priority INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  metadata JSONB NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE permissions (
  key TEXT PRIMARY KEY,        -- 'inventory.stock.edit'
  plugin_key TEXT NULL REFERENCES plugins(key) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NULL,

  features JSONB NULL,

  -- Business logic
  included_branches INT NOT NULL DEFAULT 0,
  max_users_per_store INT NULL CHECK (max_users_per_store > 0),
  allows_paid_plugins BOOLEAN NOT NULL DEFAULT TRUE,
  is_free BOOLEAN NOT NULL DEFAULT FALSE,

  -- Stripe = source of truth
  stripe_price_id_monthly TEXT NULL,
  stripe_price_id_yearly TEXT NULL,
  stripe_extra_store_price_id_monthly TEXT NULL,
  stripe_extra_store_price_id_yearly TEXT NULL,

  -- Cache for UI only (NOT billing)
  cached_price_monthly DECIMAL(10,2) NULL,
  cached_price_yearly DECIMAL(10,2) NULL,
  cached_extra_store_price_monthly DECIMAL(10,2) NULL,
  cached_extra_store_price_yealry DECIMAL(10,2) NULL,
  cached_currency TEXT NOT NULL DEFAULT 'EUR',
  cached_updated_at TIMESTAMP NULL,

  -- UI / ordering
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  priority INT NOT NULL DEFAULT 100,
  rank INT NOT NULL DEFAULT 1,
  is_popular BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE plugin_industries (
  plugin_key TEXT NOT NULL REFERENCES plugins(key) ON DELETE CASCADE,
  industry_key TEXT NOT NULL REFERENCES industries(key) ON DELETE CASCADE,

  relevance_score INT NOT NULL DEFAULT 1,  -- optional (1–5)

  created_at TIMESTAMP NOT NULL DEFAULT NOW()

  PRIMARY KEY (plugin_key, industry_key)
);

CREATE TABLE plugin_industry_recommendations (
  plugin_key TEXT NOT NULL REFERENCES plugins(key) ON DELETE CASCADE,
  industry_key TEXT NULL REFERENCES industries(key) ON DELETE CASCADE,

  scope TEXT NOT NULL DEFAULT 'onboarding'
    CHECK (scope IN ('onboarding', 'marketplace', 'upsell')),

  priority INT NOT NULL DEFAULT 100,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
  
  -- Χωρις primary key γιατι θα επρεπε να ειναι (plugin_key, industry_key, scope) αλλα το industry_key
  -- μπορει να ειναι και null. Οποτε βαζουμε τα unique indexes παρακατω
);

CREATE TABLE plugins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  key TEXT NOT NULL UNIQUE, -- stable identifier (π.χ. "inventory", "reports")

  name TEXT NOT NULL,
  description TEXT NULL,

  is_active BOOLEAN NOT NULL DEFAULT FALSE,

  default_settings JSONB NULL,

  -- Stripe = source of truth
  stripe_price_id_monthly TEXT NULL,
  stripe_price_id_yearly TEXT NULL,

  -- Cache for UI ONLY (not billing)
  cached_price_monthly DECIMAL(10,2) NULL,
  cached_price_yearly DECIMAL(10,2) NULL,
  cached_currency TEXT NOT NULL DEFAULT 'EUR',
  cached_updated_at TIMESTAMP NULL,

  photo_url TEXT NULL,
  current_version TEXT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE product_categories (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,

  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,

  parent_id BIGINT NULL REFERENCES product_categories(id) ON DELETE SET NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE product_variants (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,

  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  sku TEXT NULL,
  barcode TEXT NULL,

  cost_price NUMERIC(12,2) NULL CHECK (cost_price >= 0),

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,

  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_category_id BIGINT NULL REFERENCES product_categories(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  description TEXT NULL,

  unit_id BIGINT NULL REFERENCES units(id) ON DELETE SET NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE purchase_items (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,

  purchase_id BIGINT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,

  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,

  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  cost_price NUMERIC(10,2) NOT NULL,
  total_cost NUMERIC(12,2) GENERATED ALWAYS AS (quantity * cost_price) STORED,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE purchases (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,

  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  vendor_id UUID NULL REFERENCES vendors(id) ON DELETE SET NULL,
  payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,

  invoice_number TEXT NULL,
  invoice_date DATE NULL,

  subtotal NUMERIC(12,2) NULL,
  vat_total NUMERIC(12,2) NULL,
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),

  notes TEXT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('draft', 'ordered', 'received', 'completed', 'cancelled')),

  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,

  source TEXT NOT NULL DEFAULT 'default_role' CHECK (source IN ('default_role', 'plugin', 'custom')),

  created_at TIMESTAMP NOT NULL DEFAULT NOW()

  PRIMARY KEY (role_id, permission_key)
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

  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE sale_items (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,

  sale_id BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,

  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,

  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  sale_price NUMERIC(12,2) NOT NULL CHECK (sale_price >= 0),
  total_price NUMERIC(12,2) GENERATED ALWAYS AS (sale_price * quantity) STORED,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE sales (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,

  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id UUID NULL REFERENCES customers(id) ON DELETE SET NULL,
  payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,

  invoice_number TEXT NULL,
  invoice_type TEXT NOT NULL DEFAULT 'receipt' CHECK (invoice_type IN ('receipt', 'invoice', 'refund')),

  subtotal NUMERIC(12,2) NULL,
  vat_total NUMERIC(12,2) NULL,
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),

  amount_paid NUMERIC(12,2) NULL CHECK (amount_paid >= 0),
  change_returned NUMERIC(12,2) NULL CHECK (change_returned >= 0),

  notes TEXT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'pos', 'online', 'api')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('draft', 'completed', 'cancelled', 'refunded')),

  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE stock_movements (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity NUMERIC(12,3) NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('sale', 'purchase', 'adjustment', 'transfer_in', 'transfer_out', 'return', 'damage', 'recount')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'sale', 'purchase', 'transfer', 'adjustment')),
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
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,

  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,

  stock_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  store_sale_price NUMERIC(12,2) NULL CHECK (store_sale_price >= 0),

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  name TEXT NOT NULL DEFAULT 'Κεντρική Αποθήκη',
  address TEXT NULL,
  city TEXT NULL,
  postal_code TEXT NULL,
  country TEXT NULL,
  phone TEXT NULL,
  email TEXT NULL,

  is_main BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE subscription_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,

  item_type TEXT NOT NULL CHECK (item_type IN ('plan', 'plugin', 'extra_store')),
  stripe_subscription_item_id TEXT NOT NULL UNIQUE,
  stripe_price_id TEXT NOT NULL,

  plugin_key TEXT NULL REFERENCES plugins(key) ON DELETE SET NULL,

  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),

  -- 🆕 ΠΡΟΣΘΗΚΗ: Price tracking
  unit_amount DECIMAL(10,2) NULL, -- Το ποσό που χρεώθηκε (για history)
  currency TEXT NULL DEFAULT 'eur',
  
  -- 🆕 ΠΡΟΣΘΗΚΗ: Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled')),

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,

  subscription_code TEXT NOT NULL UNIQUE,

  currency TEXT NOT NULL DEFAULT 'eur', -- 🆕 ΕΔΩ (το currency που χρεώθηκε)

  stripe_subscription_id TEXT NULL UNIQUE,

  billing_period TEXT NULL DEFAULT 'monthly'
    CHECK (billing_period IN ('monthly', 'yearly')),

  billing_status TEXT NOT NULL DEFAULT 'incomplete' CHECK (billing_status IN (
    'incomplete',        -- Αρχική κατάσταση
    'incomplete_expired',-- Αποτυχία πληρωμής
    'active', 
    'past_due', 
    'canceled', '
    incomplete', 
    'trialing'
  )),

  current_period_start TIMESTAMP NULL,
  current_period_end TIMESTAMP NULL,

  -- 🆕 ΠΡΟΣΘΗΚΗ: Trial tracking
  trial_start TIMESTAMP NULL,
  trial_end TIMESTAMP NULL,

  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  cancel_at TIMESTAMP NULL,
  canceled_at TIMESTAMP NULL,

  -- 🆕 ΠΡΟΣΘΗΚΗ: Audit fields
  metadata JSONB NULL, -- Για extra info (promo codes, notes, etc.)

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

  decimals SMALLINT NOT NULL DEFAULT 2 CHECK (decimals >= 0 AND decimals <= 6),

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  fingerprint TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL UNIQUE,

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
  password_hash TEXT NULL,

  phone TEXT NULL,
  
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,

  profile_photo_url TEXT NULL,

  google_id TEXT NULL UNIQUE,

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
  attempts INT NOT NULL DEFAULT 0,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);