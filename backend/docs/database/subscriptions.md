# 🗂 Table: subscriptions

---

Αντιπροσωπεύει τη **συνδρομή μιας εταιρείας** στο SaaS σύστημα.  
Περιέχει τις βασικές πληροφορίες του billing: ποιο plan έχει επιλέξει η εταιρεία, σε τι billing κύκλο, ποιο είναι το status και ποιο subscription έχει δημιουργηθεί στο Stripe.

Η πραγματική χρέωση αναλύεται στον πίνακα `subscription_items`.

**Works with:**
- `companies` → η εταιρεία στην οποία ανήκει η συνδρομή
- `plans` → το επιλεγμένο subscription plan
- `subscription_items` → όλα τα συστατικά (plan, plugins, extra stores) της συνδρομής
- `company_plugins` (έμμεσα) → plugins που χρεώνονται ως subscription items
- `stores` (έμμεσα) → extra stores αλλάζουν τη συνδρομή
- `stripe` (έμμεσα) → Stripe subscription, customer & price IDs αποθηκεύονται εδώ
- `onboarding` → δημιουργείται/ολοκληρώνεται κατά την επιλογή plan στο onboarding

Χρησιμοποιείται για:
- διαχείριση ενεργής συνδρομής,
- ανανέωση billing κύκλου (monthly/yearly),
- αλλαγή plan,
- ακύρωση/παύση συνδρομών,
- σύνδεση με Stripe για αυτοματοποιημένες χρεώσεις,
- εύρεση τι χαρακτηριστικά έχει πρόσβαση η εταιρεία μέσω plan.

Αποτελεί το “root billing object” για κάθε εταιρεία.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|--------|-----------|------|-----------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique subscription identifier |
| company_id (FK) | UUID | NOT NULL | — | References companies(id). One active subscription per company |
| plan_id (FK) | UUID | NOT NULL | — | References plans(id) |
| subscription_code | TEXT | NOT NULL | — | UI Identifier |
| stripe_customer_id | TEXT | NULL | — | Stripe customer ID |
| stripe_subscription_id | TEXT | NULL | — | Stripe subscription ID |
| billing_period | TEXT | NOT NULL | 'monthly' | 'monthly' or 'yearly' |
| billing_status | TEXT | NOT NULL | 'active' | 'active', 'past_due', 'canceled', 'incomplete' |
| current_period_start | TIMESTAMP | NULL | — | From Stripe |
| current_period_end | TIMESTAMP | NULL | — | From Stripe |
| cancel_at_period_end | BOOLEAN | NOT NULL | FALSE | Whether subscription will cancel at end of cycle |
| cancel_at | TIMESTAMP | NULL | — | When subscription has to be canceled |
| canceled_at | TIMESTAMP | NULL | — | When subscription was fully canceled |
| created_at | TIMESTAMP | NOT NULL | NOW() | When subscription was created |
| updated_at | TIMESTAMP | NOT NULL | NOW() | When last updated |

---

## ℹ️ Notes

- Each company has **one subscription**, linked via `company.subscription_id`.
- Billing is handled through Stripe; this table stores synced state.
- Individual billable components (plan, addons, extra stores) live in:
  - **subscription_items**
- `billing_status` mirrors Stripe subscription status.
- `cancel_at_period_end = TRUE` means:
  - The user will keep access until `current_period_end`.
- If the subscription is free (Basic plan), the record may exist with:
  - NULL Stripe fields  
  - billing_status = 'active'

---

## 📌 2. Example Rows

| id       | company_id | plan_id    | subscription_code | stripe_customer_id | stripe_subscription_id | billing_period | billing_status | current_period_start | current_period_end | cancel_at_period_end | cancel_at  | canceled_at | created_at          | updated_at          |
| -------- | ---------- | ---------- | ----------------- | ------------------ | ---------------------- | -------------- | -------------- | -------------------- | ------------------ | -------------------- | ---------- | ----------- | ------------------- | ------------------- |
| sub-1111 | comp-1111  | plan-basic | SUB-0001        | cus_9sdf88ff     | sub_93jf8sdjf        | monthly      | active       | 2025-01-01           | 2025-02-01         | FALSE                | NULL       | NULL        | 2025-01-01 10:00:00 | 2025-01-01 10:00:00 |
| sub-2222 | comp-2222  | plan-pro   | SUB-0002        | cus_92jfj22d     | sub_21ff9sdf2        | yearly       | past_due     | 2025-01-15           | 2026-01-15         | FALSE                | NULL       | NULL        | 2025-01-15 12:30:00 | 2025-01-20 08:00:00 |
| sub-3333 | comp-3333  | plan-basic | SUB-0003        | cus_88ff9dsf     | sub_xx99sd88         | monthly      | canceled     | 2024-11-01           | 2024-12-01         | TRUE                 | 2024-12-01 | 2024-12-01  | 2024-11-01 09:10:00 | 2024-12-02 09:00:00 |

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,

  subscription_code TEXT NOT NULL UNIQUE,

  currency TEXT NOT NULL DEFAULT 'eur', -- 🆕 ΕΔΩ (το currency που χρεώθηκε)

  stripe_subscription_id TEXT NULL UNIQUE,

  billing_period TEXT NULL DEFAULT 'monthly'
    CHECK (billing_period IN ('monthly', 'yearly')),

  billing_status TEXT NOT NULL DEFAULT 'incomplete' CHECK (billing_status IN (
    'incomplete',        -- Αρχική κατάσταση
    'incomplete_expired',-- Αποτυχία πληρωμής
    'active', 
    'past_due', 
    'canceled', '
    incomplete', 
    'trialing'
  )),

  current_period_start TIMESTAMP NULL,
  current_period_end TIMESTAMP NULL,

  -- 🆕 ΠΡΟΣΘΗΚΗ: Trial tracking
  trial_start TIMESTAMP NULL,
  trial_end TIMESTAMP NULL,

  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  cancel_at TIMESTAMP NULL,
  canceled_at TIMESTAMP NULL,

  -- 🆕 ΠΡΟΣΘΗΚΗ: Audit fields
  metadata JSONB NULL, -- Για extra info (promo codes, notes, etc.)

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_company_id ON subscriptions(company_id);
CREATE INDEX idx_subscriptions_plan_id ON subscriptions(plan_id);
CREATE INDEX idx_subscriptions_billing_status ON subscriptions(billing_status);
CREATE INDEX idx_subscriptions_period_end ON subscriptions(current_period_end) WHERE billing_status = 'active';
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO subscriptions 
  (company_id, plan_id, subscription_code, stripe_customer_id, stripe_subscription_id, billing_period, billing_status, current_period_start, current_period_end, cancel_at_period_end)
VALUES
  -- Active monthly subscription
  (
    'comp-1111',
    'plan-basic',
    'SUB-0001',
    'cus_9sdf88ff',
    'sub_93jf8sdjf',
    'monthly',
    'active',
    '2025-01-01',
    '2025-02-01',
    FALSE
  ),

  -- Yearly subscription currently past_due
  (
    'comp-2222',
    'plan-pro',
    'SUB-0002',
    'cus_92jfj22d',
    'sub_21ff9sdf2',
    'yearly',
    'past_due',
    '2025-01-15',
    '2026-01-15',
    FALSE
  ),

  -- Canceled subscription
  (
    'comp-3333',
    'plan-basic',
    'SUB-0003',
    'cus_88ff9dsf',
    'sub_xx99sd88',
    'monthly',
    'canceled',
    '2024-11-01',
    '2024-12-01',
    TRUE
  );
```