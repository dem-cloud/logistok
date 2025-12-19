# 🗂 Table: roles

---

Αντιπροσωπεύει τους **ρόλους χρηστών** μέσα σε μία εταιρεία (π.χ. Admin, Manager, Cashier, Warehouse).  
Κάθε ρόλος καθορίζει permissions, store access και plugin-based δυνατότητες.  
Οι ρόλοι είναι **company-specific**, δηλαδή κάθε εταιρεία έχει τη δική της λίστα ρόλων.

Οι default ρόλοι δημιουργούνται αυτόματα κατά το onboarding, βασισμένοι στους πίνακες `default_roles` και `default_role_permissions`.

**Works with:**
- `companies` → κάθε ρόλος ανήκει σε μία εταιρεία
- `role_permissions` → τα permissions του ρόλου
- `role_store_restrictions` → default store access του ρόλου
- `role_plugin_permissions` → plugin-based permissions που ενεργοποιούνται όταν η εταιρεία εγκαταστήσει plugins
- `company_users` → καθορίζει τον ρόλο που έχει κάθε χρήστης
- `default_roles` (έμμεσα) → οι default templates από τα οποία δημιουργούνται οι αρχικοί ρόλοι

Χρησιμοποιείται για:
- RBAC και access control,
- καθορισμό τι μπορεί να βλέπει/κάνει ο κάθε χρήστης,
- ανάθεση store visibility,
- δυναμικό permission expansion μέσω plugins,
- δημιουργία custom ρόλων ανά εταιρεία (πέρα από τους default).

Αποτελεί το θεμέλιο της εταιρικής διαχείρισης δικαιωμάτων στο SaaS.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|--------|-----------|------|-----------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique role identifier |
| company_id (FK) | UUID | NOT NULL | — | References companies(id). Each company has its own roles |
| key | TEXT | NOT NULL | — | Role key (e.g., "admin", "manager", "cashier") |
| name | TEXT | NOT NULL | — | Role name (e.g., "Admin", "Manager", "Cashier") |
| description | TEXT | NULL | — | Optional explanation of role responsibilities |
| created_at | TIMESTAMP | NOT NULL | NOW() | Row creation timestamp |

---

## ℹ️ Notes

✔ 1. Τα roles είναι company-specific

Κάθε εταιρεία:
  - έχει τα δικά της roles
  - μπορεί να τα αλλάζει χωρίς να επηρεάζει άλλες εταιρείες
  - μπορεί να δημιουργεί custom roles

✔ 2. Συνδέεται με:
  - `company_users` → ποιοι χρήστες έχουν αυτόν τον ρόλο
  - `role_permissions` → τι μπορεί να κάνει ο ρόλος
  - `role_store_restrictions` → σε ποια stores έχει πρόσβαση
  - `company_plugins` → plugins που ίσως ενεργοποιούν extra permissions

✔ 3. Πότε δημιουργούνται roles;

Αυτόματα:
  - κατά το onboarding
  - από templates (default_roles)

Χειροκίνητα:
  - από τον admin/manager στο UI

---

## 📌 2. Example Rows

| id                  | company_id | key        | name       | description                        | created_at          |
| ------------------- | ---------- | ---------- | ---------- | ---------------------------------- | ------------------- |
| role-admin-111      | comp-1111  | admin      | Admin      | Full access to everything          | 2025-01-01 08:00:00 |
| role-manager-111    | comp-1111  | manager    | Manager    | Handles staff and store operations | 2025-01-01 08:00:01 |
| role-cashier-111    | comp-1111  | cashier    | Cashier    | Handles POS and daily sales        | 2025-01-01 08:00:02 |
| role-warehouse-111  | comp-1111  | warehouse  | Warehouse  | Manages inventory & stock          | 2025-01-01 08:00:03 |
| role-accountant-222 | comp-2222  | accountant | Accountant | Access to financial records        | 2025-01-02 09:00:00 |

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- A company cannot have two roles with the same name
CREATE UNIQUE INDEX roles_unique_company_name
ON roles (company_id, key);

CREATE INDEX idx_roles_company_id ON roles(company_id);
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO roles
  (company_id, name, description)
VALUES
  -- Default roles for company 1111
  (
    'comp-1111',
    'admin',
    'Admin',
    'Full access to everything'
  ),
  (
    'comp-1111',
    'manager',
    'Manager',
    'Handles staff and store operations'
  ),
  (
    'comp-1111',
    'cashier',
    'Cashier',
    'Handles POS and daily sales'
  ),
  (
    'comp-1111',
    'warehouse',
    'Warehouse',
    'Manages inventory & stock'
  ),

  -- Role for second company
  (
    'comp-2222',
    'accountant',
    'Accountant',
    'Access to financial records'
  );
```