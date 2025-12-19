# 🗂 Table: plugin_industry_recommendations

---

Περιέχει τις **προτεινόμενες σχέσεις ανάμεσα σε industries και plugins**.  
Χρησιμοποιείται από το σύστημα για να προτείνει plugins στις εταιρείες, ανάλογα με τον κλάδο που έχουν δηλώσει ή τον κλάδο που προκύπτει από τη δραστηριότητά τους.

Σε αντίθεση με το `plugin_industries` (που δηλώνει “σε ποιους κλάδους ανήκει πραγματικά ένα plugin”),  
ο πίνακας `plugin_industry_recommendations` δηλώνει **τι θα εμφανιστεί στο onboarding ή στο marketplace ως "Recommended"**.

Μπορεί να περιέχει:
- 1 plugin → πολλά industries (συχνό)
- 1 industry → πολλά plugins
- plugins χωρίς industries (recommendation για όλους)
- industries χωρίς recommendations (δομικά επιτρεπτό)

**Works with:**
- `plugins` → ποιο plugin προτείνεται
- `industries` → για ποιο industry γίνεται η πρόταση (μπορεί να είναι NULL για “recommended for all”)
- `company_industries` (έμμεσα) → χρησιμοποιείται για να δείξει recommendations στο onboarding μιας εταιρείας
- `plugin_industries` (έμμεσα) → χρησιμοποιείται για μεγαλύτερη ακρίβεια στις προτάσεις
- `company_plugins` (έμμεσα) → εμφανίζονται προτάσεις ανάλογα με plugins που δεν έχει ακόμα εγκατεστημένα η εταιρεία

Χρησιμοποιείται για:
- onboarding recommendation step (π.χ. “Για πρατήριο καυσίμων προτείνουμε Fuel Station Plugin”),
- plugin marketplace filtering,
- intelligent upselling,
- προτάσεις λειτουργιών ανάλογα με τον κλάδο,
- δυναμική εμφάνιση recommended plugins στο dashboard.

Επιτρέπει στο σύστημα να παρέχει καλά στοχευμένες προτάσεις χωρίς να “κλειδώνει” τα plugins σε συγκεκριμένους κλάδους.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|--------|---------|------|----------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique identifier for recommendation entry |
| industry_id (FK) | UUID | NULL | — | References industries(id). NULL = recommended for all industries |
| plugin_key (FK) | TEXT | NOT NULL | — | References plugins(key) |
| priority | INT | NOT NULL | 100 | Ordering for recommended plugins (lower = higher priority) |
| created_at | TIMESTAMP | NOT NULL | NOW() | Creation timestamp |

---

## ℹ️ Notes

✔ 1. Τι κάνει αυτός ο πίνακας;

Αυτός ο πίνακας καθορίζει **ποια plugins προτείνονται σε κάθε industry**.

Δεν σημαίνει dependency· είναι καθαρά recommendation layer για:
  - Onboarding suggestions
  - Marketplace personalized recommendations
  - Dynamic UI filtering

✔ 2. Γιατί επιτρέπεται `industry_id = NULL`;

`NULL` σημαίνει:

"Αυτό το plugin προτείνεται σε όλες τις επιχειρήσεις ανεξαρτήτως κλάδου."

Παράδειγμα:
  - Reporting
  - CRM
  - POS (ίσως)
  - Appointment module (για κουρεία + συνεργεία + ιατρούς κλπ.)

✔ 3. Τι κάνει το `priority`;

Ορίζει τη σειρά εμφάνισης:
  - Μικρότερο = πιο σημαντικό
  - Μεγαλύτερο = πιο χαμηλής προτεραιότητας

Τυπικές τιμές:

| Priority | Σημασία |
| --- | --- |
| 1 |	Must-have |
| 2–10 | Recommended |
| 11–50	| Optional |
| 100	| Default fallback |

✔ 4. Σχέση με τον πίνακα `plugin_industries`

  - `plugin_industries` = τεχνική συμβατότητα plugin → industry
  - `plugin_industry_recommendations` = marketing / suggestion layer

Παράδειγμα:
  - POS μπορεί να είναι compatible με όλα τα industries
  - αλλά recommended μόνο σε retail industries

✔ 5. Γιατί χρησιμοποιούμε `plugin_key` αντί `plugin_id`;

Γιατί το `plugin_key` είναι:
  - σταθερό
  - δεν αλλάζει ποτέ
  - χρησιμοποιείται από third-party plugin developers
  - χρησιμοποιείται στο manifest του plugin
  - καλύτερο για marketplace ecosystems

✔ 6. Πότε γεμίζει αυτός ο πίνακας;
  - Όταν φτιάχνεις νέο plugin
  - Όταν θέλεις να βελτιώσεις τις προτάσεις onboarding
  - Όταν αλλάζει το marketing strategy του SaaS σου

---

## 📌 2. Example Rows

| id      | industry_id | plugin_key         | priority | created_at          |
| ------- | ----------- | ------------------ | -------- | ------------------- |
| rec-001 | ind-0001    | gas_station       | 1        | 2025-01-01 10:00:00 |
| rec-002 | ind-0002    | construction_tools | 2        | 2025-01-01 10:00:01 |
| rec-003 | NULL        | reporting          | 5        | 2025-01-01 10:00:02 |
| rec-004 | ind-0003    | clothing_sizes     | 1        | 2025-01-01 10:00:03 |

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
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

CREATE UNIQUE INDEX uniq_plugin_industry_scope
ON plugin_industry_recommendations (plugin_key, industry_key, scope)
WHERE industry_key IS NOT NULL;

CREATE UNIQUE INDEX uniq_plugin_global_scope
ON plugin_industry_recommendations (plugin_key, scope)
WHERE industry_key IS NULL;

```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO plugin_industry_recommendations 
  (id, industry_id, plugin_key, priority)
VALUES
  -- Gas Station: Gas Station plugin strongly recommended
  (gen_random_uuid(), 'ind-0001', 'gas_station', 1),

  -- Construction: Materials/Tools plugin recommended
  (gen_random_uuid(), 'ind-0002', 'construction_tools', 2),

  -- Global plugin recommendation (all industries)
  (gen_random_uuid(), NULL, 'reporting', 5),

  -- Clothing: Size/Color matrix plugin recommended
  (gen_random_uuid(), 'ind-0003', 'clothing_sizes', 1);
```