# 🗂 Table: payment_methods

---

Περιέχει τα **διαθέσιμα payment methods** που μπορεί να χρησιμοποιήσει μια εταιρεία στις πωλήσεις της (π.χ. Μετρητά, POS, Τράπεζα, Πίστωση).  
Ο πίνακας μπορεί να περιέχει τόσο **global default methods** όσο και **custom methods** που δημιουργεί μια εταιρεία.

Εάν το σύστημα είναι plugin-based, κάποια plugins (π.χ. fuel_station, delivery) μπορεί να προσθέτουν δικά τους custom payment methods.

**Works with:**
- `companies` → αν το payment method είναι custom, συνδέεται με συγκεκριμένη εταιρεία (company_id)  
- `sales` → κάθε πώληση χρησιμοποιεί ένα payment method
- `subscriptions` / `company_plugins` (έμμεσα) → plugins μπορούν να προσθέτουν extra payment types
- `default_roles` / `permissions` (έμμεσα) → permissions μπορεί να περιορίζουν ποιο payment method μπορεί να επιλέξει ένας χρήστης

Χρησιμοποιείται για:
- ορισμό διαθέσιμων τρόπων πληρωμής στο POS,
- διαχωρισμό πωλήσεων ανά τρόπο πληρωμής,
- reports πωλήσεων ανά payment type,
- προσθήκη custom μεθόδων από την εταιρεία (π.χ. “Πίστωση σε πελάτη X”).

Είναι κρίσιμος πίνακας για τη λειτουργία POS ή χειροκίνητων πωλήσεων.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|-------|--------|------|---------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique payment method identifier |
| company_id (FK) | UUID | NULL | — | References companies(id). Each company can have its own payment methods. Null for general payment methods. |
| key | TEXT | NOT NULL | — | Payment method key (e.g., "cash", "card", "bank_transfer") |
| name | TEXT | NOT NULL | — | Payment method name (e.g., "Cash", "Card", "Bank Transfer") |
| type | TEXT | NOT NULL | 'system' | Type of payment: 'system', 'plugin', 'custom' |
| added_by_plugin_key (FK) | TEXT | NULL | — | The plugin that created it (NULL = system/global OR custom by user) |
| added_by_user (FK) | UUID | NULL | — | If the user created it manually (NULL when system/plugin created it) |
| priority | INT | NOT NULL | 100 | Order of appearance in UI (lower = higher priority) |
| is_active | BOOLEAN | NOT NULL | TRUE | Whether the payment method is available |
| metadata | JSONB | NULL | — | Optional metadata (e.g., POS terminal settings) |
| created_at | TIMESTAMP | NOT NULL | NOW() | Creation timestamp |

---

## ℹ️ Notes

✔ 1. Υποστηρίζει 3 είδη payment methods

**system**
  - Παρέχονται από το SaaS out-of-the-box
  - Διαθέσιμα σε όλες τις εταιρείες
  - Δεν μπορούν να διαγραφούν (μόνο να απενεργοποιηθούν)

**plugin**
  - Δημιουργούνται από plugins
  - Ενεργοποιούνται μόνο αν η εταιρεία έχει αγοράσει το plugin
  - Παραδείγματα: Fuel account, PayPal, Split payments

**custom**
  - Δημιουργούνται από τον χρήστη
  - Μόνο για συγκεκριμένη εταιρεία
  - Παράδειγμα: “Πληρωμή στον οδηγό”, “Πίστωση 30 ημερών”

✔ 2. Τι γίνεται με το `company_id`;
  - `NULL` → global method shared by all companies
  - value → custom method or plugin method restricted to that company

Αυτό σου επιτρέπει hybrid behavior:

| type | company_id |	meaning |
| --- | --- | --- |
| system | NULL |	visible to all |
| plugin | NULL |	plugin that is globally available |
| plugin | company_id | plugin-enabled only for that company |
| custom | company_id |	user-created payment method |

✔ 3. Γιατί υπάρχει `added_by_plugin_key`;

Για να μπορείς να:
  - απενεργοποιήσεις όλα τα plugin payment methods όταν αφαιρεθεί plugin
  - κάνεις audit “ποιος δημιούργησε αυτό το method”
  - φορτώνεις αυτόματα payment methods που προστέθηκαν από τρίτους developers

