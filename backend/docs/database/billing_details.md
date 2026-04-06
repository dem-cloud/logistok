```sql
CREATE TABLE billing_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  is_corporate BOOLEAN DEFAULT TRUE, -- TRUE για Τιμολόγιο, FALSE για Απόδειξη
  billing_name TEXT NOT NULL,        -- Επωνυμία ή Ονοματεπώνυμο
  tax_id TEXT NULL,                  -- ΑΦΜ (μόνο αν is_corporate = TRUE)
  tax_office TEXT NULL,
  address TEXT NULL,
  city TEXT NULL,
  postal_code TEXT NULL,
  country TEXT NULL,
  is_active BOOLEAN DEFAULT TRUE,    -- Ποιο προφίλ χρησιμοποιείται τώρα
  created_at TIMESTAMP DEFAULT NOW()
);
```