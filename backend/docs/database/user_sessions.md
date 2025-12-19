# 🗂 Table: user_sessions

---

Αντιπροσωπεύει τα **active login sessions** ενός χρήστη στο σύστημα.  
Χρησιμοποιείται για authentication, refresh tokens, session security και multi-device login tracking.

Κάθε session συνδέεται με έναν χρήστη και μία συσκευή (fingerprint) και αποθηκεύει πληροφορίες όπως refresh token hash, IP, expiration και status.

**Works with:**
- `users` → σε ποιον χρήστη ανήκει το session
- `companies` (έμμεσα) → χρησιμοποιείται όταν ο χρήστης αλλάζει active company context
- Authentication system → refresh tokens, device recognition, session revocation
- `company_users` (έμμεσα) → προσδιορίζει σε ποιες εταιρείες έχει πρόσβαση ο χρήστης

Χρησιμοποιείται για:
- ασφαλή διαχείριση refresh tokens,
- logout από συγκεκριμένη συσκευή ή από όλες,
- αναγνώριση πολλαπλών συσκευών (PC, mobile, tablet),
- εντοπισμό ύποπτων sessions (IP changes, revoked tokens),
- session expiration & cleanup,
- forced logout όταν γίνεται password reset ή αναγκαστική ανάκληση.

Αποτελεί βασικό security layer για authentication και session lifecycle management.

---

## 📌 1. Fields Definition

| Field | Type | Null | Default | Description |
|--------|-----------|------|-----------|-------------|
| id (PK) | UUID | NOT NULL | gen_random_uuid() | Unique session identifier |
| user_id (FK) | UUID | NOT NULL | — | References users(id) |
| fingerprint | TEXT | NOT NULL | — | Browser/device fingerprint to identify the device |
| refresh_token_hash | TEXT | NOT NULL | — | Hashed refresh token (never store raw tokens) |
| ip_address | TEXT | NULL | — | IP address of the session |
| user_agent | TEXT | NULL | — | Browser or app user agent string |
| expires_at | TIMESTAMP | NOT NULL | — | When the refresh token expires |
| revoked | BOOLEAN | NOT NULL | FALSE | TRUE = session invalidated manually |
| created_at | TIMESTAMP | NOT NULL | NOW() | Session creation timestamp |
| last_activity_at | TIMESTAMP | NOT NULL | NOW() | Last update timestamp |
| last_login_at | TIMESTAMP | NOT NULL | NOW() | Last login timestamp |
| revoked_at | TIMESTAMP | NULL | — | When was revoked |

---

## ℹ️ Notes

Το fingerprint είναι ο μοναδικός τρόπος να αναγνωρίζεις συσκευή

Προτείνεται να περιέχει:
  - hashed user-agent
  - hashed IP
  - hashed device info
  - random salt

Με αυτό:
  - μπλοκάρεις ταυτόχρονα login από άλλη συσκευή
  - επιτρέπεις πολλαπλές συνεδρίες αλλά μόνο ανά συσκευή
  - υποστηρίζεις logout-per-device

---

## 📌 2. Example Rows

| id        | user_id  | fingerprint     | refresh_token_hash    | ip_address     | user_agent     | expires_at          | revoked | created_at          | last_activity_at    | last_login_at       | revoked_at          |
| --------- | -------- | --------------- | --------------------- | -------------- | -------------- | ------------------- | ------- | ------------------- | ------------------- | ------------------- | ------------------- |
| sess-1111 | user-aaa | fp_ABC123     | $2b$10$kjsdf9234... | 192.168.1.10 | Chrome/120.0 | 2025-02-01 10:00:00 | FALSE   | 2025-01-01 10:00:00 | 2025-01-01 10:15:00 | 2025-01-01 10:00:00 | NULL                |
| sess-2222 | user-aaa | fp_ABC123     | $2b$10$88sdfkj23... | 192.168.1.10 | Chrome/120.0 | 2025-02-10 09:00:00 | TRUE    | 2024-12-28 09:00:00 | 2024-12-28 09:00:00 | 2024-12-28 09:00:00 | 2024-12-29 11:00:00 |
| sess-3333 | user-bbb | fp_MOBILE_XYZ | $2b$10$0sdjf0sdj... | 85.72.190.22 | iOS-App/1.0  | 2025-01-20 18:30:00 | FALSE   | 2025-01-02 18:00:00 | 2025-01-02 18:10:00 | 2025-01-02 18:00:00 | NULL                |

---

## 📌 3. SQL: CREATE TABLE (Supabase)

```sql
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  fingerprint TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL UNIQUE,

  ip_address TEXT NULL,
  user_agent TEXT NULL,

  expires_at TIMESTAMP NOT NULL,

  revoked BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMP NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMP NULL
);

CREATE UNIQUE INDEX user_sessions_unique_user_fingerprint
ON user_sessions (user_id, fingerprint);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at) WHERE NOT revoked;
CREATE INDEX idx_user_sessions_fingerprint ON user_sessions(fingerprint);
```

---

## 📌 4. SQL: Insert Demo Data

```sql
INSERT INTO user_sessions
  (user_id, fingerprint, refresh_token_hash, ip_address, user_agent, expires_at, revoked)
VALUES
  -- Active Chrome session
  (
    'user-aaa',
    'fp_ABC123',
    '$2b$10$kjsdf9234...',
    '192.168.1.10',
    'Chrome/120.0',
    '2025-02-01 10:00:00',
    FALSE
  ),

  -- Revoked old session
  (
    'user-aaa',
    'fp_ABC123',
    '$2b$10$88sdfkj23...',
    '192.168.1.10',
    'Chrome/120.0',
    '2025-02-10 09:00:00',
    TRUE
  ),

  -- Mobile app session
  (
    'user-bbb',
    'fp_MOBILE_XYZ',
    '$2b$10$0sdjf0sdj...',
    '85.72.190.22',
    'iOS-App/1.0',
    '2025-01-20 18:30:00',
    FALSE
  );
```