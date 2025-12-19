# 🗂 Table: default_role_permissions

---

Αντιπροσωπεύει τα **προεπιλεγμένα permissions που δίνονται αυτόματα** σε κάθε νεοδημιουργημένο role κατά το onboarding ή όταν το σύστημα δημιουργεί system/default roles.

Δεν αφορά πραγματικά permissions εταιρειών, αλλά λειτουργεί ως **template** από το οποίο παράγονται εγγραφές στον πίνακα `role_permissions` για κάθε νέα εταιρεία.

**Works with:**
- `permissions` → δείχνει ποιο permission περιλαμβάνεται στο default set
- `default_roles` → κάθε default role φορτώνει αυτά τα permissions κατά το onboarding
- `role_permissions` → δημιουργούνται dynamic rows από αυτόν τον πίνακα για κάθε role της εταιρείας

Χρησιμοποιείται για:
- αυτόματο γέμισμα permissions κατά το onboarding,
- δημιουργία βασικών ρόλων (Owner, Manager, Cashier),
- ομοιόμορφη εκκίνηση όλων των εταιρειών με προκαθορισμένες άδειες ασφαλείας.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|-------|-------|------|---------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique identifier for this default role permission |
| default_role_key  (FK) | TEXT | NOT NULL | — | References default_roles(key). The role these default permissions belong to |
| permission_key (FK) | TEXT | NOT NULL | — | References permissions(key) |
| created_at | TIMESTAMP | NOT NULL | NOW() | Creation timestamp |

---

## ℹ️ Notes

Χρησιμοποιείς default_role_key αντί για role_id
- Γιατί:
    - roles είναι templates, δεν υπάρχουν per-company ακόμη
    - τα actual company roles δημιουργούνται μετά στο onboarding
    - το key είναι σταθερό & δεν αλλάζει

Χρησιμοποιείς permission_key αντί για permission_id
- Για λόγους:
  - readable & predictable mapping
  - plugins μπορούν να προσθέσουν permissions με δικά τους keys
  - καλύτερο compatibility με marketplace plugins
  - αποφυγή migration κόστους αν αλλάξουν IDs

---

## 📌 2. Example Rows

| id      | default_role_key | permission_key | created_at          |
| ------- | ---------------- | -------------- | ------------------- |
| drp-001 | admin            | products.read  | 2025-01-01 10:00:00 |
| drp-002 | admin            | products.edit  | 2025-01-01 10:00:01 |
| drp-003 | admin            | users.manage   | 2025-01-01 10:00:02 |
| drp-004 | manager          | products.read  | 2025-01-01 10:00:03 |
| drp-005 | manager          | products.edit  | 2025-01-01 10:00:04 |
| drp-006 | manager          | inventory.read | 2025-01-01 10:00:05 |
| drp-007 | cashier          | products.read  | 2025-01-01 10:00:06 |
| drp-008 | cashier          | sales.create   | 2025-01-01 10:00:07 |
| drp-009 | warehouse        | inventory.read | 2025-01-01 10:00:08 |

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE default_role_permissions (
  default_role_key TEXT NOT NULL REFERENCES default_roles(key) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()

  PRIMARY KEY (default_role_key, permission_key)
);

CREATE UNIQUE INDEX default_role_permissions_unique_pair
ON default_role_permissions (default_role_key, permission_key);

CREATE INDEX default_role_permissions_role_idx
ON default_role_permissions (default_role_key);
CREATE INDEX default_role_permissions_permission_idx
ON default_role_permissions (permission_key);
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO default_role_permissions (id, default_role_key, permission_key)
VALUES
  -- Owner: full access
  (gen_random_uuid(), 'admin',     'products.read'),
  (gen_random_uuid(), 'admin',     'products.edit'),
  (gen_random_uuid(), 'admin',     'inventory.read'),
  (gen_random_uuid(), 'admin',     'users.manage'),
  (gen_random_uuid(), 'admin',     'sales.create'),
  (gen_random_uuid(), 'admin',     'sales.refund'),

  -- Manager
  (gen_random_uuid(), 'manager',   'products.read'),
  (gen_random_uuid(), 'manager',   'products.edit'),
  (gen_random_uuid(), 'manager',   'inventory.read'),
  (gen_random_uuid(), 'manager',   'sales.create'),

  -- Cashier
  (gen_random_uuid(), 'cashier',   'products.read'),
  (gen_random_uuid(), 'cashier',   'sales.create'),

  -- Warehouse
  (gen_random_uuid(), 'warehouse', 'inventory.read'),
  (gen_random_uuid(), 'warehouse', 'products.read');

```