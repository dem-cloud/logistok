```sql
CREATE TABLE user_store_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  
  -- Store-specific role (overrides role_id in company_users)
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  
  status TEXT NOT NULL DEFAULT 'active' 
    CHECK (status IN ('active', 'inactive')),
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, store_id)
);

ALTER TABLE user_store_roles
ADD CONSTRAINT user_store_roles_user_store_unique
UNIQUE (user_id, store_id);

```