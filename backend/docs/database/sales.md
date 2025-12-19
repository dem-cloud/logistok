# 🗂 Table: sales

---

Αντιπροσωπεύει μία **πώληση** (απόδειξη, τιμολόγιο ή POS συναλλαγή) που πραγματοποιείται σε ένα store.  
Περιλαμβάνει συνολικές πληροφορίες, όπως ημερομηνία, πελάτη, χρήστη που την καταχώρησε, μέθοδο πληρωμής και το store στο οποίο έγινε.

Οι αναλυτικές γραμμές της πώλησης αποθηκεύονται στον πίνακα `sale_items`.

**Works with:**
- `companies` → η εταιρεία στην οποία ανήκει η πώληση
- `stores` → το κατάστημα όπου πραγματοποιήθηκε η συναλλαγή
- `customers` → ο πελάτης της συναλλαγής (προαιρετικό)
- `users` → ο χρήστης/ταμίας που έκανε την πώληση
- `payment_methods` → τρόπος πληρωμής (μετρητά, POS κ.λπ.)
- `sale_items` → οι γραμμές προϊόντων της πώλησης
- `product_variants` (έμμεσα) → τα variants που πωλήθηκαν
- `stock_movements` → δημιουργεί outbound κινήσεις αποθέματος
- `store_products` → ενημέρωση μείωσης αποθέματος στο συγκεκριμένο store

Χρησιμοποιείται για:
- POS λειτουργίες,
- χειροκίνητες πωλήσεις,
- παρακολούθηση ημερήσιων/μηνιαίων πωλήσεων,
- αναλυτικά reports ανά προϊόν/κατηγορία/store,
- ενημέρωση αποθέματος,
- δημιουργία λογιστικών εγγραφών (εφόσον υπάρχει module).

Κάθε sale είναι το “κεφαλί” μίας συναλλαγής και αποτελεί κρίσιμο στοιχείο για reporting και inventory management.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|--------|-----------|------|-----------|-------------|
| id (PK) | BIGINT | NOT NULL | gen_random_uuid() | Unique sale identifier (receipt/invoice) |
| company_id (FK) | UUID | NOT NULL | — | References companies(id) |
| store_id (FK) | UUID | NOT NULL | — | Store where the sale happened |
| customer_id (FK) | UUID | NULL | — | References customers(id). NULL = walk-in customer |
| payment_method_id (FK) | UUID | NOT NULL | — | References payment_methods(id) |
| invoice_number | TEXT | NULL | — | Printed receipt/invoice number |
| invoice_type | TEXT | NOT NULL | 'receipt' | e.g., 'receipt', 'invoice', 'refund' |
| subtotal | NUMERIC(12,2) | NULL | — | Total before VAT |
| vat_total | NUMERIC(12,2) | NULL | — | Total VAT amount |
| total_amount | NUMERIC(12,2) | NOT NULL | — | Final total paid |
| amount_paid | NUMERIC(12,2) | NULL | — | Actual paid amount |
| change_returned | NUMERIC(12,2) | NULL | — | Change returned to customer |
| notes | TEXT | NULL | — | Extra notes per sale |
| source | TEXT | NOT NULL | 'manual' | 'manual', 'automated' (e.g. 'pump_1') |
| status | TEXT | NOT NULL | 'completed' | 'completed', 'pending', 'cancelled', 'refunded' |
| created_by (FK) | UUID | NULL | — | User who created the sale. NULL = automated |
| created_at | TIMESTAMP | NOT NULL | NOW() | Creation timestamp |

---

## ℹ️ Notes

- Αυτός είναι ο **parent table** των `sale_items`.
- `amount_paid` και `change_returned` είναι χρήσιμα για POS μηχανήματα.
- Από κάθε sale:
  - δημιουργούνται stock movements (OUT)
  - παράγεται fiscal document αν είσαι Ελλάδα (πχ MyData)

✔ 1. Το invoice_type καθορίζει το είδος παραστατικού

Υποστηρίζει:
  - `receipt` — απλή απόδειξη
  - `invoice` — τιμολόγιο
  - `refund` — πιστωτικό / επιστροφή
  - `cancelled` — ακυρωμένο

Για τα refunds χρησιμοποιούνται αρνητικά ποσά (subtotal, vat_total, total_amount).

✔ 2. Το payment_method_id συνδέει με system/custom/plugin μέθοδο πληρωμής

Παραδείγματα:
  - cash
  - card
  - bank transfer
  - fuel account (plugin)

Κάθε μέθοδος έχει δικό της UUID.

✔ 3. Το customer_id είναι NULL για walk-in πελάτες

Σε retail:
  - 90% των πωλήσεων είναι χωρίς καταχωρημένο πελάτη
  - το NULL είναι σωστή επιλογή

✔ 4. Το πεδίο source είναι εξαιρετικά σημαντικό
| source | Χρήση |
| --- | --- |
| `manual` | δημιουργήθηκε από χρήστη στο POS |
| `automated` | δημιουργήθηκε από plugin, API, fuel pump, IoT device |

Εάν έχεις πρατήριο καυσίμων:
  - fuel pump → οργανώνει αυτόματα πωλήσεις
  - created_by = NULL

✔ 5. Το amount_paid και change_returned επιτρέπουν POS λειτουργικότητα

Παράδειγμα:
  - value: 22.32
  - customer gives: 25.00
  - change_returned: 2.68

Αυτό είναι κρίσιμο για receipts UI.

