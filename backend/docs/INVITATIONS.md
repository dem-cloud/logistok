# Invitations – Documentation

This document describes the invitation system: database schema, backend routes, email sending, and token flow.

---

## 1. Database Tables

### `invitations` table

**Source:** `backend/docs/database/invitations.md`, `backend/routes/shared.js`

```sql
CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    invited_email TEXT NOT NULL,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,

    invited_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,

    token UUID NOT NULL DEFAULT gen_random_uuid(),

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMP NULL,
    expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);
```

| Column         | Type      | Description                                      |
|----------------|-----------|--------------------------------------------------|
| `id`           | UUID      | Primary key, auto-generated                      |
| `invited_email`| TEXT      | Email address of the invited person              |
| `company_id`   | UUID      | Company the user is invited to                   |
| `role_id`      | UUID      | Role the user will get in the company            |
| `invited_by`   | UUID      | User ID of the inviter                           |
| `token`        | UUID      | Secret token for the invite link                 |
| `status`       | TEXT      | `pending` \| `accepted` \| `expired` \| `revoked`|
| `created_at`   | TIMESTAMP | Creation time                                    |
| `accepted_at`  | TIMESTAMP | Set when invitation is accepted                  |
| `expires_at`   | TIMESTAMP | Default: 7 days from creation                    |

---

## 2. Backend Routes

Base path for all shared routes: **`/api/shared`** (see `backend/app.js`).

| Method | Path                  | Auth       | Description                    |
|--------|-----------------------|------------|--------------------------------|
| POST   | `/company/invite`     | Required   | Create invitation and send email |
| GET    | `/company/invitations`| Required   | List pending invitations for company |
| GET    | `/invite/:token`      | None       | Look up invite by token (public) |
| POST   | `/invite/accept`      | None       | Accept invitation (create user / add to company) |

### POST `/api/shared/company/invite`

**Auth:** `requireAuth`  
**Body:** `{ email: string, role_id: string }`

1. Check if invited user already in company (see note below).
2. Enforce plan user limit via `canAddUser(companyId)`.
3. Insert row into `invitations` (token auto-generated).
4. Send invitation email via Resend.

**Note:** The current “already in company” check uses `userId` (inviter) instead of looking up the invitee by `invited_email`; it may not behave as intended.

### GET `/api/shared/company/invitations`

**Auth:** `requireAuth`, `requireAnyPermission(['users.invite','company.manage','*'])`  
**Query:** company from `req.companyId` or `req.user.companyId`

Returns pending invitations for the company, including `roles` join.

### GET `/api/shared/invite/:token`

**Auth:** None (public)

Returns invite metadata if:
- Token exists
- Status is `pending`
- Not expired (`expires_at > now`)

Response includes `email`, `company`, `role`.

### POST `/api/shared/invite/accept`

**Auth:** None (public)  
**Body:** `{ token: string, password?: string }`

1. Load invitation by token and validate (exists, `pending`, not expired).
2. Look up user by `invited_email`.
3. If user does not exist: create user with `password_hash` (requires `password` in body).
4. If user exists: attach to company (no password needed).
5. Insert `company_users` row.
6. Update invitation: `status = 'accepted'`, `accepted_at = now`.
7. Return `access_token` (JWT) for the user.

---

## 3. Email Sending

Invitation emails are sent from `backend/routes/shared.js` using **Resend**.

**Provider:** [Resend](https://resend.com)  
**Dependencies:** `resend` npm package, `RESEND_EMAIL`, `RESEND_API_KEY` in `.env`

**Invitation email (inline in shared.js):**

```
From: Olyntos <${process.env.RESEND_EMAIL}>
To: {invited_email}
Subject: Olyntos – You've been invited
Body: HTML with link https://app.olyntos.gr/invite/${invitation.token}
```

**Note:** `resend` is referenced in `shared.js` but not imported/required. Other email helpers in `backend/helpers/emailService.js` (e.g. `sendWelcomeEmail`) use Resend and could be used instead if a `sendInvitationEmail` helper were added.

---

## 4. Invitation Token Flow

### Token generation

- The `token` column is a UUID (`gen_random_uuid()` default).
- Created when the invitation row is inserted in `POST /company/invite`.
- One token per invitation.

### Flow diagram

```
1. Invite (POST /api/shared/company/invite)
   ├── Create invitation row (token auto-generated)
   └── Email sent with link: https://app.olyntos.gr/invite/{token}

2. User clicks link → Frontend route: /invite/:token
   └── InviteSetPassword page

3. Load invite (GET /api/shared/invite/:token)
   └── Validates: exists, status=pending, expires_at > now

4. User accepts
   ├── New user: must set password → POST /api/shared/invite/accept { token, password }
   └── Existing user: POST /api/shared/invite/accept { token }

5. Backend (POST /invite/accept)
   ├── Create user (if needed)
   ├── Insert company_users
   ├── Mark invitation accepted
   └── Return access_token (JWT)

6. Frontend
   └── Uses access_token and navigates to /select-company
```

### Token lifecycle

| State    | Meaning                                      | Token usable? |
|----------|----------------------------------------------|---------------|
| pending  | Awaiting acceptance                          | Yes           |
| accepted | Invitation accepted, user in company         | No            |
| expired  | Past `expires_at`                            | No            |
| revoked  | Manually cancelled                           | No            |

### Security

- Token is a UUID (128-bit).
- Only `GET /invite/:token` and `POST /invite/accept` use it; both are unauthenticated.
- Invitation is tied to a single email; existing user must match `invited_email`.
- Expiration is enforced in both GET (lookup) and POST (accept).

---

## 5. Frontend Integration

| Component / Hook      | API usage                                           |
|-----------------------|------------------------------------------------------|
| `useInvitations`      | GET `/api/shared/company/invitations`, POST `/api/shared/company/invite` |
| `InviteSetPassword`   | GET `/api/shared/invite/:token` ✓, POST `/api/invite/accept` ⚠️ |

**URL mismatch:** `InviteSetPassword.tsx` calls `POST /api/invite/accept` but the backend route is `POST /api/shared/invite/accept`. The correct frontend path should be `/api/shared/invite/accept`.

---

## 6. Missing Imports in shared.js

The following are used in `backend/routes/shared.js` but not imported:

- `resend` (for invitation email) – line 77
- `bcrypt` / `bcryptjs` (for hashing password on accept) – line 932
- `generateAccessToken` (for JWT on accept) – line 975

These should be added at the top of the file, for example:

```js
const bcrypt = require('bcryptjs');
const { Resend } = require('resend');
const { generateAccessToken } = require('../helpers/tokens.js');

const resend = new Resend(process.env.RESEND_API_KEY);
```

---

## References

- `backend/docs/database/invitations.md` – table schema
- `backend/routes/shared.js` – invite routes and logic
- `app/src/pages/InviteSetPassword.tsx` – accept flow UI
- `app/src/hooks/useInvitations.ts` – list and create invitations
