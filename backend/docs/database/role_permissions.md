# 🗂 Table: role_permissions

---

Συνδέει έναν **company role** με ένα συγκεκριμένο permission.  
Είναι ο ιστορικός πίνακας που καθορίζει τι ακριβώς μπορεί να κάνει ένας ρόλος μέσα σε μια εταιρεία.  
Αποτελεί το πραγματικό RBAC (Role-Based Access Control) layer της κάθε εταιρείας.

Σε αντίθεση με τα default tables, αυτός ο πίνακας αποθηκεύει **πραγματικά permissions** για πραγματικούς roles.

**Works with:**
- `roles` → ο company-specific ρόλος που λαμβάνει το permission
- `permissions` → το permission που ανατίθεται στον ρόλο
- `default_role_permissions` → χρησιμοποιείται για την αρχική δημιουργία των permissions κατά το onboarding
- `role_plugin_permissions` → συμπληρωματικά plugin permissions
- `company_users` (έμμεσα) → οι χρήστες κληρονομούν permissions μέσω του assigned role τους

Χρησιμοποιείται για:
- RBAC: έλεγχο πρόσβασης σε οθόνες, modules και λειτουργίες,
- ενεργοποίηση/απενεργοποίηση δυνατοτήτων ανά role,
- plugin-based permission expansion,
- UI gating (τι βλέπει και τι δεν βλέπει ο χρήστης),
- granular control per company.

Αποτελεί τον βασικό πίνακα που καθορίζει **τι δικαιώματα έχει κάθε ρόλος** σε μία εταιρεία.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|--------|----------|------|-----------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique identifier for this permission entry |
| role_id (FK) | UUID | NOT NULL | — | References roles(id). Role these permissions belong to |
| permission_id (FK) | UUID | NOT NULL | — | References permissions(id) |
| source | TEXT | NOT NULL | 'default_role' | Πηγή του permission: default_role, plugin, manual |
| plugin_key | TEXT | NULL | — | Αν το permission δόθηκε από plugin |
| created_at | TIMESTAMP | NOT NULL | NOW() | When the permission was granted |

---

## ℹ️ Notes

✔ 1. Το source δείχνει από πού προήλθε το permission

Είναι κρίσιμο για auditing και automation.

Πιθανές τιμές:

| source | Σημασία |
| --- | --- |
| default_role | Permission που προέκυψε κατά το onboarding |
| plugin | Permission που δόθηκε επειδή ενεργοποιήθηκε plugin |
| manual | Χρήστης (owner/manager) το πρόσθεσε χειροκίνητα |

✔ 2. Το plugin_key συμπληρώνεται μόνο όταν source = 'plugin'

Παράδειγμα:
  - Ενεργοποιείς το plugin fuel_station
  - Αυτό προσθέτει permissions όπως:
    `fuel_pumps.read`
    `fuel_pumps.write`
  - Αυτά γίνονται insert στον role_permissions με plugin_key = "fuel_station"

Έτσι μπορείς να κάνεις:
```sql
DELETE FROM role_permissions WHERE plugin_key = 'fuel_station';
```

για να αφαιρέσεις όλα τα rights όταν απενεργοποιηθεί.

✔ 3. Δεν χρειάζεται UNIQUE constraint

Γιατί μπορεί να υπάρχουν διαφορετικές πηγές για το ίδιο permission — αλλά επιτρέπεται μόνο μία ενεργή εγγραφή ανά role+permission.

Συνήθως βάζουμε index:
```sql
CREATE UNIQUE INDEX role_permission_unique
ON role_permissions(role_id, permission_id);
```

✔ 4. Πότε γίνεται insert εδώ;

👉 Κατά το onboarding

Από το template `default_role_permissions`.

👉 Κατά την ενεργοποίηση plugin

Από `default_role_permissions`.

👉 Όταν ο χρήστης αλλάζει role permissions χειροκίνητα

source = 'manual'.

✔ 5. Απαραίτητο για RBAC

Ο πίνακας:
  - Συνεργάζεται με permissions (τι μπορούν να κάνουν)
  - Συνεργάζεται με roles (πώς ομαδοποιούνται)
  - Συνεργάζεται με company_users (σε ποιους ανήκουν)

Και καθορίζει ολόκληρο το access control της πλατφόρμας.

---

## 📌 2. Example Rows

| id     | role_id          | permission_id         | source         | plugin_key     | created_at          |
| ------ | ---------------- | --------------------- | -------------- | -------------- | ------------------- |
| rp-001 | role-owner-111   | perm-products-read    | system       | NULL           | 2025-01-01 08:00:00 |
| rp-002 | role-owner-111   | perm-products-edit    | default_role | NULL           | 2025-01-01 08:00:01 |
| rp-003 | role-cashier-111 | perm-sales-create     | default_role | NULL           | 2025-01-01 08:00:02 |
| rp-004 | role-cashier-111 | perm-fuel-pump-create | plugin       | gas_station | 2025-01-01 08:00:03 |
| rp-005 | role-manager-111 | perm-users-invite     | manual       | NULL           | 2025-01-05 14:10:00 |

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,

  source TEXT NOT NULL DEFAULT 'default_role' CHECK (source IN ('default_role', 'plugin', 'custom')),

  created_at TIMESTAMP NOT NULL DEFAULT NOW()

  PRIMARY KEY (role_id, permission_key)
);

-- Δεν επιτρέπεται ο ίδιος ρόλος να έχει το ίδιο permission 2 φορές
CREATE UNIQUE INDEX role_permissions_unique_pair
ON role_permissions (role_id, permission_id);

CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX role_permissions_plugin_idx ON role_permissions (plugin_key);
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO role_permissions
  (role_id, permission_id, source, plugin_key)
VALUES
  -- Basic system-level permissions
  (
    'role-owner-111',
    'perm-products-read',
    'system',
    NULL
  ),

  (
    'role-owner-111',
    'perm-products-edit',
    'default_role',
    NULL
  ),

  -- Cashier permissions applied automatically by default role template
  (
    'role-cashier-111',
    'perm-sales-create',
    'default_role',
    NULL
  ),

  -- Plugin-provided permission for fuel station plugin
  (
    'role-cashier-111',
    'perm-fuel-pump-create',
    'plugin',
    'gas_station'
  ),

  -- Manually added permission by admin
  (
    'role-manager-111',
    'perm-users-invite',
    'manual',
    NULL
  );
```