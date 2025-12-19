# 🗂 Table: industries

---

Περιέχει τη **global λίστα των διαθέσιμων κλάδων/τομέων δραστηριότητας** (π.χ. πρατήριο καυσίμων, μάντρα υλικών, συνεργείο, ρούχα, mini market).  
Χρησιμοποιείται για personalization, onboarding και για προτάσεις plugins ανάλογα με τον κλάδο της εταιρείας.

Οι κλάδοι δεν ανήκουν σε εταιρείες· είναι global και χρησιμοποιούνται ως reference.

**Works with:**
- `company_industries` → συνδέει κάθε εταιρεία με έναν ή περισσότερους κλάδους
- `plugin_industries` → δηλώνει για ποιους κλάδους είναι χρήσιμο/σχετικό ένα plugin
- `plugin_industry_recommendations` → προτείνει plugins με βάση τον κλάδο της εταιρείας
- `plugins` (έμμεσα) → για να γνωρίζουμε σε ποιους κλάδους απευθύνεται κάθε plugin

Χρησιμοποιείται για:
- onboarding εταιρειών (επιλογή κλάδου),
- εμφάνιση recommended plugins ή εργαλείων,
- ενεργοποίηση industry-specific UI components,
- μελλοντική στατιστική κατηγοριοποίηση των εταιρειών.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|-------|--------|------|---------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique industry identifier |
| name | TEXT | NOT NULL | — | Industry name (e.g., "gas_station", "construction") |
| display_name | TEXT | NOT NULL | — | Industry name (e.g., "Gas Station", "Construction Materials") |
| description | TEXT | NOT NULL | — | Description of the industry |
| photo_url | TEXT | NOT NULL | — | Photo of the industry |
| is_active | BOOLEAN | NOT NULL | TRUE | Whether this industry is available for selection |
| priority | INT | NOT NULL | 100 | Order of appearance in UI (lower = higher priority) |
| created_at | TIMESTAMP | NOT NULL | NOW() | Creation timestamp |

---

## 📌 2. Example Rows

| id      | name         | display_name      | description                                     | photo_url                                                              | is_active | priority | created_at          |
| ------- | ------------ | ----------------- | ----------------------------------------------- | ---------------------------------------------------------------------- | --------- | -------- | ------------------- |
| ind-001 | gas_station  | Πρατήριο Καυσίμων | Επιχειρήσεις με αντλίες καυσίμων και δεξαμενές  | [https://example.com/gas.jpg](https://example.com/gas.jpg)             | TRUE      | 10       | 2025-01-01 10:00:00 |
| ind-002 | construction | Οικοδομικά Υλικά  | Μάντρες οικοδομών & χονδρική οικοδομικών υλικών | [https://example.com/const.jpg](https://example.com/const.jpg)         | TRUE      | 20       | 2025-01-01 10:00:01 |
| ind-003 | clothing     | Ρούχα & Μόδα      | Καταστήματα ένδυσης, παπούτσια, boutiques       | [https://example.com/clothing.jpg](https://example.com/clothing.jpg)   | TRUE      | 30       | 2025-01-01 10:00:02 |
| ind-004 | minimarket   | Mini Market       | Παντοπωλεία, mini markets & περίπτερα           | [https://example.com/mini.jpg](https://example.com/mini.jpg)           | TRUE      | 40       | 2025-01-01 10:00:03 |
| ind-005 | restaurant   | Εστίαση           | Καφετέριες, εστιατόρια, fast-food               | [https://example.com/food.jpg](https://example.com/food.jpg)           | TRUE      | 50       | 2025-01-01 10:00:04 |
| ind-006 | logistics    | Logistics         | Αποθήκες, στόλοι, εταιρείες μεταφορών           | [https://example.com/logistics.jpg](https://example.com/logistics.jpg) | TRUE      | 60       | 2025-01-01 10:00:05 |
| ind-007 | pharmacy     | Φαρμακείο         | Λιανική φαρμάκων & παραφαρμακευτικών            | [https://example.com/pharm.jpg](https://example.com/pharm.jpg)         | TRUE      | 70       | 2025-01-01 10:00:06 |
| ind-008 | general      | Γενικό Εμπόριο    | Επιχειρήσεις χωρίς συγκεκριμένο κλάδο           | [https://example.com/general.jpg](https://example.com/general.jpg)     | TRUE      | 100      | 2025-01-01 10:00:07 |


---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE industries (
  key TEXT PRIMARY KEY,        -- 'construction', 'retail'

  name TEXT NOT NULL,
  description TEXT NOT NULL,
  photo_url TEXT NOT NULL,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INT NOT NULL DEFAULT 100,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX industries_is_active_idx
ON industries (is_active);
CREATE INDEX industries_priority_idx
ON industries (priority);
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO industries 
  (id, name, display_name, description, photo_url, is_active, priority)
VALUES
  (gen_random_uuid(), 'gas_station',  'Πρατήριο Καυσίμων', 
      'Επιχειρήσεις με αντλίες καυσίμων και δεξαμενές',
      'https://example.com/gas.jpg',
      TRUE, 10),

  (gen_random_uuid(), 'construction', 'Οικοδομικά Υλικά', 
      'Μάντρες οικοδομών & χονδρική οικοδομικών υλικών',
      'https://example.com/const.jpg',
      TRUE, 20),

  (gen_random_uuid(), 'clothing',     'Ρούχα & Μόδα', 
      'Καταστήματα ένδυσης, παπούτσια, boutiques',
      'https://example.com/clothing.jpg',
      TRUE, 30),

  (gen_random_uuid(), 'minimarket',   'Mini Market', 
      'Παντοπωλεία, mini markets & περίπτερα',
      'https://example.com/mini.jpg',
      TRUE, 40),

  (gen_random_uuid(), 'restaurant',   'Εστίαση', 
      'Καφετέριες, εστιατόρια, fast-food',
      'https://example.com/food.jpg',
      TRUE, 50),

  (gen_random_uuid(), 'logistics',    'Logistics', 
      'Αποθήκες, στόλοι, εταιρείες μεταφορών',
      'https://example.com/logistics.jpg',
      TRUE, 60),

  (gen_random_uuid(), 'pharmacy',     'Φαρμακείο', 
      'Λιανική φαρμάκων & παραφαρμακευτικών',
      'https://example.com/pharm.jpg',
      TRUE, 70),

  (gen_random_uuid(), 'general',      'Γενικό Εμπόριο', 
      'Επιχειρήσεις χωρίς συγκεκριμένο κλάδο',
      'https://example.com/general.jpg',
      TRUE, 100);

```