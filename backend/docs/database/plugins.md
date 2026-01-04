# 🗂 Table: plugins

---

Περιέχει τη **global λίστα των διαθέσιμων plugins/add-ons** που μπορεί να ενεργοποιήσει μια εταιρεία.  
Κάθε plugin αντιπροσωπεύει ένα επεκτάσιμο module (π.χ. Fuel Station, Delivery, Clothing Variants, POS Pro), το οποίο μπορεί να προσθέτει λειτουργίες, permissions, settings και UI components.

Τα plugins είναι global — δεν ανήκουν σε εταιρείες· οι εταιρείες τα ενεργοποιούν μέσω του `company_plugins`.

**Works with:**
- `company_plugins` → ποιες εταιρείες έχουν ενεργό το plugin
- `plugin_industries` → σε ποιους κλάδους ανήκει το plugin
- `plugin_industry_recommendations` → σε ποιους κλάδους προτείνεται το plugin
- `store_plugins` → ενεργοποίηση plugin σε συγκεκριμένα stores
- `role_plugin_permissions` → permissions που δίνονται στους ρόλους της εταιρείας όταν ενεργοποιηθεί το plugin

Χρησιμοποιείται για:
- marketplace εμφάνιση διαθέσιμων plugins,
- pricing και addon billing (Stripe price IDs),
- δυναμικό permission injection,
- ενεργοποίηση industry-specific modules,
- φόρτωση plugin settings και configuration.

Αποτελεί τον πυρήνα του extensibility system και ορίζει το τι δυνατότητες μπορεί να αποκτήσει μια εταιρεία.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|--------|---------|------|----------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique identifier for the plugin |
| key | TEXT | NOT NULL | — | Unique string key for the plugin (e.g. "fuel_station") |
| name | TEXT | NOT NULL | — | Display name of the plugin |
| description | TEXT | NULL | — | Short description of what the plugin does |
| is_active | BOOLEAN | NOT NULL | FALSE | Whether the plugin is available in the system |
| default_settings | JSONB | NULL | — | JSON schema describing plugin settings |
| stripe_price_id_monthly | TEXT | NULL | — | Stripe price ID if plugin is billed monthly |
| stripe_price_id_yearly | TEXT | NULL | — | Stripe price ID if plugin is billed yearly |
| photo_url | TEXT | NULL | — | Plugin photo |
| current_version | TEXT | NULL | — | Plugin current version |
| created_at | TIMESTAMP | NOT NULL | NOW() | Creation timestamp |

---

## ℹ️ Notes

✔ Τα plugins μπορούν να ενεργοποιούνται/απενεργοποιούνται χωρίς διαγραφή

is_active = FALSE σημαίνει ότι το plugin δεν εμφανίζεται στο marketplace, αλλά δεν σβήνεις ιστορικά δεδομένα.

✔ Το default_settings χρησιμεύει:
  - για reset
  - για δημιουργία store/plugin settings
  - για automatic setup στο onboarding

✔ Το key είναι το primary unique identity του plugin

Ποτέ δεν πρέπει να αλλάζει
(όπως package name σε Android, slug σε WordPress, addon id στο Odoo).

✔ Stripe prices μπορούν να είναι NULL

Αν το plugin:
  - είναι free
  - ή δεν έχει ακόμη billing model
  - ή είναι B2B custom offering


Γιατί plugin_key και όχι UUID:

1. Το plugin είναι product, όχι runtime entity

Τα plugins:
- είναι predefined από εσένα
- έχουν versioning
- μπαίνουν σε marketplace
- εγκαθίστανται / απεγκαθίστανται

➡️ Άρα χρειάζονται σταθερό identifier.

- 'inventory'
- 'crm'
- 'payroll'


UUID:
- αλλάζει ανά env
- σπάει portability
- δυσκολεύει seed / migration

2. Permissions χρειάζονται σταθερό namespace
- inventory.stock.view
- inventory.stock.edit


Αν το FK ήταν UUID:
- πώς το plugin θα ξέρει ποιο UUID έχει;
- πώς θα κάνει seed σε άλλο environment;

➡️ Αδύνατο χωρίς lookup.

3. Plugin install = pure data operation

Με plugin_key:

```sql
INSERT INTO permissions
VALUES ('inventory.stock.edit', 'inventory', 'Edit stock');
```

