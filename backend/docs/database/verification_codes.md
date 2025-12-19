# 🗂 Table: verification_codes

---

Αποθηκεύει **κωδικούς επαλήθευσης** (verification codes) που χρησιμοποιούνται για login, password reset, email verification ή 2FA.  
Κάθε verification code συνδέεται με έναν χρήστη και έχει συγκεκριμένο σκοπό, διάρκεια ζωής και κατάσταση (used/expired).

Οι κωδικοί είναι **short-lived** και δεν πρέπει να παραμένουν ενεργοί για πολύ — για αυτό και ο πίνακας χρησιμοποιείται συχνά μαζί με automated cleanup.

**Works with:**
- `users` → σε ποιον χρήστη ανήκει ο verification code
- Authentication system → login, reset password, email verification
- `user_sessions` (έμμεσα) → μπορεί να δημιουργηθεί session μετά από επιτυχημένο verification

Χρησιμοποιείται για:
- password reset flows,
- email verification κατά την εγγραφή,
- magic link login,
- 2FA challenges (αν χρησιμοποιηθούν),
- security logs.

Αποτελεί κρίσιμο μέρος του authentication & security subsystem για ασφαλή workflows χρήστη.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|--------|-----------|------|-----------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique verification code identifier |
| user_id (FK) | UUID | NULL | — | References users(id). NULL if code sent before account creation |
| email | TEXT | NULL | — | Email to which the code was sent |
| phone | TEXT | NULL | — | Phone to which the code was sent |
| delivery_method | TEXT | NOT NULL | — | email, sms, device |
| code_hash | TEXT | NOT NULL | — | Verification code (hashed) |
| type | TEXT | NOT NULL | — | 'signup', 'password_reset', 'email_change', etc. |
| expires_at | TIMESTAMP | NOT NULL | — | When the code expires |
| consumed_at | TIMESTAMP | NULL | — | When the code is being consumed |
| consumed | BOOLEAN | NOT NULL | FALSE | TRUE = code already used |
| ip_address | TEXT | NULL | — | Ip address |
| fingerprint | TEXT | NULL | — | Fingerprint |
| attempts | INT | NOT NULL | 0 | Attempts |
| created_at | TIMESTAMP | NOT NULL | NOW() | When the code was created |
| updated_at | TIMESTAMP | NOT NULL | NOW() | When the code was updated |

---

## 📌 2. Example Rows

| id      | user_id  | email                                               | phone           | delivery_method | code_hash          | type             | expires_at          | consumed_at         | consumed | ip_address     | fingerprint | attempts | created_at          | updated_at          |
| ------- | -------- | --------------------------------------------------- | --------------- | --------------- | ------------------ | ---------------- | ------------------- | ------------------- | -------- | -------------- | ----------- | -------- | ------------------- | ------------------- |
| vc-1111 | user-aaa | [nikos@example.com](mailto:nikos@example.com)     | NULL            | email         | $2b$10$kjsdf9... | signup         | 2025-01-01 09:10:00 | NULL                | FALSE    | 192.168.1.10 | fp_ABC123 | 0        | 2025-01-01 09:00:00 | 2025-01-01 09:00:00 |
| vc-2222 | user-bbb | NULL                                                | +306940001111 | sms           | $2b$10$8ssdf...  | password_reset | 2025-01-03 10:00:00 | 2025-01-03 09:50:00 | TRUE     | 85.72.190.22 | fp_MOBILE | 1        | 2025-01-03 09:40:00 | 2025-01-03 09:50:00 |
| vc-3333 | NULL     | [pending@example.com](mailto:pending@example.com) | NULL            | email         | $2b$10$23sdf...  | signup         | 2025-01-05 12:15:00 | NULL                | FALSE    | NULL           | NULL        | 0        | 2025-01-05 12:00:00 | 2025-01-05 12:00:00 |

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NULL REFERENCES users(id) ON DELETE CASCADE,

  email TEXT NULL,
  phone TEXT NULL,
  code_hash TEXT NOT NULL,

  delivery_method TEXT NOT NULL CHECK (delivery_method IN ('email', 'sms', 'device')),

  type TEXT NOT NULL CHECK (type IN ('signup', 'password_reset', 'email_change')),

  expires_at TIMESTAMP NOT NULL,

  consumed BOOLEAN NOT NULL DEFAULT FALSE,
  consumed_at TIMESTAMP NULL,

  ip_address TEXT NULL,
  fingerprint TEXT NULL,
  attempts INT NOT NULL DEFAULT 0,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX verification_codes_user_idx ON verification_codes (user_id);
CREATE INDEX verification_codes_email_idx ON verification_codes (email);
CREATE INDEX verification_codes_phone_idx ON verification_codes (phone);
CREATE INDEX verification_codes_code_hash_idx ON verification_codes (code_hash);
CREATE INDEX verification_codes_expires_idx ON verification_codes (expires_at);
CREATE INDEX verification_codes_consumed_idx ON verification_codes (consumed);
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO verification_codes
  (user_id, email, phone, delivery_method, code_hash, type, expires_at, consumed, ip_address, fingerprint, attempts)
VALUES
  -- Signup email verification
  (
    'user-aaa',
    'nikos@example.com',
    NULL,
    'email',
    '$2b$10$kjsdf9...',
    'signup',
    '2025-01-01 09:10:00',
    FALSE,
    '192.168.1.10',
    'fp_ABC123',
    0
  ),

  -- Password reset SMS verification (already used)
  (
    'user-bbb',
    NULL,
    '+306940001111',
    'sms',
    '$2b$10$8ssdf...',
    'password_reset',
    '2025-01-03 10:00:00',
    TRUE,
    '85.72.190.22',
    'fp_MOBILE',
    1
  ),

  -- Signup email verification before user creation
  (
    NULL,
    'pending@example.com',
    NULL,
    'email',
    '$2b$10$23sdf...',
    'signup',
    '2025-01-05 12:15:00',
    FALSE,
    NULL,
    NULL,
    0
  );
```