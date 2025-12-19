# 🗂 Table: onboarding

---

Αποθηκεύει την **πρόοδο του onboarding μιας εταιρείας** κατά τη διαδικασία δημιουργίας λογαριασμού και αρχικής ρύθμισης.  
Ο πίνακας επιτρέπει την επαναφορά της διαδικασίας αν ο χρήστης τη διακόψει και βοηθάει στη ροή βήμα-βήμα (industry → plugins → stores → roles → users → finish).

Κάθε εταιρεία μπορεί να έχει μόνο ένα onboarding record.

**Works with:**
- `companies` → ποια εταιρεία βρίσκεται στη διαδικασία onboarding
- `company_industries` → επιλογή κλάδων στο σχετικό βήμα
- `company_plugins` → ενεργοποίηση recommended plugins κατά το onboarding
- `stores` → δημιουργία του πρώτου καταστήματος
- `roles` → δημιουργία default roles για την εταιρεία
- `company_users` → δημιουργία του owner χρήστη και κλήσεις για προσθήκη προσωπικού
- `subscriptions` → επιλογή plan και δημιουργία trial/subscription κατά το τελικό βήμα

Χρησιμοποιείται για:
- συνέχιση του onboarding από το σημείο που σταμάτησε ο χρήστης,
- παρακολούθηση του τρέχοντος βήματος (current_step),
- αποθήκευση προσωρινών επιλογών (π.χ. plugin selections),
- αυτόματη δημιουργία default data όταν ολοκληρωθεί το onboarding.

Εξασφαλίζει ότι η εταιρεία ξεκινά με σωστά δεδομένα και κατάλληλες ρυθμίσεις χωρίς να χρειάζεται χειροκίνητη παρέμβαση.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|-------|--------|------|---------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique onboarding record identifier |
| company_id (FK) | UUID | NOT NULL | — | References companies(id). Each company has one onboarding record |
| current_step | INT | NULL | 1 | Current onboarding step the company is on |
| is_completed | BOOLEAN | NOT NULL | FALSE | Whether onboarding is fully finished |
| data | JSONB | NULL | — | All onboarding data (temp_industries, temp_plugins, selected_plan_id, etc.) |
| created_at | TIMESTAMP | NOT NULL | NOW() | Creation timestamp |

---

## ℹ️ Suggested Onboarding Step Mapping

| Step | Description |
|------|-------------|
| 1 | Basic company info (name, country) |
| 2 | Select industry |
| 3 | Select plugins (recommended + optional) |
| 4 | Select subscription plan |
| 5 | Create first store |
| 6 | Add initial roles & staff (optional) |
| 7 | Completed |

---

## ℹ️ Notes

✔ 1. Κάθε εταιρεία έχει μόνο ένα onboarding record

Αυτό αποτρέπει πολλαπλές παράλληλες διαδικασίες onboarding.

Ένα απλό unique constraint:
```sql
CREATE UNIQUE INDEX one_onboarding_per_company
ON onboarding(company_id);
```

✔ 2. Το `current_step` μπορεί να γίνει NULL όταν ολοκληρωθεί

Έτσι ξέρεις:
  - αν είναι NULL → onboarding finished
  - αν έχει αριθμό → βρίσκεται σε εξέλιξη

✔ 3. Το `data` περιέχει όλα τα προσωρινά στοιχεία του onboarding

Ενδεικτικό περιεχόμενο:

```json
{
  "temp_industries": ["ind-0001", "ind-0004"],
  "temp_plugins": ["fuel_station"],
  "selected_plan_id": "plan-pro",
  "company_name": "Παπαδόπουλος Υλικά",
  "contact_phone": "2109988776"
}
```

Χρησιμοποιείται μόνο κατά τη διάρκεια του onboarding.

Μετά, τα real records πάνε στους κανονικούς πίνακες:
  - `company_industries`
  - `company_plugins`
  - `subscriptions`
  - `stores` (αν υπάρχουν)
  - κλπ.

✔ 4. Γιατί δεν έχουμε πολλά πεδία (temp_industries, temp_plugins κτλ.);

Γιατί:
  - το onboarding αλλάζει συχνά
  - θέλουμε ευελιξία
  - δεν θέλουμε ALTER TABLE κάθε φορά που προσθέτουμε βήμα
  - JSONB έχει εξαιρετική υποστήριξη indexing και querying στο PostgreSQL

Έτσι μπορείς να μου δώσεις:

```json
{
  "branches": ["Athens", "Thessaloniki"],
  "selected_role_templates": ["owner", "manager"],
  "extra_users": [
    {"email": "employee1@test.com", "role": "cashier"},
    {"email": "employee2@test.com", "role": "warehouse"}
  ]
}
```

και λειτουργεί άψογα χωρίς να αλλάξει schema.

✔ 5. Χρήσιμο για “resume onboarding”

Αν κάποιος χρήστης κλείσει το browser:
  - επιστρέφει στο last saved step
  - βλέπει τα προσωρινά δεδομένα
  - συνεχίζει χωρίς απώλειες

✔ 6. Ο πίνακας δεν διαγράφεται συνήθως

Το onboarding χρησιμοποιείται για:
  - analytics
  - conversion metrics
  - troubleshooting
  - customer success

---

## 📌 2. Example Rows

| id      | company_id | current_step | is_completed | data                                                                                                            | created_at          |
| ------- | ---------- | ------------ | ------------ | --------------------------------------------------------------------------------------------------------------- | ------------------- |
| onb-001 | comp-1111  | 3            | FALSE        | {"temp_industries":["ind-0001","ind-0004"],"temp_plugins":["fuel_station"],"company_name":"Παπαδόπουλος Υλικά"} | 2025-01-01 10:00:00 |
| onb-002 | comp-2222  | NULL         | TRUE         | {"selected_plan_id":"plan-pro","temp_plugins":["reporting"],"accepted_terms":true}                              | 2025-01-01 10:00:01 |
| onb-003 | comp-3333  | 1            | FALSE        | {"temp_industries":["ind-0003"]}                                                                                | 2025-01-01 10:00:02 |

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,

  current_step INT NOT NULL DEFAULT 1,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,

  data JSONB NOT NULL DEFAULT '{
      "company": {
          "name": "",
          "phone": ""
      },
      "industries": [],
      "plan": null,
      "plugins": []
  }',

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()

);
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO onboarding
  (company_id, current_step, is_completed, data)
VALUES
  -- Εταιρεία στη μέση του onboarding
  (
    'comp-1111',
    3,
    FALSE,
    '{
      "temp_industries": ["ind-0001", "ind-0004"],
      "temp_plugins": ["fuel_station"],
      "company_name": "Παπαδόπουλος Υλικά"
    }'::jsonb
  ),

  -- Ολοκληρωμένο onboarding
  (
    'comp-2222',
    NULL,
    TRUE,
    '{
      "selected_plan_id": "plan-pro",
      "temp_plugins": ["reporting"],
      "accepted_terms": true
    }'::jsonb
  ),

  -- Εταιρεία που μόλις ξεκίνησε το onboarding
  (
    'comp-3333',
    1,
    FALSE,
    '{
      "temp_industries": ["ind-0003"]
    }'::jsonb
  );
```