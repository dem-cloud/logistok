# 🗂 Table: company_industries

---

Συνδέει μία εταιρεία με **έναν ή περισσότερους κλάδους δραστηριότητας**.  
Λειτουργεί ως bridge table (many-to-many) ανάμεσα στις εταιρείες και τους κλάδους, επιτρέποντας σε μια επιχείρηση να έχει πολλαπλές δραστηριότητες (π.χ. πρατήριο καυσίμων + μάντρα υλικών).

Ο πίνακας δεν επηρεάζει permissions ή core λειτουργικότητα· χρησιμοποιείται καθαρά για personalization και recommendations.

**Works with:**
- `companies` → σε ποια εταιρεία ανήκει ο κλάδος
- `industries` → ο κλάδος που επιλέχθηκε
- `plugin_industry_recommendations` → χρησιμοποιείται για να προτείνονται plugins κατάλληλα για τους κλάδους της εταιρείας
- `plugin_industries` (έμμεσα) → παίρνει plugins που ταιριάζουν στους δηλωμένους κλάδους

Χρησιμοποιείται για:
- onboarding (επιλογή κλάδου),
- εμφάνιση recommended plugins/add-ons,
- πιθανό industry-specific UI,
- στατιστική κατηγοριοποίηση των εταιρειών.

Αν μια εταιρεία δεν επιλέξει κλάδο στο onboarding, δεν δημιουργείται row — μπορεί να προστεθεί αργότερα όταν αγοράσει plugin συνδεδεμένο με συγκεκριμένο industry.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|-------|-------|------|---------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique identifier for each company-industry relation |
| company_id (FK) | UUID | NOT NULL | — | References companies(id) |
| industry_id (FK) | UUID | NOT NULL | — | References industries(id) |
| created_at | TIMESTAMP | NOT NULL | NOW() | Creation timestamp |

---

## 📌 2. Example Rows

| id     | company_id | industry_id | created_at          |
| ------ | ---------- | ----------- | ------------------- |
| ci-001 | comp-1111  | ind-0001    | 2025-01-01 10:00:00 |
| ci-002 | comp-1111  | ind-0004    | 2025-01-01 10:00:01 |
| ci-003 | comp-2222  | ind-0002    | 2025-01-01 10:00:02 |
| ci-004 | comp-3333  | ind-0003    | 2025-01-01 10:00:03 |

Τι δείχνουν αυτά τα δεδομένα;
  - Η εταιρεία comp-1111 (π.χ. Μάντρα + πρατήριο) ανήκει σε 2 industries
  → οικοδομικά υλικά + καύσιμα
  - Η εταιρεία comp-2222 είναι μόνο πρατήριο
  - Η εταιρεία comp-3333 είναι κατάστημα ρούχων

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE company_industries (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  industry_key TEXT NOT NULL REFERENCES industries(key) ON DELETE CASCADE,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()

  PRIMARY KEY (company_id, industry_key)
);

CREATE UNIQUE INDEX company_industries_unique_pair
ON company_industries (company_id, industry_id);

CREATE INDEX idx_company_industries_company_id ON company_industries(company_id);
CREATE INDEX idx_company_industries_industry_id ON company_industries(industry_id);
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO company_industries 
  (company_id, industry_id)
VALUES
  -- Εταιρεία 1 ανήκει σε δύο κλάδους
  ('comp-1111', 'ind-0001'), -- Construction Materials
  ('comp-1111', 'ind-0004'), -- Gas Station

  -- Εταιρεία 2: Μόνο πρατήριο
  ('comp-2222', 'ind-0002'),

  -- Εταιρεία 3: Κατάστημα ρούχων
  ('comp-3333', 'ind-0003');
```