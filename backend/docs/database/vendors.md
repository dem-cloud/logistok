# 🗂 Table: vendors

---

Αντιπροσωπεύει τους **προμηθευτές** μιας εταιρείας.  
Κάθε vendor είναι μια εξωτερική επιχείρηση από την οποία η εταιρεία αγοράζει προϊόντα, υλικά ή υπηρεσίες.  
Ο πίνακας περιλαμβάνει βασικά στοιχεία όπως όνομα, στοιχεία επικοινωνίας, ΑΦΜ και προαιρετικές σημειώσεις.

Οι αγορές (purchases) και οι γραμμές τους (purchase_items) συνδέονται έμμεσα με vendors.

**Works with:**
- `companies` → η εταιρεία στην οποία ανήκει ο vendor
- `purchases` → κάθε purchase συνδέεται με έναν vendor
- `purchase_items` (έμμεσα) → οι γραμμές αγοράς ανήκουν σε purchase που ανήκει σε vendor
- `products` (έμμεσα) → reporting ανά vendor για προϊόντα
- `stock_movements` (έμμεσα) → εισερχόμενες κινήσεις αποθέματος από purchases

Χρησιμοποιείται για:
- καταγραφή στοιχείων προμηθευτών,
- δημιουργία παραστατικών αγορών,
- αναφορές εξόδων / προμηθευτών,
- vendor history (τιμές, παραλαβές, ποσότητες),
- accounting reconciliation με εξωτερικό λογιστήριο.

Ο πίνακας `vendors` είναι απαραίτητος για οποιοδήποτε procurement & inventory σύστημα.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|--------|-----------|------|-----------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique vendor identifier |
| company_id (FK) | UUID | NOT NULL | — | References companies(id). Vendor belongs to a company |
| name | TEXT | NOT NULL | — | Vendor name (e.g., “Papadopoulos Supplies”) |
| contact_name | TEXT | NULL | — | Contact person name |
| phone | TEXT | NULL | — | Vendor phone number |
| email | TEXT | NULL | — | Vendor email |
| address | TEXT | NULL | — | Vendor address |
| city | TEXT | NULL | — | City |
| postal_code | TEXT | NULL | — | Postal code |
| country | TEXT | NULL | — | Country |
| tax_id | TEXT | NULL | — | Vendor tax identification number |
| notes | TEXT | NULL | — | Extra information |
| created_by (FK) | UUID | NULL | — | User who created the vendor |
| created_at | TIMESTAMP | NOT NULL | NOW() | Creation timestamp |

---

## ℹ️ Notes

- Vendors are suppliers from whom the company purchases goods.
- Used in:
  - `purchases`
  - `purchase_items`
- Tax info is optional because not all vendors provide official docs.

---

## 📌 2. Example Rows

| id        | company_id | name                    | contact_name           | phone             | email                                                           | address        | city           | postal_code | country  | tax_id      | notes                                   | created_by | created_at          |
| --------- | ---------- | ----------------------- | ---------------------- | ----------------- | --------------------------------------------------------------- | -------------- | -------------- | ----------- | -------- | ----------- | --------------------------------------- | ---------- | ------------------- |
| vend-1111 | comp-1111  | Papadopoulos Supplies | Giannis Papadopoulos | +30 210 4455667 | [info@papado-supplies.gr](mailto:info@papado-supplies.gr)     | Athinon 45   | Athens       | 10451     | Greece | 092345621 | Primary construction materials vendor | user-aaa   | 2025-01-01 12:00:00 |
| vend-2222 | comp-1111  | FuelLogistics SA      | Maria S.             | +30 210 9988776 | [sales@fuellogistics.gr](mailto:sales@fuellogistics.gr)       | Kifisias 120 | Athens       | 11526     | Greece | 098112233 | Main diesel supplier                  | user-aaa   | 2025-01-03 09:30:00 |
| vend-3333 | comp-2222  | SoftWear Imports      | Eleni K.             | +30 2310 888777 | [hello@softwearimports.com](mailto:hello@softwearimports.com) | Tsimiski 22  | Thessaloniki | 54624     | Greece | 099223344 | NULL                                    | user-bbb   | 2025-01-10 14:15:00 |

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  contact_name TEXT NULL,
  phone TEXT NULL,
  email TEXT NULL,
  address TEXT NULL,
  city TEXT NULL,
  postal_code TEXT NULL,
  country TEXT NULL,
  tax_id TEXT NULL,
  notes TEXT NULL,

  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX vendors_unique_company_name
ON vendors (company_id, name);

CREATE UNIQUE INDEX vendors_unique_company_taxid
ON vendors (company_id, tax_id)
WHERE tax_id IS NOT NULL;

CREATE INDEX idx_vendors_company_id ON vendors(company_id);
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO vendors
  (company_id, name, contact_name, phone, email, address, city, postal_code, country, tax_id, notes, created_by)
VALUES
  -- Construction materials vendor
  (
    'comp-1111',
    'Papadopoulos Supplies',
    'Giannis Papadopoulos',
    '+30 210 4455667',
    'info@papado-supplies.gr',
    'Athinon 45',
    'Athens',
    '10451',
    'Greece',
    '092345621',
    'Primary construction materials vendor',
    'user-aaa'
  ),

  -- Fuel supplier
  (
    'comp-1111',
    'FuelLogistics SA',
    'Maria S.',
    '+30 210 9988776',
    'sales@fuellogistics.gr',
    'Kifisias 120',
    'Athens',
    '11526',
    'Greece',
    '098112233',
    'Main diesel supplier',
    'user-aaa'
  ),

  -- Clothing supplier
  (
    'comp-2222',
    'SoftWear Imports',
    'Eleni K.',
    '+30 2310 888777',
    'hello@softwearimports.com',
    'Tsimiski 22',
    'Thessaloniki',
    '54624',
    'Greece',
    '099223344',
    NULL,
    'user-bbb'
  );
```