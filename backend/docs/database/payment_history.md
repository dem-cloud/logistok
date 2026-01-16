```sql
CREATE TABLE payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  
  stripe_payment_intent_id TEXT NULL,
  stripe_invoice_id TEXT NOT NULL UNIQUE,
  stripe_charge_id TEXT NULL,
  
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'eur',
  
  status TEXT NOT NULL CHECK (status IN (
    'pending', 'succeeded', 'failed', 'canceled', 'refunded'
  )),
  
  payment_method TEXT NULL, -- 'card', 'sepa_debit', etc.
  
  failure_reason TEXT NULL,
  
  metadata JSONB NULL,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_history_subscription ON payment_history(subscription_id);
CREATE INDEX idx_payment_history_status ON payment_history(status);
```