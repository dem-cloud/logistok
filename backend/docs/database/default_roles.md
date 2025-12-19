# 🗂 Table: default_roles

---

Αποτελεί τη **global λίστα των προεπιλεγμένων ρόλων** που χρησιμοποιεί το σύστημα για να δημιουργήσει αυτόματα τους αντίστοιχους πραγματικούς ρόλους (roles) μιας εταιρείας κατά το onboarding.  
Οι default roles λειτουργούν ως **templates** από τα οποία προκύπτουν οι company-specific roles.

Δεν αντιστοιχούν απευθείας σε χρήστες ούτε ανήκουν σε κάποια εταιρεία—είναι καθαρά seed data.

**Works with:**
- `default_role_permissions` → καθορίζει τα βασικά permissions κάθε default role
- `roles` → στο onboarding δημιουργούνται αντίγραφα (Admin, Manager, Cashier) για μια συγκεκριμένη εταιρεία
- `role_permissions` → προκύπτουν από τα defaults όταν δημιουργηθεί νέα εταιρεία
- `plugins` (έμμεσα) → plugins μπορούν να ορίζουν default permissions per role

Χρησιμοποιείται για:
- αυτόματη δημιουργία βασικών ρόλων σε κάθε νέα εταιρεία,
- διατήρηση συνέπειας στο permission model σε όλες τις εταιρείες,
- εύκολη προσθήκη νέων plugins ή permissions χωρίς να επηρεάζονται υπάρχοντα tenants,
- καθορισμό των “template roles”: Admin, Manager, Cashier, Warehouse, POS, Accountant κ.λπ.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|-------|--------|------|---------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique identifier for the default role |
| industry_id (FK) | UUID | NULL | — | Industry-specific roles. Null for general |
| key | TEXT | NOT NULL | — | Role key (e.g., "admin", "manager", "cashier") |
| name | TEXT | NOT NULL | — | Role name (e.g., "Admin", "Manager", "Cashier") |
| description | TEXT | NULL | — | Optional: description of what this role is |
| created_at | TIMESTAMP | NOT NULL | NOW() | Creation timestamp |

---

## 📌 2. Example Rows

| id | industry_id | key | name | description | created_at |
| ----- | ------ | ------ | ------ | ---------------- | ------- |
| defrole-001 | NULL | admin | Admin | Πλήρη πρόσβαση σε όλες τις λειτουργίες της εταιρείας | 2025-01-01 10:00:00 |
| defrole-002 | NULL | manager | Manager | Διαχειρίζεται προϊόντα, αποθέματα, πωλήσεις, προσωπικό | 2025-01-01 10:00:01 |
| defrole-003 | NULL | cashier | Cashier | Χειρίζεται POS και βασικές πωλήσεις | 2025-01-01 10:00:02 |
| defrole-004 | NULL | warehouse | Warehouse | Διαχείρηση αποθέματος και έλεγχο αποθήκης | 2025-01-01 10:00:03 |
| defrole-005 | ind-gas-station | fuel_operator | Fuel Operator | Χειρίζεται αντλίες και παρακολουθεί ποσότητες καυσίμων | 2025-01-01 10:00:04 |
| defrole-006 | ind-clothing | fitting_assistant | Fitting Assistant | Βοηθά στις δοκιμές και στην εξυπηρέτηση πελατών | 2025-01-01 10:00:05 |

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE default_roles (
  key TEXT PRIMARY KEY,           -- 'admin', 'manager'
  industry_id UUID NULL REFERENCES industries(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX default_roles_unique_idx
ON default_roles (industry_id, key);

CREATE INDEX idx_default_roles_industry_id ON default_roles(industry_id);
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO default_roles (id, industry_id, key, name, description)
VALUES
  -- General roles (apply to all industries)
  (gen_random_uuid(), NULL, 'admin',      'Admin',      'Full access to all company functions'),
  (gen_random_uuid(), NULL, 'manager',    'Manager',    'Manages products, stock, sales & staff'),
  (gen_random_uuid(), NULL, 'cashier',    'Cashier',    'Handles POS operations & basic sales'),
  (gen_random_uuid(), NULL, 'warehouse',  'Warehouse',  'Manages stock and warehouse operations'),

  -- Industry-specific default roles
  (gen_random_uuid(), '00000000-0000-0000-0000-0000GASSTATION01', 
      'fuel_operator', 
      'Fuel Operator', 
      'Χειρίζεται αντλίες και παρακολουθεί ποσότητες καυσίμων'),

  (gen_random_uuid(), '00000000-0000-0000-0000-0000CLOTHING0001',
      'fitting_assistant',
      'Fitting Assistant',
      'Βοηθά στις δοκιμές και στην εξυπηρέτηση πελατών');

```