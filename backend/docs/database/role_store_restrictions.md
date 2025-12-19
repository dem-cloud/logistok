# 🗂 Table: role_store_restrictions

---

Καθορίζει **σε ποια καταστήματα (stores)** έχει πρόσβαση ένας συγκεκριμένος ρόλος μιας εταιρείας.  
Αποτελεί το default access layer ανά ρόλο, ώστε οι χρήστες που ανήκουν σε αυτόν τον ρόλο να κληρονομούν store visibility rules.

Αν ένας χρήστης χρειάζεται διαφορετικά store permissions από αυτά του ρόλου, τότε χρησιμοποιείται το `user_store_access` για overrides.

**Works with:**
- `roles` → ο company-specific ρόλος στον οποίο εφαρμόζεται ο περιορισμός
- `stores` → το store στο οποίο ο ρόλος έχει ή δεν έχει πρόσβαση
- `company_users` (έμμεσα) → οι χρήστες κληρονομούν πρόσβαση από τον assigned role
- `user_store_access` → συμπληρώνει ή παρακάμπτει τις ρυθμίσεις του ρόλου
- `permissions` (έμμεσα) → role-based access control μπορεί να περιορίζει και per-store λειτουργίες

Χρησιμοποιείται για:
- καθορισμό του ποιες οθόνες / δεδομένα store μπορεί να βλέπει ένας ρόλος,
- περιορισμό πρόσβασης σε multi-store περιβάλλοντα,
- βασικά default access rules ανά ρόλο (π.χ. Cashier → μόνο Store 1),
- inheritance: όλα τα users του ρόλου παίρνουν τα ίδια store restrictions στην αρχή,
- security isolation ανά κατάστημα.

Αποτελεί το default store access layer ενός role σε περιβάλλον με πολλά καταστήματα.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|--------|-----------|------|-----------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique restriction entry |
| role_id (FK) | UUID | NOT NULL | — | References roles(id). Role being restricted |
| store_id (FK) | UUID | NOT NULL | — | References stores(id). Store the role is allowed to access |
| created_at | TIMESTAMP | NOT NULL | NOW() | When the restriction was created |

---

## ℹ️ Notes

✔ 1. Αυτός ο πίνακας ορίζει από πάνω προς τα κάτω περιορισμούς

Η λογική είναι:

👉 Το role καθορίζει ποια stores μπορεί να δει κάποιος χρήστης.

Αν ο ρόλος έχει 2 stores → όλοι οι χρήστες με αυτόν τον ρόλο βλέπουν αυτά τα 2 stores (εκτός αν υπάρξει user override).

✔ 2. Συνεργάζεται με τον πίνακα `user_store_access`

  - Το **role_store_restrictions** = default store access για όσους έχουν τον συγκεκριμένο ρόλο.
  - Το **user_store_access** = εξαιρέσεις (π.χ. χρήστης βλέπει λιγότερα ή περισσότερα από τον ρόλο του).

✔ 3. Το absence of restrictions = full access

Αν ένας ρόλος δεν έχει εγγραφές στον πίνακα:

`role_store_restrictions`


τότε θεωρείται:

➜ Ο ρόλος βλέπει όλα τα stores της εταιρείας.

Αυτό είναι πολύ χρήσιμο για ρόλους όπως:
  - Owner
  - Manager
  - Accountant

χωρίς να χρειάζεται να κάνεις insert δεκάδες rows.

✔ 4. Πρέπει να υπάρχει UNIQUE constraint

Για να μην γίνεται duplicate restriction:
```sql
CREATE UNIQUE INDEX role_store_unique
  ON role_store_restrictions(role_id, store_id);
```

✔ 5. Συνδέεται με:
  - `roles` → ποιος ρόλος περιορίζεται
  - `stores` → σε ποιο κατάστημα έχει πρόσβαση
  - `company_users` → ποιοι χρήστες κληρονομούν αυτούς τους περιορισμούς
  - `user_store_access` → overrides

✔ 6. Χρησιμοποιείται στο UI για filtering

Π.χ. όταν χρήστης με role Cashier ανοίξει:
  - Products
  - Stock
  - Sales
  - Reports

όλα τα queries φιλτράρονται από αυτόν τον πίνακα.

---

## 📌 2. Example Rows

| id      | role_id            | store_id  | created_at          |
| ------- | ------------------ | --------- | ------------------- |
| rsr-001 | role-cashier-111   | store-aaa | 2025-01-01 08:00:00 |
| rsr-002 | role-cashier-111   | store-bbb | 2025-01-01 08:00:01 |
| rsr-003 | role-warehouse-111 | store-ccc | 2025-01-01 08:00:05 |
| rsr-004 | role-manager-111   | store-aaa | 2025-01-01 08:00:10 |

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE role_store_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX role_store_restrictions_unique_pair
ON role_store_restrictions (role_id, store_id);

CREATE INDEX idx_role_store_restrictions_role_id ON role_store_restrictions(role_id);
CREATE INDEX idx_role_store_restrictions_store_id ON role_store_restrictions(store_id);
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO role_store_restrictions
  (role_id, store_id)
VALUES
  -- Cashier role allowed only in store A & B
  (
    'role-cashier-111',
    'store-aaa'
  ),
  (
    'role-cashier-111',
    'store-bbb'
  ),

  -- Warehouse employee restricted to 1 store
  (
    'role-warehouse-111',
    'store-ccc'
  ),

  -- Manager allowed only in store A (even if company has more)
  (
    'role-manager-111',
    'store-aaa'
  );
```