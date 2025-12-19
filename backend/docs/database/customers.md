# 🗂 Table: customers

---

Αντιπροσωπεύει τους **πελάτες μιας εταιρείας**, τόσο λιανικής όσο και χονδρικής.  
Περιέχει βασικά στοιχεία πελάτη όπως όνομα, στοιχεία επικοινωνίας, ΑΦΜ και προαιρετικές σημειώσεις.

Χρησιμοποιείται για επιλογή πελάτη κατά την πώληση, για τιμολόγηση, CRM λειτουργίες και για ιστορικό συναλλαγών.

**Works with:**
- `companies` → ο πελάτης ανήκει σε μία συγκεκριμένη εταιρεία
- `sales` → κάθε πώληση μπορεί να συνδέεται με έναν πελάτη
- `sale_items` → έμμεση σύνδεση μέσω των πωλήσεων
- `stock_movements` (έμμεσα) → εμφανίζεται σε κινήσεις αποθέματος που προκύπτουν από πωλήσεις
- `invoices` (εάν υπάρχει πίνακας έκδοσης παραστατικών) → τιμολόγηση προς πελάτες

Χρησιμοποιείται για:
- POS και manual sales (επιλογή πελάτη),
- διαχείριση πελατολογίου,
- αποθήκευση πληροφοριών τιμολόγησης (email, ΤΚ, ΑΦΜ),
- παρακολούθηση του ιστορικού πωλήσεων πελάτη,
- μελλοντικές CRM λειτουργίες (όπως loyalty, credit limits, balances).

Αποτελεί τη βασική πηγή δεδομένων για πελατειακές συναλλαγές.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|-------|-------|------|---------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique customer identifier |
| company_id (FK) | UUID | NOT NULL | — | References companies(id) |
| full_name | TEXT | NOT NULL | — | Customer full name |
| email | TEXT | NULL | — | Customer email |
| phone | TEXT | NULL | — | Customer phone number |
| tax_id | TEXT | NULL | — | VAT number of customer (ΑΦΜ) |
| address | TEXT | NULL | — | Address |
| city | TEXT | NULL | — | City |
| postal_code | TEXT | NULL | — | Postal Code |
| country | TEXT | NULL | — | Country |
| notes | TEXT | NULL | — | Extra notes for the customer |
| created_by (FK) | UUID | NULL | — | User who created the customer |
| created_at | TIMESTAMP | NOT NULL | NOW() | Creation timestamp |

---

## 📌 2. Example Rows

| id       | company_id | full_name            | email                                         | phone      | tax_id    | address               | city        | postal_code | country | notes              | created_by | created_at          |
| -------- | ---------- | -------------------- | --------------------------------------------- | ---------- | --------- | --------------------- | ----------- | ----------- | ------- | ------------------ | ---------- | ------------------- |
| cust-001 | comp-1111  | Γιώργος Παπαδόπουλος | [george@gmail.com](mailto:george@gmail.com)   | 6945001122 | 045612300 | Κωνσταντινουπόλεως 11 | Αθήνα       | 11854       | Ελλάδα  | Συχνός πελάτης     | user-111   | 2025-01-01 10:00:00 |
| cust-002 | comp-1111  | Τεχνική Εταιρεία ΑΕ  | [info@techsa.gr](mailto:info@techsa.gr)       | 2105566778 | 998877665 | Πειραιώς 120          | Μοσχάτο     | 18345       | Ελλάδα  | Έκδοση τιμολογίου  | user-222   | 2025-01-01 10:00:01 |
| cust-003 | comp-2222  | Μαρία Κωνσταντίνου   | [maria_k@gmail.com](mailto:maria_k@gmail.com) | 6933445566 | NULL      | Αριστοτέλους 8        | Θεσσαλονίκη | 54622       | Ελλάδα  | Προτιμάει απόδειξη | user-222   | 2025-01-01 10:00:02 |

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  full_name TEXT NOT NULL,
  email TEXT NULL,
  phone TEXT NULL,

  tax_id TEXT NULL,
  address TEXT NULL,
  city TEXT NULL,
  postal_code TEXT NULL,
  country TEXT NULL,
  notes TEXT NULL,

  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX customers_unique_tax_id_per_company
ON customers (company_id, tax_id)
WHERE tax_id IS NOT NULL;

CREATE INDEX idx_customers_company_id ON customers(company_id);
CREATE INDEX idx_customers_email ON customers(company_id, email) WHERE email IS NOT NULL;
CREATE INDEX idx_customers_phone ON customers(company_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_customers_full_name ON customers(company_id, full_name);
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO customers
  (company_id, full_name, email, phone, tax_id, address, city, postal_code, country, notes, created_by)
VALUES
  -- Πελάτης λιανικής
  (
    'comp-1111',
    'Γιώργος Παπαδόπουλος',
    'george@gmail.com',
    '6945001122',
    '045612300',
    'Κωνσταντινουπόλεως 11',
    'Αθήνα',
    '11854',
    'Ελλάδα',
    'Συχνός πελάτης',
    'user-111'
  ),

  -- Πελάτης χονδρικής
  (
    'comp-1111',
    'Τεχνική Εταιρεία ΑΕ',
    'info@techsa.gr',
    '2105566778',
    '998877665',
    'Πειραιώς 120',
    'Μοσχάτο',
    '18345',
    'Ελλάδα',
    'Έκδοση τιμολογίου',
    'user-222'
  ),

  -- Πελάτης πρατηρίου
  (
    'comp-2222',
    'Μαρία Κωνσταντίνου',
    'maria_k@gmail.com',
    '6933445566',
    NULL,
    'Αριστοτέλους 8',
    'Θεσσαλονίκη',
    '54622',
    'Ελλάδα',
    'Προτιμάει απόδειξη',
    'user-222'
  );
```