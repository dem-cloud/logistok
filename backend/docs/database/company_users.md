# 🗂 Table: company_users

---

Αντιπροσωπεύει τη **σχέση μιας εταιρείας με τους χρήστες της**.  
Κάθε row δηλώνει ότι ένας συγκεκριμένος χρήστης ανήκει σε μία συγκεκριμένη εταιρεία και ποιον ρόλο έχει μέσα σε αυτή.

Επιτρέπει multi-tenant λειτουργία στο ίδιο login (ένας χρήστης μπορεί να ανήκει σε πολλές εταιρείες).

**Works with:**
- `companies` → η εταιρεία στην οποία ανήκει ο χρήστης
- `users` → ο πραγματικός λογαριασμός χρήστη
- `roles` → ο ρόλος που έχει ο χρήστης μέσα στην εταιρεία (permissions & access rules)
- `user_store_access` → καταστήματα στα οποία έχει πρόσβαση ο συγκεκριμένος χρήστης
- `role_store_restrictions` → access rules που κληρονομούνται από τον ρόλο
- `user_sessions` → sessions του χρήστη, χρησιμοποιούνται σε εταιρικό context

Χρησιμοποιείται για:
- εκχώρηση ρόλων και δικαιωμάτων στους χρήστες,
- ορισμό πρόσβασης σε καταστήματα ανά χρήστη,
- multi-company login (ένας χρήστης → πολλές επιχειρήσεις),
- employee management (staff, managers, owners),
- δυνατότητα πρόσκλησης χρηστών σε μια εταιρεία.

Αποτελεί τον βασικό πίνακα που καθορίζει **ποιος χρήστης βλέπει ποια εταιρεία και με τι δικαιώματα**.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|-------|-------|------|---------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique identifier for the company-user relation |
| company_id (FK) | UUID | NOT NULL | — | References companies(id) |
| user_id (FK) | UUID | NOT NULL | — | References users(id) |
| role_id (FK) | UUID | NULL | — | References roles(id). Role assigned to this user for this company |
| is_owner | BOOLEAN | NOT NULL | FALSE | Whether this user is the owner of the company |
| invited_by (FK) | UUID | NULL | — | User who invited this user (optional) |
| status | TEXT | NOT NULL | 'active' | Status: 'active', 'pending', 'disabled' |
| created_at | TIMESTAMP | NOT NULL | NOW() | Creation timestamp |

---

## 📌 2. Example Rows

| id     | company_id | user_id  | role_id  | is_owner | invited_by | status  | is_active  | created_at          |
| ------ | ---------- | -------- | -------- | -------- | ---------- | ------- | ---------- | ------------------- |
| cu-001 | comp-1111  | user-111 | role-001 | TRUE     | NULL       | active  | true       | 2025-01-01 10:00:00 |
| cu-002 | comp-1111  | user-222 | role-003 | FALSE    | user-111   | active  | false      | 2025-01-01 10:00:01 |
| cu-003 | comp-1111  | user-333 | role-004 | FALSE    | user-222   | pending | true       | 2025-01-01 10:00:02 |
| cu-004 | comp-2222  | user-222 | role-010 | TRUE     | NULL       | active  | true       | 2025-01-01 10:00:03 |
| cu-005 | comp-3333  | user-555 | role-020 | TRUE     | NULL       | active  | true       | 2025-01-01 10:00:04 |

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE company_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NULL REFERENCES roles(id) ON DELETE SET NULL,

  is_owner BOOLEAN NOT NULL DEFAULT FALSE,

  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending', 'disabled')),
  disabled_reason TEXT NULL CHECK (disabled_reason IN ('plan_limit', 'user_action', 'system'))

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX company_users_unique_company_user
ON company_users (company_id, user_id);

CREATE INDEX idx_company_users_company_id ON company_users(company_id);
CREATE INDEX idx_company_users_user_id ON company_users(user_id);
CREATE INDEX idx_company_users_role_id ON company_users(role_id);
CREATE INDEX idx_company_users_status ON company_users(company_id, status);
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO company_users
  (company_id, user_id, role_id, is_owner, invited_by, status)
VALUES
  -- Ο δημιουργός της εταιρείας (owner)
  ('comp-1111', 'user-111', 'role-001', TRUE, NULL, 'active', TRUE),

  -- Cashier που προσκλήθηκε
  ('comp-1111', 'user-222', 'role-003', FALSE, 'user-111', 'active', FALSE),

  -- Χρήστης που έχει προσκληθεί αλλά δεν έχει αποδεχτεί
  ('comp-1111', 'user-333', 'role-004', FALSE, 'user-222', 'pending', TRUE),

  -- Owner σε δεύτερη εταιρεία
  ('comp-2222', 'user-222', 'role-010', TRUE, NULL, 'active', TRUE),

  -- Άλλος owner για τρίτη εταιρεία
  ('comp-3333', 'user-555', 'role-020', TRUE, NULL, 'active', TRUE);
```