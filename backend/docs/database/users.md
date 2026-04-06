# 🗂 Table: users

---

Αντιπροσωπεύει τον **πραγματικό λογαριασμό χρήστη** στο σύστημα (authentication-level user).  
Οι χρήστες είναι global και δεν ανήκουν απευθείας σε κάποια εταιρεία — ένας χρήστης μπορεί να ανήκει σε πολλές εταιρείες μέσω του `company_users`.

Ο πίνακας περιέχει στοιχεία login, στοιχεία ταυτοποίησης και metadata λογαριασμού.

**Works with:**
- `company_users` → συνδέει τον χρήστη με μία ή περισσότερες εταιρείες και καθορίζει τον ρόλο του σε κάθε εταιρεία
- `user_sessions` → active login sessions ανά συσκευή
- `user_store_access` → store-level access overrides
- `roles` (έμμεσα) → ο χρήστης παίρνει permissions από τον assigned role του στο `company_users`
- `sales` → δηλώνει ποιος χρήστης καταχώρησε την πώληση (ταμίας)
- `purchases` (προαιρετικά) → ποιος χρήστης καταχώρησε την αγορά
- `stock_movements` (όπου εφαρμόζεται) → ποιος χρήστης έκανε τη χειροκίνητη κίνηση αποθέματος
- `verification_codes` → codes για login/2FA/password reset

Χρησιμοποιείται για:
- authentication (email/password, OAuth, magic links),
- ταυτοποίηση χρήστη,
- global identity (multi-company access),
- auditing: ποιος έκανε ποια ενέργεια,
- user profile settings,
- security (2FA, password resets, login restrictions).

Ο πίνακας `users` είναι ο πυρήνας του identity system, πάνω στον οποίο “χτίζεται” η εταιρική πρόσβαση και το RBAC.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|--------|-----------|------|-----------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique user identifier |
| first_name | TEXT | NULL | — | User's full name |
| last_name | TEXT | NULL | — | User's full name |
| email | TEXT | NOT NULL | — | Unique user email |
| password_hash | TEXT | NOT NULL | — | Hashed password (never store raw passwords) |
| phone | TEXT | NULL | — | Optional phone number |
| email_verified | BOOLEAN | NOT NULL | FALSE | Whether the user's email is verified |
| phone_verified | BOOLEAN | NOT NULL | FALSE | Whether the user's phone is verified |
| status | TEXT | NOT NULL | 'active' | User status |
| is_active | BOOLEAN | NOT NULL | TRUE | Whether the user is active |
| avatar_url | TEXT | NULL | — | Photo profile |
| created_at | TIMESTAMP | NOT NULL | NOW() | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL | NOW() | Last update timestamp |

---

## 📌 2. Example Rows

| id       | first_name | last_name    | email                                               | password_hash        | phone             | email_verified | phone_verified | status     | is_active | avatar_url                                                        | created_at          | updated_at          |
| -------- | ---------- | ------------ | --------------------------------------------------- | -------------------- | ----------------- | -------------- | -------------- | ---------- | --------- | ------------------------------------------------------------------------ | ------------------- | ------------------- |
| user-aaa | Nikos    | Economakis | [nikos@example.com](mailto:nikos@example.com)     | $2b$10$9sd09fsd... | +30 694 0000001 | TRUE           | FALSE          | active   | TRUE      | NULL                                                                     | 2025-01-01 09:00:00 | 2025-01-01 09:00:00 |
| user-bbb | Eleni    | Papas      | [eleni@example.com](mailto:eleni@example.com)     | $2b$10$8sdfkj23... | NULL              | TRUE           | TRUE           | active   | TRUE      | [https://cdn.app.com/pfp/eleni.png](https://cdn.app.com/pfp/eleni.png) | 2025-01-02 10:15:00 | 2025-01-03 09:00:00 |
| user-ccc | Giorgos  | K.         | [giorgos@example.com](mailto:giorgos@example.com) | $2b$10$0sdjf02j... | +30 210 5555555 | FALSE          | FALSE          | pending  | TRUE      | NULL                                                                     | 2025-01-05 12:00:00 | 2025-01-05 12:00:00 |
| user-ddd | Maria    | L.         | [maria@example.com](mailto:maria@example.com)     | $2b$10$22j3jddd... | NULL              | TRUE           | FALSE          | disabled | FALSE     | NULL                                                                     | 2024-12-20 08:00:00 | 2025-01-01 11:00:00 |

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  first_name TEXT NULL,
  last_name TEXT NULL,

  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NULL,

  phone TEXT NULL,
  
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,

  avatar_url TEXT NULL,

  google_id TEXT NULL UNIQUE,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE users 
ADD CONSTRAINT user_auth_method 
CHECK (
  (password_hash IS NOT NULL) OR 
  (google_id IS NOT NULL)
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status) WHERE is_active = TRUE;
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO users
  (first_name, last_name, email, password_hash, phone, email_verified, phone_verified, status, is_active, avatar_url)
VALUES
  -- Active verified user
  (
    'Nikos',
    'Economakis',
    'nikos@example.com',
    '$2b$10$9sd09fsd...',
    '+30 694 0000001',
    TRUE,
    FALSE,
    'active',
    TRUE,
    NULL
  ),

  -- Fully verified user with profile photo
  (
    'Eleni',
    'Papas',
    'eleni@example.com',
    '$2b$10$8sdfkj23...',
    NULL,
    TRUE,
    TRUE,
    'active',
    TRUE,
    'https://cdn.app.com/pfp/eleni.png'
  ),

  -- Pending user (invited but not completed onboarding)
  (
    'Giorgos',
    'K.',
    'giorgos@example.com',
    '$2b$10$0sdjf02j...',
    '+30 210 5555555',
    FALSE,
    FALSE,
    'pending',
    TRUE,
    NULL
  ),

  -- Disabled user (soft delete)
  (
    'Maria',
    'L.',
    'maria@example.com',
    '$2b$10$22j3jddd...',
    NULL,
    TRUE,
    FALSE,
    'disabled',
    FALSE,
    NULL
  );
```