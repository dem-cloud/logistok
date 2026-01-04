# 🗂 Table: subscription_items

---

Αντιπροσωπεύει τις **μεμονωμένες χρεώσεις** (billing line items) που ανήκουν σε μια συνδρομή.  
Κάθε item συνδέεται με Stripe price, quantity και το είδος της χρέωσης (plan, addon, extra store, plugin).

Ο πίνακας αποτελεί τον “λογαριασμό” μιας εταιρείας: όλα τα χρεώσιμα στοιχεία της συνδρομής της καταγράφονται εδώ.

**Works with:**
- `subscriptions` → το subscription στο οποίο ανήκει το billing item
- `company_plugins` → εάν το item αφορά plugin billing
- `stores` (έμμεσα) → extra store billing δημιουργεί subscription items
- `plans` (έμμεσα) → το βασικό plan τιμολογείται ως subscription item
- `stripe` (έμμεσα) → κάθε item αντιστοιχίζεται με Stripe price ID

Χρησιμοποιείται για:
- χρέωση plan (1 row per company: plan = quantity 1),
- χρέωση extra stores (1 item με quantity = αριθμός extra stores),
- χρέωση plugins/add-ons (1 item per plugin),
- ανανέωση χρέωσης μηνιαίως/ετησίως μέσω Stripe,
- εμφάνιση όλων των billing components στο account settings.

Είναι ο κρίσιμος πίνακας που καθορίζει **τι πληρώνει η εταιρεία** και **πώς τιμολογείται**.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|--------|-----------|------|-----------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique subscription item identifier |
| subscription_id (FK) | UUID | NOT NULL | — | References subscriptions(id) |
| item_type | TEXT | NOT NULL | — | 'plan', 'addon', 'extra_store' |
| stripe_subscription_item_id | TEXT | NOT NULL | — | Key or ID of the specific item (plan_id, addon_key, etc.) |
| stripe_price_id | TEXT | NOT NULL | — | Stripe price used for billing |
| quantity | INT | NOT NULL | 1 | Quantity for billing (e.g., extra stores = 3) |
| plugin_key | TEXT | NULL | — | 'gas_station', 'construction' |
| created_at | TIMESTAMP | NOT NULL | NOW() | When the row was created |
| updated_at | TIMESTAMP | NOT NULL | NOW() | When last updated |

---

## ℹ️ Notes

✅ 1. Ο πίνακας `subscription_items` είναι η καρδιά του billing

Κάθε εγγραφή αναπαριστά μία χρέωση στο Stripe subscription:
 - ✔ το βασικό πλάνο (item_type = 'plan')
 - ✔ extra stores (item_type = 'extra_store')
 - ✔ plugins / addons (item_type = 'addon')

Το Stripe subscription αποτελείται από πολλά subscription items → και αυτά είναι οι row εδώ.

✅ 2. Γιατί υπάρχει το plugin_key;

Για να ξέρουμε ποιο addon αντιστοιχεί σε ποιο plugin.

Παράδειγμα:
  - fuel plugin → `gas_station`
  - clothing plugin → `clothing_sizes`

Έτσι:
  - μπορούμε να συνδέσουμε το addon με τον πίνακα company_plugins
  - μπορούμε να απενεργοποιήσουμε plugin αν λήξει η συνδρομή
  - έχουμε πλήρες audit trail

✅ 3. Το `quantity` χρησιμεύει σε:

⭐ Extra Stores
```
extra_store_count = quantity
```

⭐ Plugin pricing per seat

Σε μελλοντικά plugins (π.χ. per-employee billing).

✅ 4. `stripe_subscription_item_id` αποθηκεύεται για:
  - άμεση σύνδεση με Stripe item
  - updates (change plan, change quantity)
  - cancellations

Χωρίς αυτό, θα είχες πρόβλημα να κάνεις sync με Stripe.

---

## 📌 2. Example Rows

| id     | subscription_id | item_type     | stripe_subscription_item_id | stripe_price_id             | quantity | plugin_key     | created_at          | updated_at          |
| ------ | --------------- | ------------- | --------------------------- | --------------------------- | -------- | -------------- | ------------------- | ------------------- |
| si-001 | sub-1111        | plan        | si_plan_001               | price_basic_monthly       | 1        | NULL           | 2025-01-01 10:00:00 | 2025-01-01 10:00:00 |
| si-002 | sub-1111        | extra_store | si_extra_001              | price_extra_store_monthly | 2        | NULL           | 2025-01-01 10:05:00 | 2025-01-01 10:05:00 |
| si-003 | sub-1111        | addon       | si_addon_001              | price_fuel_plugin_monthly | 1        | gas_station | 2025-01-01 10:10:00 | 2025-01-01 10:10:00 |
| si-004 | sub-2222        | addon       | si_addon_002              | price_reporting_yearly    | 1        | reporting    | 2025-02-02 09:00:00 | 2025-02-02 09:00:00 |

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE subscription_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,

  item_type TEXT NOT NULL CHECK (item_type IN ('plan', 'plugin', 'extra_store')),
  stripe_subscription_item_id TEXT NOT NULL UNIQUE,
  stripe_price_id TEXT NOT NULL,

  plugin_key TEXT NULL REFERENCES plugins(key) ON DELETE SET NULL,

  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),

  -- 🆕 ΠΡΟΣΘΗΚΗ: Price tracking
  unit_amount DECIMAL(10,2) NULL, -- Το ποσό που χρεώθηκε (για history)
  currency TEXT NULL DEFAULT 'eur',
  
  -- 🆕 ΠΡΟΣΘΗΚΗ: Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled')),

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_subscription_items_subscription_plugin ON subscription_items(subscription_id, plugin_key) WHERE plugin_key IS NOT NULL;

CREATE INDEX idx_subscription_items_subscription_id ON subscription_items(subscription_id);
CREATE INDEX idx_subscription_items_plugin_key ON subscription_items(plugin_key);
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO subscription_items
  (subscription_id, item_type, stripe_subscription_item_id, stripe_price_id, quantity, plugin_key)
VALUES
  -- Base plan
  (
    'sub-1111',
    'plan',
    'si_plan_001',
    'price_basic_monthly',
    1,
    NULL
  ),

  -- Extra stores (e.g., company pays for 2 extra stores)
  (
    'sub-1111',
    'extra_store',
    'si_extra_001',
    'price_extra_store_monthly',
    2,
    NULL
  ),

  -- Fuel station plugin addon
  (
    'sub-1111',
    'addon',
    'si_addon_001',
    'price_fuel_plugin_monthly',
    1,
    'gas_station'
  ),

  -- Another subscription for another company
  (
    'sub-2222',
    'addon',
    'si_addon_002',
    'price_reporting_yearly',
    1,
    'reporting'
  );
```
