
# 🗂 Table: store_plugins

---

Αντιπροσωπεύει **ποια plugins είναι ενεργοποιημένα σε κάθε store** μίας εταιρείας.  
Ενώ ο πίνακας `company_plugins` δηλώνει ποια plugins έχει αγοράσει/ενεργοποιήσει η εταιρεία συνολικά, ο πίνακας `store_plugins` καθορίζει τη **διαθεσιμότητα και τις ρυθμίσεις του plugin σε επίπεδο καταστήματος**.

Είναι απαραίτητος σε συστήματα όπου:
- μια εταιρεία έχει πολλά stores,
- αλλά το plugin πρέπει να ενεργοποιείται μόνο σε μερικά από αυτά  
  (π.χ. Fuel Station plugin μόνο στο πρατήριο, όχι στο mini market).

Επιπλέον περιέχει **store-level settings**, ώστε κάθε store να έχει ξεχωριστή παραμετροποίηση του plugin.

**Works with:**
- `stores` → το store στο οποίο ενεργοποιείται το plugin
- `company_plugins` → το plugin που έχει δικαίωμα να χρησιμοποιήσει η εταιρεία
- `plugins` (έμμεσα) → το global plugin definition
- `role_plugin_permissions` (έμμεσα) → plugin permissions εφαρμόζονται όταν είναι ενεργό το plugin στο store
- `stock_movements` / `sales` / custom plugin tables → plugin modules μπορεί να εξαρτώνται από store-level activation

Χρησιμοποιείται για:
- ενεργοποίηση/απενεργοποίηση plugins ανά store,
- διαφορετική παραμετροποίηση του plugin ανά υποκατάστημα,
- UI gating: το store “βλέπει” μόνο τα modules των ενεργών plugins του,
- επιχειρήσεις με πολλαπλές δραστηριότητες σε διαφορετικά stores,
- granular feature control.

Αποτελεί το “per-store plugin activation layer”, δηλαδή το επίπεδο που επιτρέπει **fine-grained λειτουργικότητα ανά κατάστημα**.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|--------|-------------|------|-----------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique store-plugin record |
| company_plugin_id (FK) | UUID | NOT NULL | — | References company_plugins(id). Ensures the company owns the plugin |
| store_id (FK) | UUID | NOT NULL | — | References stores(id). Store where the plugin is enabled |
| settings | JSONB | NULL | — | Store-specific plugin settings |
| is_active | BOOLEAN | NOT NULL | TRUE | Whether the plugin is active |
| created_at | TIMESTAMP | NOT NULL | NOW() | Creation timestamp |

---

## Notes

- Defines which plugins are enabled per store.
- company_plugins = purchased plugins
- store_plugins = which stores use them
- settings allows per-store customization

---

## 📌 2. Example Rows

| id     | company_plugin_id | store_id  | settings                           | is_active | created_at          |
| ------ | ----------------- | --------- | ---------------------------------- | --------- | ------------------- |
| sp-001 | cp-1111           | store-aaa | {"pump_mapping": {"1": "Pump #1"}} | TRUE      | 2025-01-01 10:00:00 |
| sp-002 | cp-1111           | store-bbb | {"pump_mapping": {"2": "Pump #2"}} | TRUE      | 2025-01-01 10:05:00 |
| sp-003 | cp-2222           | store-ccc | {"size_chart": "EU"}               | TRUE      | 2025-01-02 09:00:00 |
| sp-004 | cp-3333           | store-aaa | NULL                               | FALSE     | 2025-01-03 12:30:00 |

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE store_plugins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_plugin_id UUID NOT NULL REFERENCES company_plugins(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  settings JSONB NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX store_plugins_unique_pair
ON store_plugins (company_plugin_id, store_id);
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO store_plugins
  (company_plugin_id, store_id, settings, is_active)
VALUES
  -- Fuel plugin enabled in two stores
  (
    'cp-1111',
    'store-aaa',
    '{"pump_mapping": {"1": "Pump #1"}}',
    TRUE
  ),
  (
    'cp-1111',
    'store-bbb',
    '{"pump_mapping": {"2": "Pump #2"}}',
    TRUE
  ),

  -- Clothing plugin enabled in store CCC
  (
    'cp-2222',
    'store-ccc',
    '{"size_chart": "EU"}',
    TRUE
  ),

  -- Disabled plugin for store AAA
  (
    'cp-3333',
    'store-aaa',
    NULL,
    FALSE
  );
```

