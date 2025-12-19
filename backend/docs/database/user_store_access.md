# 🗂 Table: user_store_access

---

Καθορίζει **σε ποια καταστήματα (stores)** έχει πρόσβαση ένας συγκεκριμένος χρήστης.  
Ο πίνακας λειτουργεί ως **override** πάνω από τα default store rules του ρόλου (`role_store_restrictions`).  
Εάν ένας χρήστης χρειάζεται διαφορετική πρόσβαση από αυτή που έχει ο ρόλος του, εδώ γίνεται η εξαίρεση.

Παράδειγμα:  
- Ο ρόλος "Cashier" βλέπει μόνο το Store 1  
- Ο χρήστης Μάριος (Cashier) πρέπει να βλέπει και το Store 2 →  
  Προστίθεται row στο `user_store_access`.

**Works with:**
- `users` → ο χρήστης που λαμβάνει την πρόσβαση
- `companies` (έμμεσα) → μέσω του user → company context
- `stores` → το store στο οποίο δίνεται πρόσβαση
- `company_users` → κατανόηση στο ποια εταιρεία βρίσκονται
- `role_store_restrictions` → παρέχει τα default rules τα οποία τα user-specific rows μπορούν να παρακάμψουν
- `roles` (έμμεσα) → ο χρήστης έχει role-based access, το οποίο μπορεί να ενισχυθεί/τροποποιηθεί από user-level access

Χρησιμοποιείται για:
- εξαιρέσεις user-level που υπερκαλύπτουν τον ρόλο,
- πρόσβαση σε διαφορετικά stores για συγκεκριμένους υπαλλήλους,
- granular access control ανά χρήστη,
- περιπτώσεις όπου ένας manager ή accountant χρειάζεται πρόσβαση σε περισσότερα stores από τον βασικό ρόλο,
- multi-store visibility στο dashboard & POS.

Το `user_store_access` είναι το **τελικό layer** στο access control:  
αν υπάρχει override εδώ, υπερισχύει πάντα των κανόνων του ρόλου.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|--------|-----------|------|-----------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique access record |
| user_id (FK) | UUID | NOT NULL | — | References users(id) |
| store_id (FK) | UUID | NOT NULL | — | References stores(id) |
| created_at | TIMESTAMP | NOT NULL | NOW() | Creation timestamp |

---

## ℹ️ Notes

✅ 1. Ο πίνακας user_store_access είναι για εξαιρέσεις per user

Δηλαδή:
  - Αν ένας ρόλος έχει περιορισμούς (role_store_restrictions)
  - Αλλά ένας χρήστης πρέπει να έχει διαφορετική πρόσβαση από τον ρόλο του

Τότε αυτός ο πίνακας έχει προτεραιότητα.

Παράδειγμα:

| Role | Default Access |
| --- | --- |
| Cashier	| Store 1 only |

| User | Access |
| --- | --- |
| Marios (Cashier) | Store 1 & Store 2 |

Αυτό υλοποιείται με **user_store_access**.

✅ 2. Priority Logic (ποια access μετράει)

Όταν ο χρήστης ανοίξει το UI:

1️⃣ Αν υπάρχει `user_store_access` → χρησιμοποιείται αυτό

Γιατί είναι explicit override.

2️⃣ Αν δεν υπάρχει, αλλά υπάρχει `role_store_restrictions` →

→ Χρησιμοποιείται ο περιορισμός του ρόλου.

3️⃣ Αν δεν υπάρχει τίποτα →

→ Ο χρήστης βλέπει όλα τα stores της εταιρείας.

---

## 📌 2. Example Rows

| id       | user_id  | store_id  | created_at          |
| -------- | -------- | --------- | ------------------- |
| usa-1111 | user-aaa | store-aaa | 2025-01-01 09:00:00 |
| usa-1112 | user-aaa | store-bbb | 2025-01-01 09:10:00 |
| usa-2221 | user-bbb | store-ccc | 2025-01-02 11:00:00 |
| usa-3331 | user-ccc | store-aaa | 2025-01-03 12:30:00 |

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE user_store_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- A user cannot have multiple access rules for the same store
CREATE UNIQUE INDEX user_store_access_unique_pair
ON user_store_access (user_id, store_id);

CREATE INDEX idx_user_store_access_user_id ON user_store_access(user_id);
CREATE INDEX idx_user_store_access_store_id ON user_store_access(store_id);
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO user_store_access
  (user_id, store_id)
VALUES
  -- User AAA has access to two stores (Main Warehouse + Fuel Station)
  ('user-aaa', 'store-aaa'),
  ('user-aaa', 'store-bbb'),

  -- User BBB can access Clothing Store
  ('user-bbb', 'store-ccc'),

  -- User CCC can access Warehouse only
  ('user-ccc', 'store-aaa');
```