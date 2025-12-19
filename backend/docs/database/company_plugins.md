# 🗂 Table: company_plugins

---

Αντιπροσωπεύει **ποια plugins/addons έχει ενεργοποιήσει ή αγοράσει μία εταιρεία**.  
Κάθε row δηλώνει ότι μια εταιρεία έχει πρόσβαση σε ένα συγκεκριμένο plugin — είτε δωρεάν, είτε μέσω συνδρομής, είτε μέσω extra χρέωσης.

Ο πίνακας λειτουργεί ως η “κύρια λίστα” ενεργών plugins για κάθε εταιρεία.

**Works with:**
- `companies` → η εταιρεία που κατέχει το plugin
- `plugins` → ποιο plugin είναι ενεργό
- `subscription_items` → το billing line του plugin (addon billing, Stripe item)
- `store_plugins` → ενεργοποίηση/ρύθμιση του plugin ανά store (store-level availability)
- `role_plugin_permissions` → permissions που ενεργοποιούνται για ρόλους όταν το plugin είναι ενεργό

Χρησιμοποιείται για:
- προσθήκη/αγορά plugins,
- ενεργοποίηση λειτουργιών στο UI,
- ενεργοποίηση permissions ανά ρόλο,
- billing integration με Stripe (μέσω subscription items),
- προσθήκη plugin-level settings για την εταιρεία.

Αποτελεί τον πυρήνα του plugin system, καθώς καθορίζει *ποια features έχει ενεργά μια εταιρεία* στο SaaS.

**SOS**
UUID μόνο όταν το record έχει δική του ταυτότητα.
Associations → composite PK.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|-------|-------|------|---------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique identifier for the company-plugin installation |
| company_id (FK) | UUID | NOT NULL | — | References companies(id) |
| plugin_key (FK) | TEXT | NOT NULL | — | References plugins(plugin_key) |
| subscription_item_id (FK) | UUID | NULL | — | References subscription_items(id) |
| is_active | BOOLEAN | NOT NULL | TRUE | Whether the plugin is active for this company |
| activated_at | TIMESTAMP | NOT NULL | NOW() | When the plugin was activated |
| deactivated_at | TIMESTAMP | NULL | — | When the plugin was deactivated (soft disable) |
| settings | JSONB | NULL | — | Plugin-specific settings for this company |
| created_at | TIMESTAMP | NOT NULL | NOW() | Creation timestamp |

---

## 📌 2. Example Rows

| id     | company_id | plugin_key   | subscription_item_id | is_active | activated_at        | deactivated_at      | settings              | created_at          |
| ------ | ---------- | ------------ | -------------------- | --------- | ------------------- | ------------------- | --------------------- | ------------------- |
| cp-001 | comp-1111  | fuel_station | subitem-111          | TRUE      | 2025-01-01 10:00:00 | NULL                | {"auto_sync": true}   | 2025-01-01 10:00:00 |
| cp-002 | comp-1111  | reporting    | NULL                 | TRUE      | 2025-01-01 10:02:00 | NULL                | {}                    | 2025-01-01 10:02:00 |
| cp-003 | comp-2222  | clothing     | subitem-222          | TRUE      | 2025-01-01 10:05:00 | NULL                | {"size_matrix": "EU"} | 2025-01-01 10:05:00 |
| cp-004 | comp-3333  | fuel_station | subitem-333          | FALSE     | 2025-01-01 10:10:00 | 2025-02-01 09:00:00 | NULL                  | 2025-01-01 10:10:00 |

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE company_plugins (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plugin_key TEXT NOT NULL REFERENCES plugins(key) ON DELETE CASCADE,

  subscription_item_id UUID NULL REFERENCES subscription_items(id) ON DELETE CASCADE,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  activated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMP NULL,

  settings JSONB NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()

  PRIMARY KEY (company_id, plugin_key)
);

CREATE UNIQUE INDEX company_plugins_unique_company_plugin
ON company_plugins (company_id, plugin_key);

CREATE INDEX idx_company_plugins_company_id ON company_plugins(company_id);
CREATE INDEX idx_company_plugins_plugin_key ON company_plugins(plugin_key);
CREATE INDEX idx_company_plugins_active ON company_plugins(company_id, is_active); --?
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO company_plugins
  (company_id, plugin_key, subscription_item_id, is_active, activated_at, deactivated_at, settings)
VALUES
  -- Εταιρεία 1 αγοράζει το fuel station plugin μέσω subscription
  ('comp-1111', 'fuel_station', 'subitem-111', TRUE, NOW(), NULL, '{"auto_sync": true}'),

  -- Εταιρεία 1 έχει και reporting plugin (δωρεάν ή global)
  ('comp-1111', 'reporting', NULL, TRUE, NOW(), NULL, '{}'::jsonb),

  -- Εταιρεία 2, plugin για ρούχα (π.χ. size matrix)
  ('comp-2222', 'clothing', 'subitem-222', TRUE, NOW(), NULL, '{"size_matrix": "EU"}'),

  -- Εταιρεία 3 είχε plugin αλλά το απενεργοποίησε
  ('comp-3333', 'fuel_station', 'subitem-333', FALSE, NOW(), '2025-02-01 09:00:00', NULL);
```