Δεν πρέπει να έχει FK constraint (plugins μπορεί να διαγραφούν).

✔ 4. Γιατί υπάρχει `added_by_user`;

Χρήσιμο όταν:
  - οι χρήστες δημιουργούν δικά τους payment methods
  - θέλεις audit trail
  - θες UI message: “Created by admin John”

✔ 5. Τι ρόλο παίζει το `priority`;

Ελέγχει τη σειρά εμφάνισης στο UI.

Συνηθισμένη λογική:

| priority | meaning |
| --- | --- |
| 1–10	| very common methods |
| 11–50	| optional methods |
| 100	| fallback default |

✔ 6. Τι είναι το metadata;

Παράδειγμα:
```json
{
  "terminal": "VivaPOS",
  "supports_refunds": true,
  "requires_signature": false
}
```

Χρήσιμο για:
  - POS integrators
  - Εξωτερικά APIs
  - Advanced plugin configurations

---

## 📌 2. Example Rows

| id     | company_id | key            | name           | type   | added_by_plugin_key | added_by_user | priority | is_active | metadata                  | created_at          |
| ------ | ---------- | -------------- | -------------- | ------ | ------------------- | ------------- | -------- | --------- | ------------------------- | ------------------- |
| pm-001 | NULL       | cash           | Cash           | system | NULL                | NULL          | 1        | TRUE      | {}                        | 2025-01-01 10:00:00 |
| pm-002 | NULL       | card           | Card           | system | NULL                | NULL          | 2        | TRUE      | {"terminal": "VivaPOS"}   | 2025-01-01 10:00:01 |
| pm-003 | NULL       | bank_transfer  | Bank Transfer  | system | NULL                | NULL          | 3        | TRUE      | NULL                      | 2025-01-01 10:00:02 |
| pm-004 | com-1111   | fuel_account   | Fuel Account   | plugin | fuel_station        | NULL          | 10       | TRUE      | {"sync": true}            | 2025-01-01 10:00:03 |
| pm-005 | com-1111   | loyalty_points | Loyalty Points | custom | NULL                | usr-22        | 20       | TRUE      | {"conversion_rate": 0.01} | 2025-01-01 10:00:04 |
| pm-006 | NULL       | paypal         | PayPal         | plugin | ecommerce           | NULL          | 5        | FALSE     | NULL                      | 2025-01-01 10:00:05 |

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
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

CREATE UNIQUE INDEX payment_methods_unique_company_key
ON payment_methods (company_id, key);

CREATE INDEX idx_payment_methods_company_id ON payment_methods(company_id);
CREATE INDEX payment_methods_plugin_idx
ON payment_methods (added_by_plugin_key);
CREATE INDEX payment_methods_added_by_user_idx
ON payment_methods (added_by_user);
CREATE INDEX payment_methods_is_active_idx
ON payment_methods (is_active);
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO payment_methods 
  (id, company_id, key, name, type, added_by_plugin_key, added_by_user, priority, is_active, metadata)
VALUES
  -- System-wide default payment methods
  (gen_random_uuid(), NULL, 'cash', 'Cash', 'system', NULL, NULL, 1, TRUE, '{}'::jsonb),
  (gen_random_uuid(), NULL, 'card', 'Card', 'system', NULL, NULL, 2, TRUE, '{"terminal": "VivaPOS"}'),
  (gen_random_uuid(), NULL, 'bank_transfer', 'Bank Transfer', 'system', NULL, NULL, 3, TRUE, NULL),

  -- Plugin-created payment method (Fuel Station plugin)
  (gen_random_uuid(), '00000000-0000-0000-0000-COMPANY1111', 
      'fuel_account', 'Fuel Account', 'plugin', 'fuel_station', NULL, 10, TRUE,
      '{"sync": true}'::jsonb),

  -- User-created custom method
  (gen_random_uuid(), '00000000-0000-0000-0000-COMPANY1111',
      'loyalty_points', 'Loyalty Points', 'custom', NULL, '00000000-0000-0000-0000-USER0022', 
      20, TRUE, '{"conversion_rate": 0.01}'::jsonb),

  -- Plugin method but disabled globally
  (gen_random_uuid(), NULL,
      'paypal', 'PayPal', 'plugin', 'ecommerce', NULL,
      5, FALSE, NULL);
```