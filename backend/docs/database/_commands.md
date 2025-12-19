
---

Εγκατέστησε αυτά τα extensions:

✔ Markdown All in One

Προσθέτει shortcuts, TOC, formatting.

✔ Markdown Preview Enhanced

Σου δίνει τέλειο preview όπως documentation pages.

✔ Markdown Table Prettify

Κάνει τους πίνακες να φαίνονται καθαροί & aligned.

# 🟦 ⭐ ΠΩΣ ΝΑ ΤΟ ΒΑΖΕΙΣ ΣΤΟ VSCode

1. Δημιούργησε αρχείο:

2. Κάνε paste το template με τα πραγματικά δεδομένα.

3. Πάτα **Ctrl+Shift+V** → βλέπεις τέλειο preview.

4. Πάτα **ALT+SHIFT+F** → format table clean.

---
---

# Database tables

companies
company_industries
company_plugins
company_users
customers
onboarding
plans
product_variants
products
purchase_items
purchases
role_permissions
role_store_restrictions
roles
sale_items
sales
stock_movements
store_plugins
store_products
stores
subscription_items
subscriptions
user_sessions
user_store_access
users
vendors
verification_codes

**Default values tables:**

permissions
industries
default_roles
default_role_permissions
plugins
plugin_industries
plugin_industry_recommendations or plugin_recommendations
payment_methods
product_categories
units


# Missing Fields ??

-- stores table - add:
is_active BOOLEAN NOT NULL DEFAULT TRUE,
updated_at TIMESTAMP NOT NULL DEFAULT NOW()

-- products table - add:
is_active BOOLEAN NOT NULL DEFAULT TRUE,
updated_at TIMESTAMP NOT NULL DEFAULT NOW()

-- product_variants table - add:
is_active BOOLEAN NOT NULL DEFAULT TRUE,
updated_at TIMESTAMP NOT NULL DEFAULT NOW()

-- store_products table - add:
updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
min_stock_level NUMERIC(12,3) NULL CHECK (min_stock_level >= 0),
max_stock_level NUMERIC(12,3) NULL CHECK (max_stock_level >= min_stock_level)

-- customers table - add:
updated_at TIMESTAMP NOT NULL DEFAULT NOW()

-- vendors table - add:
updated_at TIMESTAMP NOT NULL DEFAULT NOW()

-- sales table - add:
discount_amount NUMERIC(12,2) NULL DEFAULT 0 CHECK (discount_amount >= 0),
updated_at TIMESTAMP NOT NULL DEFAULT NOW()

-- sale_items table - add:
discount_amount NUMERIC(12,2) NULL DEFAULT 0 CHECK (discount_amount >= 0),
vat_rate NUMERIC(5,2) NULL CHECK (vat_rate >= 0 AND vat_rate <= 100)

-- purchases table - add:
discount_amount NUMERIC(12,2) NULL DEFAULT 0 CHECK (discount_amount >= 0),
updated_at TIMESTAMP NOT NULL DEFAULT NOW()

-- purchase_items table - add:
discount_amount NUMERIC(12,2) NULL DEFAULT 0 CHECK (discount_amount >= 0),
vat_rate NUMERIC(5,2) NULL CHECK (vat_rate >= 0 AND vat_rate <= 100)

-- stock_movements table - add:
related_document_type TEXT NULL CHECK (related_document_type IN ('sale', 'purchase', 'transfer', 'adjustment')),
notes TEXT NULL

-- company_users table - add:
updated_at TIMESTAMP NOT NULL DEFAULT NOW()

# Improve Generated Columns ??

-- sale_items - modify:
total_price NUMERIC(12,2) GENERATED ALWAYS AS (
  (sale_price - COALESCE(discount_amount, 0)) * quantity
) STORED,

-- purchase_items - modify:
total_cost NUMERIC(12,2) GENERATED ALWAYS AS (
  (cost_price - COALESCE(discount_amount, 0)) * quantity
) STORED,