Χωρίς να νοιάζεσαι για IDs.
---

## 📌 2. Example Rows

| id       | key          | name                   | description                                       | is_active | default_settings                                    | stripe_price_id_monthly | stripe_price_id_yearly | photo_url                                                            | current_version | created_at          |
| -------- | ------------ | ---------------------- | ------------------------------------------------- | --------- | --------------------------------------------------- | ----------------------- | ---------------------- | -------------------------------------------------------------------- | --------------- | ------------------- |
| plug-001 | gas_station | Gas Station Module    | Διαχείριση αντλιών, δεξαμενών & κινήσεων καυσίμου | TRUE      | {"track_pumps": true, "auto_sync": false}           | price_123_month         | price_123_year         | [https://example.com/fuel.jpg](https://example.com/fuel.jpg)         | 1.0.0           | 2025-01-01 10:00:00 |
| plug-002 | clothing     | Clothing Module        | Μεγέθη, χρώματα, SKU matrix, variants             | TRUE      | {"size_types": ["S","M","L"], "color_matrix": true} | price_456_month         | price_456_year         | [https://example.com/clothing.jpg](https://example.com/clothing.jpg) | 1.2.0           | 2025-01-01 10:00:01 |
| plug-003 | pos          | POS System             | Point-of-sale interface για desktop & tablet      | TRUE      | {"receipt_footer": ""}                              | price_789_month         | price_789_year         | [https://example.com/pos.jpg](https://example.com/pos.jpg)           | 2.0.0           | 2025-01-01 10:00:02 |
| plug-004 | crm          | CRM Module             | Παρακολούθηση πελατών, follow-ups & loyalty       | TRUE      | {"enable_loyalty": true}                            | price_crm_m             | price_crm_y            | [https://example.com/crm.jpg](https://example.com/crm.jpg)           | 1.0.5           | 2025-01-01 10:00:03 |
| plug-005 | appointments | Appointment Scheduling | Ραντεβού για συνεργεία, κουρεία, σαλόνια          | FALSE     | {"default_duration": 30}                            | NULL                    | NULL                   | [https://example.com/appt.jpg](https://example.com/appt.jpg)         | 0.9.0           | 2025-01-01 10:00:04 |


---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
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


CREATE INDEX idx_plugins_is_active ON plugins(is_active);
CREATE INDEX idx_plugins_key ON plugins(key);
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO plugins 
  (id, key, name, description, is_active, default_settings,
   stripe_price_id_monthly, stripe_price_id_yearly, photo_url, current_version)
VALUES
  (
    gen_random_uuid(),
    'fuel_station',
    'Fuel Station Module',
    'Διαχείριση αντλιών, δεξαμενών και κινήσεων καυσίμου',
    TRUE,
    '{"track_pumps": true, "auto_sync": false}',
    'price_123_month',
    'price_123_year',
    'https://example.com/fuel.jpg',
    '1.0.0'
  ),
  (
    gen_random_uuid(),
    'clothing',
    'Clothing Module',
    'Μεγέθη, χρώματα, SKU matrix, variants για καταστήματα ρούχων',
    TRUE,
    '{"size_types": ["S","M","L"], "color_matrix": true}',
    'price_456_month',
    'price_456_year',
    'https://example.com/clothing.jpg',
    '1.2.0'
  ),
  (
    gen_random_uuid(),
    'pos',
    'POS System',
    'Point-of-sale interface για desktop και tablet',
    TRUE,
    '{"receipt_footer": ""}',
    'price_789_month',
    'price_789_year',
    'https://example.com/pos.jpg',
    '2.0.0'
  ),
  (
    gen_random_uuid(),
    'crm',
    'CRM Module',
    'Customer relationship tracking, follow-ups & loyalty system',
    TRUE,
    '{"enable_loyalty": true}',
    'price_crm_m',
    'price_crm_y',
    'https://example.com/crm.jpg',
    '1.0.5'
  ),
  (
    gen_random_uuid(),
    'appointments',
    'Appointment Scheduling',
    'Ραντεβού για συνεργεία, κουρεία, σαλόνια και τεχνικά επαγγέλματα',
    FALSE,
    '{"default_duration": 30}',
    NULL,
    NULL,
    'https://example.com/appt.jpg',
    '0.9.0'
  );
```