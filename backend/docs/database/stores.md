# 🗂 Table: stores

---

Αντιπροσωπεύει ένα **κατάστημα / υποκατάστημα** μίας εταιρείας.  
Κάθε εταιρεία μπορεί να έχει 1 ή πολλά stores, τα οποία λειτουργούν ως ξεχωριστές μονάδες αποθήκης, πωλήσεων και δραστηριότητας.

Το store αποτελεί core entity για όλα τα modules: stock, sales, purchases, plugins, users.

**Works with:**
- `companies` → σε ποια εταιρεία ανήκει το store
- `store_products` → το απόθεμα κάθε variant στο συγκεκριμένο store
- `sales` → όλες οι πωλήσεις συνδέονται με κάποιο store
- `sale_items` (έμμεσα) → γραμμές πώλησης ανά store
- `purchases` → αγορές/παραλαβές ανά store
- `purchase_items` (έμμεσα) → γραμμές αγοράς ανά store
- `stock_movements` → όλες οι κινήσεις αποθέματος ανά store
- `store_plugins` → ποια plugins είναι ενεργά στο συγκεκριμένο store
- `role_store_restrictions` → ποιοι ρόλοι έχουν πρόσβαση στο store
- `user_store_access` → overrides πρόσβασης ανά χρήστη
- `company_plugins` (έμμεσα) → plugins μπορεί να είναι ενεργά σε συγκεκριμένα stores μόνο

Χρησιμοποιείται για:
- multi-store διαχείριση,
- αποθήκη και απόθεμα ανά χώρο,
- POS ανά κατάστημα,
- reports πωλήσεων & αποθεμάτων ανά location,
- granular permissions (ποιος βλέπει ποιο store),
- ενεργοποίηση plugins μόνο όπου χρειάζεται (π.χ. Fuel Station plugin μόνο σε πρατήριο).

Το store είναι ένα από τα πιο σημαντικά entities σε multi-location SaaS και αποτελεί τον πυρήνα για σωστό inventory & permission management.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|--------|-----------|------|-----------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique store identifier |
| company_id (FK) | UUID | NOT NULL | — | References companies(id). Store belongs to a company |
| name | TEXT | NOT NULL | — | Store name (e.g., “Main Warehouse”, “Fuel Station A”) |
| address | TEXT | NULL | — | Physical address of the store |
| city | TEXT | NULL | — | City of the store |
| postal_code | TEXT | NULL | — | Postal / ZIP code |
| country | TEXT | NULL | — | Country |
| phone | TEXT | NULL | — | Store contact number |
| email | TEXT | NULL | — | Store email |
| is_main | BOOLEAN | NOT NULL | FALSE | Main store per company |
| is_active | BOOLEAN | NOT NULL | TRUE | Whether store is active |
| created_at | TIMESTAMP | NOT NULL | NOW() | Creation timestamp |

---

## ℹ️ Notes

- Each company can have multiple stores.
- Stores are used for:
  - inventory separation,
  - POS locations,
  - plugin activation per store,
  - stock movement scoping.
- Soft-deactivation supported via `is_active = FALSE`.
- Store data affects:
  - `store_products`
  - `store_plugins`
  - `sales`
  - `purchases`
  - `stock_movements`

---

## 📌 2. Example Rows

| id        | company_id | name                     | address              | city     | postal_code | country  | phone             | email                                                       | created_at          |
| --------- | ---------- | ------------------------ | -------------------- | -------- | ----------- | -------- | ----------------- | ----------------------------------------------------------- | ------------------- |
| store-aaa | comp-1111  | Main Warehouse         | Industrial Area 12 | Athens | 10445     | Greece | +30 210 1234567 | [warehouse@company.com](mailto:warehouse@company.com)     | 2025-01-01 09:00:00 |
| store-bbb | comp-1111  | Fuel Station A         | Leof. Kifisou 120  | Athens | 12131     | Greece | +30 210 7654321 | [station-a@company.com](mailto:station-a@company.com)     | 2025-01-02 10:30:00 |
| store-ccc | comp-2222  | Clothing Store Central | Ermou 58           | Athens | 10563     | Greece | +30 210 8888888 | [ermou-store@company.com](mailto:ermou-store@company.com) | 2025-01-03 11:15:00 |

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  name TEXT NOT NULL DEFAULT 'Κεντρική Αποθήκη',
  address TEXT NULL,
  city TEXT NULL,
  postal_code TEXT NULL,
  country TEXT NULL,
  phone TEXT NULL,
  email TEXT NULL,

  is_main BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX one_main_store_per_company
ON stores(company_id)
WHERE is_main = true;


CREATE UNIQUE INDEX stores_unique_company_name
ON stores (company_id, name);

CREATE INDEX idx_stores_company_id ON stores(company_id);
CREATE INDEX idx_stores_is_active ON stores(is_active); --?
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO stores
  (company_id, name, address, city, postal_code, country, phone, email)
VALUES
  -- Company 1111: Main warehouse
  (
    'comp-1111',
    'Main Warehouse',
    'Industrial Area 12',
    'Athens',
    '10445',
    'Greece',
    '+30 210 1234567',
    'warehouse@company.com'
  ),

  -- Company 1111: Fuel station
  (
    'comp-1111',
    'Fuel Station A',
    'Leof. Kifisou 120',
    'Athens',
    '12131',
    'Greece',
    '+30 210 7654321',
    'station-a@company.com'
  ),

  -- Company 2222: Clothing retail store
  (
    'comp-2222',
    'Clothing Store Central',
    'Ermou 58',
    'Athens',
    '10563',
    'Greece',
    '+30 210 8888888',
    'ermou-store@company.com'
  );
```
