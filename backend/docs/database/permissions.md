# 🗂 Table: permissions

---

Περιέχει τη **global λίστα όλων των permissions** (δικαιωμάτων) του συστήματος.  
Κάθε permission εκφράζει μια συγκεκριμένη ενέργεια ή δυνατότητα (π.χ. `sales.create`, `inventory.view`, `settings.edit_company`).

Τα permissions είναι global και δεν ανήκουν σε εταιρεία — χρησιμοποιούνται για να συνδεθούν ρόλοι, plugins και default templates με συγκεκριμένες δυνατότητες.

**Works with:**
- `role_permissions` → συνδέει company roles με permissions
- `default_role_permissions` → template permissions για default roles στο onboarding
- `plugins` → plugins μπορούν να εισάγουν νέα permissions (π.χ. fuel_station.create_sale)
- `role_plugin_permissions` → permissions που δίνονται σε roles λόγω ενεργού plugin
- `roles` (έμμεσα) → κάθε role τελικά κληρονομεί συγκεκριμένα permissions

Χρησιμοποιείται για:
- RBAC (Role-Based Access Control),
- έλεγχο πρόσβασης ανά οθόνη, module και λειτουργία,
- ενεργοποίηση/απενεργοποίηση λειτουργιών στο UI,
- plugin-based permission injection,
- δυναμική διαχείριση δικαιωμάτων ανά εταιρεία.

Αποτελεί τη βάση του permission system του SaaS.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|--------|--------|------|----------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique permission identifier |
| key | TEXT | NOT NULL | — | Unique permission string key (e.g., "products.read") |
| name | TEXT | NOT NULL | — | Human-readable permission name |
| description | TEXT | NULL | — | Description of what the permission does |
| created_at | TIMESTAMP | NOT NULL | NOW() | Creation timestamp |

---

## ℹ️ Notes

- Το `permission_key` είναι αυτό που χρησιμοποιείς στο RBAC και στο backend middleware.
- ΔΕΝ επιτρέπεται διπλό permission_key.
- Permissions χρησιμοποιούνται από:
  - `role_permissions`
  - `default_role_permissions`

---

## 📌 2. Example Rows

| id       | key            | name           | description                                             | created_at          |
| -------- | -------------- | -------------- | ------------------------------------------------------- | ------------------- |
| perm-001 | products.read  | View Products  | Επιτρέπει την προβολή λίστας και λεπτομερειών προϊόντων | 2025-01-01 10:00:00 |
| perm-002 | products.edit  | Edit Products  | Επιτρέπει την επεξεργασία προϊόντων & χαρακτηριστικών   | 2025-01-01 10:00:01 |
| perm-003 | inventory.read | View Inventory | Επιτρέπει την προβολή αποθεμάτων ανά κατάστημα          | 2025-01-01 10:00:02 |
| perm-004 | sales.create   | Create Sales   | Δικαίωμα δημιουργίας νέας πώλησης στο POS               | 2025-01-01 10:00:03 |
| perm-005 | sales.refund   | Refund Sales   | Δικαίωμα ακύρωσης / refund σε απόδειξη                  | 2025-01-01 10:00:04 |
| perm-006 | users.manage   | Manage Users   | Διαχείριση χρηστών, πρόσθεσης/αφαίρεσης ρόλων           | 2025-01-01 10:00:05 |


---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE permissions (
  key TEXT PRIMARY KEY,        -- 'inventory.stock.edit'
  plugin_key TEXT NULL REFERENCES plugins(key) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO permissions (id, key, name, description)
VALUES
  (gen_random_uuid(), 'products.read',  'View Products',  'Επιτρέπει την προβολή λίστας και λεπτομερειών προϊόντων'),
  (gen_random_uuid(), 'products.edit',  'Edit Products',  'Επιτρέπει την επεξεργασία προϊόντων & χαρακτηριστικών'),
  (gen_random_uuid(), 'inventory.read', 'View Inventory', 'Επιτρέπει την προβολή αποθεμάτων ανά κατάστημα'),
  (gen_random_uuid(), 'sales.create',   'Create Sales',   'Δικαίωμα δημιουργίας μιας νέας πώλησης στο POS'),
  (gen_random_uuid(), 'sales.refund',   'Refund Sales',   'Δικαίωμα ακύρωσης ή επιστροφής σε απόδειξη'),
  (gen_random_uuid(), 'users.manage',   'Manage Users',   'Επιτρέπει διαχείριση χρηστών, ρόλων και προσβάσεων');
  ```