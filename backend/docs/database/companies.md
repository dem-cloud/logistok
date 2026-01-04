# 🗂 Table: companies

---

Αντιπροσωπεύει την **εταιρεία/επιχείρηση** που χρησιμοποιεί την πλατφόρμα SaaS.  
Είναι το κεντρικό entity από το οποίο ξεκινούν όλα τα υπόλοιπα δεδομένα και ρυθμίσεις μιας συνδρομής.

Κάθε εταιρεία έχει δικά της stores, χρήστες, προϊόντα, plugins και billing.

**Works with:**
- `subscriptions` → η ενεργή συνδρομή της εταιρείας (plan, billing, Stripe)
- `company_users` → ποιοι χρήστες ανήκουν στην εταιρεία
- `stores` → τα καταστήματα/υποκαταστήματα της εταιρείας
- `company_plugins` → τα plugins/add-ons που έχει ενεργοποιήσει η εταιρεία
- `company_industries` → οι κλάδοι στους οποίους δραστηριοποιείται
- `products` → ο κατάλογος προϊόντων της εταιρείας
- `vendors` → οι προμηθευτές της
- `customers` → οι πελάτες της
- `units` → custom μονάδες μέτρησης της εταιρείας
- `sales`, `purchases` → εμπορική δραστηριότητα
- `stock_movements` → κινήσεις αποθήκης ανά κατάστημα

Χρησιμοποιείται για:
- το βασικό company profile (όνομα, ΑΦΜ, στοιχεία),
- billing και συνδρομές,
- multi-store διαχείριση,
- διαχείριση προσωπικού και δικαιωμάτων,
- separation of data μεταξύ διαφορετικών εταιρειών στο SaaS σύστημα.

Αποτελεί το **root entity** στο multi-tenant μοντέλο.

---

## 📌 1. Fields Definition

| Field                | Type      | Null     | Default           | Description               |
| -------------------- | --------- | -------- | ----------------- | ------------------------- |
| id (PK)              | UUID      | NOT NULL | gen_random_uuid() | Unique company identifier |
| name                 | TEXT      | NULL     | —                 | Company legal name        |
| display_name         | TEXT      | NULL     | —                 | Friendly display name     |
| tax_id               | TEXT      | NULL     | —                 | VAT number                |
| tax_office           | TEXT      | NULL     | —                 | Tax office                |
| address              | TEXT      | NULL     | —                 | Address                   |
| city                 | TEXT      | NULL     | —                 | City                      |
| postal_code          | TEXT      | NULL     | —                 | Postal Code               |
| country              | TEXT      | NULL     | —                 | Country                   |
| phone                | TEXT      | NULL     | —                 | Contact phone             |
| email                | TEXT      | NULL     | —                 | Company email             |
| subscription_id (FK) | UUID      | NULL     | —                 | Active subscription       |
| logo_url             | TEXT      | NULL     | —                 | Logo                      |
| settings             | JSONB     | NULL     | —                 | Optional custom config    |
| created_at           | TIMESTAMP | NOT NULL | NOW()             | Creation timestamp        |

---

## 📌 2. Example Rows

| id        | name                          | display_name        | tax_id      | tax_office      | address               | city        | postal_code | country | phone      | email                                                 | subscription_id | logo_url                                                           | settings              | created_at          |
| --------- | ----------------------------- | ------------------- | ----------- | --------------- | --------------------- | ----------- | ----------- | ------- | ---------- | ----------------------------------------------------- | --------------- | ------------------------------------------------------------------ | --------------------- | ------------------- |
| comp-1111 | Μάντρα Παπαδόπουλος ΑΕ        | Παπαδόπουλος Υλικά  | 094512300   | Α' Αθηνών       | Λεωφ. Δημοκρατίας 120 | Αθήνα       | 13671       | Ελλάδα  | 2105559000 | [info@papadopoulos.gr](mailto:info@papadopoulos.gr)   | sub-111         | [https://cdn.app.com/logos/1.png](https://cdn.app.com/logos/1.png) | {"theme": "dark"}     | 2025-01-01 10:00:00 |
| comp-2222 | Στάθμος Καυσίμων Κωνσταντίνου | Fuel Station Kostas | EL123456789 | Β' Θεσσαλονίκης | Εθνική Οδός 8         | Θεσσαλονίκη | 54622       | Ελλάδα  | 2310555123 | [station@kostasfuel.gr](mailto:station@kostasfuel.gr) | sub-222         | NULL                                                               | {"pos_enabled": true} | 2025-01-01 10:00:01 |
| comp-3333 | Fashion World OE              | Fashion World       | 801234567   | Δ' Πειραιά      | Τσαμαδού 33           | Πειραιάς    | 18535       | Ελλάδα  | 2106600771 | [hello@fashionworld.gr](mailto:hello@fashionworld.gr) | NULL            | NULL                                                               | NULL                  | 2025-01-01 10:00:02 |

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Χωρίς Όνομα',
  display_name TEXT NULL,
  tax_id TEXT NULL,
  tax_office TEXT NULL,
  address TEXT NULL,
  city TEXT NULL,
  postal_code TEXT NULL,
  country TEXT NULL,
  phone TEXT NULL,
  email TEXT NULL,
  logo_url TEXT NULL,
  settings JSONB NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
  stripe_customer_id TEXT NULL UNIQUE,
);

CREATE UNIQUE INDEX companies_unique_tax_id
ON companies (tax_id)
WHERE tax_id IS NOT NULL;

CREATE INDEX idx_companies_subscription_id ON companies(subscription_id);
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO companies
  (name, display_name, tax_id, tax_office, address, city, postal_code, country, phone, email, subscription_id, logo_url, settings)
VALUES
  -- Μάντρα οικοδομικών υλικών
  (
    'Μάντρα Παπαδόπουλος ΑΕ',
    'Παπαδόπουλος Υλικά',
    '094512300',
    'Α'' Αθηνών',
    'Λεωφ. Δημοκρατίας 120',
    'Αθήνα',
    '13671',
    'Ελλάδα',
    '2105559000',
    'info@papadopoulos.gr',
    'sub-111',
    'https://cdn.app.com/logos/1.png',
    '{"theme": "dark"}'
  ),

  -- Πρατήριο καυσίμων
  (
    'Στάθμος Καυσίμων Κωνσταντίνου',
    'Fuel Station Kostas',
    'EL123456789',
    'Β'' Θεσσαλονίκης',
    'Εθνική Οδός 8',
    'Θεσσαλονίκη',
    '54622',
    'Ελλάδα',
    '2310555123',
    'station@kostasfuel.gr',
    'sub-222',
    NULL,
    '{"pos_enabled": true}'
  ),

  -- Κατάστημα ρούχων (free plan)
  (
    'Fashion World OE',
    'Fashion World',
    '801234567',
    'Δ'' Πειραιά',
    'Τσαμαδού 33',
    'Πειραιάς',
    '18535',
    'Ελλάδα',
    '2106600771',
    'hello@fashionworld.gr',
    NULL,
    NULL,
    NULL
  );
```