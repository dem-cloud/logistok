# 🗂 Table: plans

---

Περιέχει τα **διαθέσιμα subscription plans** του συστήματος (π.χ. Basic, Pro, Enterprise).  
Κάθε plan ορίζει το μηνιαίο ή ετήσιο κόστος, τη μέγιστη επιτρεπόμενη χρήση (π.χ. αριθμός χρηστών ή καταστημάτων), καθώς και ειδικά χαρακτηριστικά/περιορισμούς.

Τα plans είναι global και χρησιμοποιούνται κατά την αγορά ή αλλαγή συνδρομής.

**Works with:**
- `subscriptions` → κάθε εταιρεία έχει ένα ενεργό subscription plan
- `subscription_items` → περιέχει τις επιμέρους χρεώσεις για plan, add-ons και extra stores
- `company_plugins` (έμμεσα) → κάποια plans μπορεί να περιλαμβάνουν plugins by default
- `onboarding` → επιλογή plan στο τελικό βήμα
- `stripe` (έμμεσα) → τα plan rows συνδέονται με Stripe price IDs για billing

Χρησιμοποιείται για:
- διαμόρφωση pricing model (monthly/yearly),
- προσδιορισμό ορίων χρήσης (π.χ. max users, max stores),
- ενεργοποίηση/απενεργοποίηση features ανά tier,
- billing integration με Stripe,
- παρουσίαση διαθέσιμων πακέτων στο UI.

Αποτελεί τη βάση του συστήματος συνδρομών και τιμολόγησης.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|--------|--------|------|----------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique plan identifier |
| key | TEXT | NOT NULL | — | Unique string key for the plan (e.g., "basic", "pro", "business") |
| name | TEXT | NOT NULL | — | Display name of the plan |
| description | TEXT | NULL | — | Description of the plan |
| max_users_per_store | INT | NULL | — | Max number of users included |
| features | JSONB | NULL | — | Features available for this plan |
| stripe_price_id_monthly | TEXT | NULL | — | Stripe price ID for monthly billing |
| stripe_price_id_yearly | TEXT | NULL | — | Stripe price ID for yearly billing |
| stripe_extra_store_price_id | TEXT | NULL | — | Stripe price ID for extra store monthly billing |
| is_public | BOOLEAN | NOT NULL | FALSE | Whether customers can select this plan |
| priority | INT | NOT NULL | 100 | Ordering in the UI (lower = higher priority) |
| created_at | TIMESTAMP | NOT NULL | NOW() | When record was created |

---

## 📌 2. Example Rows

| id       | key        | name       | description                           | max_users_per_store | features                                                              | stripe_price_id_monthly | stripe_price_id_yearly | stripe_extra_store_price_id | is_public | priority | created_at          |
| -------- | ---------- | ---------- | ------------------------------------- | ------------------- | --------------------------------------------------------------------- | ----------------------- | ---------------------- | --------------------------- | --------- | -------- | ------------------- |
| plan-001 | basic      | Basic      | Βασικό πακέτο για μικρές επιχειρήσεις | 1                   | {"reports": false, "plugins_allowed": []}                             | NULL                    | NULL                   | NULL                        | TRUE      | 1        | 2025-01-01 10:00:00 |
| plan-002 | pro        | Pro        | Πλήρες πακέτο για επαγγελματίες       | 10                  | {"reports": true, "plugins_allowed": ["reporting"]}                   | price_123abc            | price_year_123abc      | price_extra_111             | TRUE      | 2        | 2025-01-01 10:00:01 |
| plan-003 | business   | Business   | Για επιχειρήσεις με πολλές ανάγκες    | NULL                  | {"reports": true, "priority_support": true, "plugins_allowed": ["*"]} | price_999aaa            | price_year_999aaa      | price_extra_999             | TRUE      | 3        | 2025-01-01 10:00:02 |
| plan-004 | exclusive | Exclusive Access | Custom πακέτο μόνο μέσω πωλητή        | NULL                | {"custom_contract": true}                                             | NULL                    | NULL                   | NULL                        | FALSE     | 100      | 2025-01-01 10:00:03 |

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NULL,

  features JSONB NULL,

  -- Business logic
  included_branches INT NOT NULL DEFAULT 0,
  max_users INT NULL CHECK (max_users > 0),
  max_products INT NULL CHECK (max_products > 0),
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


CREATE INDEX idx_plans_is_public ON plans(is_public, priority);
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO plans
  (key, name, description, max_users_per_store, features,
   stripe_price_id_monthly, stripe_price_id_yearly, stripe_extra_store_price_id,
   is_public, priority)
VALUES
  -- Basic (free)
  (
    'basic',
    'Basic',
    'Βασικό πακέτο για μικρές επιχειρήσεις',
    1,
    '{"reports": false, "plugins_allowed": []}'::jsonb,
    NULL,
    NULL,
    NULL,
    TRUE,
    1
  ),

  -- Pro
  (
    'pro',
    'Pro',
    'Πλήρες πακέτο για επαγγελματίες',
    10,
    '{"reports": true, "plugins_allowed": ["reporting"]}'::jsonb,
    'price_123abc',
    'price_year_123abc',
    'price_extra_111',
    TRUE,
    2
  ),

  -- Business
  (
    'business',
    'Business',
    'Για επιχειρήσεις με πολλές ανάγκες',
    NULL,
    '{"reports": true, "priority_support": true, "plugins_allowed": ["*"]}'::jsonb,
    'price_999aaa',
    'price_year_999aaa',
    'price_extra_999',
    TRUE,
    3
  ),

  -- Exclusive (hidden)
  (
    'exclusive',
    'Exclusive Access',
    'Custom πακέτο μόνο μέσω πωλητή',
    NULL,
    '{"custom_contract": true}'::jsonb,
    NULL,
    NULL,
    NULL,
    FALSE,
    100
  );
```