✔ 6. Συνδέεται με πολλούς πίνακες

  - `sale_items`
  - `stores`
  - `customers`
  - `payment_methods`
  - `stock_movements` (μείωση αποθήκης)
  - `company_users` (created_by)

✔ 7. Γιατί το id είναι UUID αντί για INT;

Γιατί τα sales:
  - μπορεί να συγχρονίζονται από offline POS
  - μπορεί να εισάγονται από plugins (π.χ. fuel pumps)
  - μπορεί να χρειάζεται distributed reconciliation

UUID είναι ασφαλέστερο για multi-device environments.

---

## 📌 2. Example Rows

| id       | company_id | store_id  | customer_id | payment_method_id | invoice_number | invoice_type | subtotal | vat_total | total_amount | amount_paid | change_returned | notes                   | source      | status      | created_by | created_at          |
| -------- | ---------- | --------- | ----------- | ----------------- | -------------- | ------------ | -------- | --------- | ------------ | ----------- | --------------- | ----------------------- | ----------- | ----------- | ---------- | ------------------- |
| sale-001 | comp-1111  | store-aaa | cust-001    | paym-cash         | R-10221      | receipt    | 18.00    | 4.32      | 22.32        | 25.00       | 2.68            | 3 bags of sand        | manual    | completed | user-111   | 2025-01-05 10:00:00 |
| sale-002 | comp-1111  | store-aaa | NULL        | paym-card         | R-10222      | receipt    | 12.50    | 3.00      | 15.50        | 15.50       | 0.00            | NULL                    | manual    | completed | user-111   | 2025-01-05 10:05:00 |
| sale-003 | comp-1111  | store-ccc | cust-004    | paym-cash         | NULL           | invoice    | 200.00   | 48.00     | 248.00       | 248.00      | 0.00            | Delivery to site      | manual    | completed | user-222   | 2025-01-05 11:00:00 |
| sale-004 | comp-2222  | store-bbb | NULL        | paym-fuel         | PUMP-21      | receipt    | 30.00    | 7.20      | 37.20        | 37.20       | 0.00            | Automatic from pump 1 | automated | completed | NULL       | 2025-01-05 12:30:00 |
| sale-005 | comp-1111  | store-aaa | cust-001    | paym-card         | R-10223      | refund     | -12.50   | -3.00     | -15.50       | -15.50      | 0.00            | Returned paint        | manual    | refunded  | user-111   | 2025-01-05 13:00:00 |

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE sales (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,

  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id UUID NULL REFERENCES customers(id) ON DELETE SET NULL,
  payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,

  invoice_number TEXT NULL,
  invoice_type TEXT NOT NULL DEFAULT 'receipt' CHECK (invoice_type IN ('receipt', 'invoice', 'refund')),

  subtotal NUMERIC(12,2) NULL,
  vat_total NUMERIC(12,2) NULL,
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),

  amount_paid NUMERIC(12,2) NULL CHECK (amount_paid >= 0),
  change_returned NUMERIC(12,2) NULL CHECK (change_returned >= 0),

  notes TEXT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'pos', 'online', 'api')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('draft', 'completed', 'cancelled', 'refunded')),

  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX sales_unique_invoice_number_per_company
ON sales (company_id, invoice_number)
WHERE invoice_number IS NOT NULL;

CREATE INDEX idx_sales_company_id ON sales(company_id);
CREATE INDEX idx_sales_store_id ON sales(store_id);
CREATE INDEX idx_sales_customer_id ON sales(customer_id);
CREATE INDEX idx_sales_payment_method_id ON sales(payment_method_id);
CREATE INDEX idx_sales_created_at ON sales(company_id, created_at DESC);
CREATE INDEX sales_created_by_idx ON sales (created_by);
CREATE INDEX idx_sales_created_by ON sales(created_by);
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO sales
  (company_id, store_id, customer_id, payment_method_id, invoice_number, invoice_type,
   subtotal, vat_total, total_amount, amount_paid, change_returned, notes,
   source, status, created_by)
VALUES
  -- Walk-in sale with change
  (
    'comp-1111',
    'store-aaa',
    'cust-001',
    'paym-cash',
    'R-10221',
    'receipt',
    18.00,
    4.32,
    22.32,
    25.00,
    2.68,
    '3 bags of sand',
    'manual',
    'completed',
    'user-111'
  ),

  -- Card sale with no change
  (
    'comp-1111',
    'store-aaa',
    NULL,
    'paym-card',
    'R-10222',
    'receipt',
    12.50,
    3.00,
    15.50,
    15.50,
    0.00,
    NULL,
    'manual',
    'completed',
    'user-111'
  ),

  -- Invoice sale to customer
  (
    'comp-1111',
    'store-ccc',
    'cust-004',
    'paym-cash',
    NULL,
    'invoice',
    200.00,
    48.00,
    248.00,
    248.00,
    0.00,
    'Delivery to site',
    'manual',
    'completed',
    'user-222'
  ),

  -- Automated fuel pump sale
  (
    'comp-2222',
    'store-bbb',
    NULL,
    'paym-fuel',
    'PUMP-21',
    'receipt',
    30.00,
    7.20,
    37.20,
    37.20,
    0.00,
    'Automatic from pump 1',
    'automated',
    'completed',
    NULL
  ),

  -- Refund example
  (
    'comp-1111',
    'store-aaa',
    'cust-001',
    'paym-card',
    'R-10223',
    'refund',
    -12.50,
    -3.00,
    -15.50,
    -15.50,
    0.00,
    'Returned paint',
    'manual',
    'refunded',
    'user-111'
  );
```