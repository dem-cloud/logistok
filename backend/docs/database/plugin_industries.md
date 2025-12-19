# 🗂 Table: plugin_industries

---

Συνδέει ένα plugin με **τους κλάδους (industries)** στους οποίους είναι σχετικό ή για τους οποίους έχει σχεδιαστεί.  
Ένα plugin μπορεί να ανήκει σε έναν ή πολλούς κλάδους ή να είναι γενικού τύπου (οπότε δεν έχει entries στον πίνακα).

Ο πίνακας χρησιμοποιείται αποκλειστικά για **recommendations, onboarding και classification**, όχι για permissions ή λειτουργικότητα.

**Works with:**
- `plugins` → ποιο plugin συνδέεται με τους κλάδους
- `industries` → σε ποιους κλάδους είναι χρήσιμο αυτό το plugin
- `company_industries` (έμμεσα) → matching για να προτείνονται plugins ανά εταιρεία
- `plugin_industry_recommendations` → βοηθάει στο recommendation engine για onboarding και upselling

Χρησιμοποιείται για:
- εμφάνιση recommended plugins κατά το onboarding,
- filtering plugins στο marketplace ανά industry,
- προσαρμογή UI ή περιεχομένου ανά κάθετο κλάδο,
- ταξινόμηση και οργάνωση plugins στο backend.

Plugins που είναι “γενικής χρήσης” **δεν χρειάζεται να εμφανίζονται εδώ**.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|--------|---------|------|----------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique identifier for plugin–industry relation |
| plugin_key (FK) | TEXT | NOT NULL | — | References plugins(key). Plugin identifier |
| industry_id (FK) | UUID | NOT NULL | — | References industries(id) |
| priority | INT | NOT NULL | 100 | Priority for recommending plugins to this industry (lower = higher) |
| created_at | TIMESTAMP | NOT NULL | NOW() | Creation timestamp |

---

## ℹ️ Notes

✔ 1. Τι κάνει αυτός ο πίνακας;

Συνδέει plugins με industries για:
  - Onboarding recommendations
  (π.χ. σε πρατήριο → προτείνεις fuel station + POS)
  - Marketplace filtering
  (π.χ. "Plugins για τον κλάδο Εστίασης")
  - Dynamic UI personalization

✔ 2. Γιατί υπάρχει το priority;

Για να καθορίζεται η σειρά εμφάνισης:
  - Χαμηλότερο νούμερο = Υψηλότερη σύσταση
  - Επιτρέπει να βάλεις featured plugins ανά industry
  - Χρήσιμο στο onboarding wizard

Παράδειγμα:

| priority	| meaning |
| --- | --- |
| 10 |	must-have για τον κλάδο |
| 20 |	should-have |
| 100 |	optional |

✔ 3. Τι συμβαίνει με πρόσθετα global plugins;

Plugins που ισχύουν για όλα τα industries:
  - δεν χρειάζεται να μπουν στον πίνακα
  - προτείνονται σε όλους
  - ή εμφανίζονται στη γενική κατηγορία “Available plugins”

✔ 4. Γιατί χρησιμοποιούμε plugin_key και όχι plugin_id;

Επειδή:
  - το plugin_key είναι σταθερό
  - δεν αλλάζει ποτέ
  - χρησιμοποιείται και από third-party developers
  - είναι ο μοναδικός "namespace" του plugin

Το plugin_id μπορεί να αλλάξει σε migrations, imports, κ.λπ.

✔ 5. Πρέπει όλα τα plugins να έχουν industry mapping;

Όχι.

  - Plugins ειδικά για κλάδο → πρέπει
  - Plugins γενικής χρήσης → όχι
  - Plugins B2B custom → optional

Αν δεν υπάρχει row → θεωρείται global plugin.

---

## 📌 2. Example Rows

| id     | plugin_key   | industry_id     | priority | created_at          |
| ------ | ------------ | --------------- | -------- | ------------------- |
| pi-001 | gas_station | ind-gas-001     | 10       | 2025-01-01 10:00:00 |
| pi-002 | pos          | ind-gas-001     | 20       | 2025-01-01 10:00:01 |
| pi-003 | pos          | ind-mini-001    | 10       | 2025-01-01 10:00:02 |
| pi-004 | clothing     | ind-cloth-001   | 10       | 2025-01-01 10:00:03 |

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE plugin_industries (
  plugin_key TEXT NOT NULL REFERENCES plugins(key) ON DELETE CASCADE,
  industry_key TEXT NOT NULL REFERENCES industries(key) ON DELETE CASCADE,

  relevance_score INT NOT NULL DEFAULT 1,  -- optional (1–5)

  created_at TIMESTAMP NOT NULL DEFAULT NOW()

  PRIMARY KEY (plugin_key, industry_key)
);

CREATE UNIQUE INDEX plugin_industries_unique_pair
ON plugin_industries (plugin_key, industry_id);

CREATE INDEX idx_plugin_industries_plugin_key ON plugin_industries(plugin_key);
CREATE INDEX idx_plugin_industries_industry_id ON plugin_industries(industry_id);
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO plugin_industries 
  (id, plugin_key, industry_id, priority)
VALUES
  -- Gas station recommended plugins
  (gen_random_uuid(), 'gas_station', '00000000-0000-0000-0000-GASSTATION001', 10),
  (gen_random_uuid(), 'pos',          '00000000-0000-0000-0000-GASSTATION001', 20),

  -- Mini market recommended plugins
  (gen_random_uuid(), 'pos',          '00000000-0000-0000-0000-MINIMARKET001', 10),

  -- Clothing recommended plugins
  (gen_random_uuid(), 'clothing',     '00000000-0000-0000-0000-CLOTHING00001', 10),

```