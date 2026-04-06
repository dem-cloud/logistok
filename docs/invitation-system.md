# Invitation System Documentation

This document describes the invitation flow across the Logistok/Olyntos application: where invitations appear, how they are created, and how they are accepted.

---

## 1. Invitation UI in Company Selector / SelectCompanyLayout

### Routing & Layout
- **Route:** `/select-company`
- **Component:** `CompanySelector` (`app/src/pages/protected/CompanySelector.tsx`)
- **Layout:** Rendered inside `SelectCompanyLayout` via `RequireSelectCompany`

`RequireSelectCompany` (`app/src/routes/RequireSelectCompany.tsx`):
- If user has no `activeCompany` → shows `SelectCompanyLayout` with `Outlet` (CompanySelector)
- If user has active company → redirects to `/` or onboarding
- `SelectCompanyLayout` provides: topbar (brand, logout), main content area

### CompanySelector Invitation UI
- **Location:** `CompanySelector.tsx` lines 114–164
- **Section:** "Προσκλήσεις" (Invitations) with badge count
- **Display:** Card per invitation with:
  - Company initial avatar
  - Company name
  - Role
  - Optional "Προσκλήθηκε από {invitedBy}"
  - **Accept** and **Απόρριψη** (Reject) buttons

### Current State: Demo Data
The invitation section uses **local demo data**, not the real API:

```tsx
// CompanySelector.tsx lines 56–60
setInvitations([
    { id: '1', companyId: 'comp1', companyName: 'TechCorp', role: 'Manager', invitedBy: 'John Doe' },
    { id: '2', companyId: 'comp2', companyName: 'StartupXYZ', role: 'Developer' },
]);
```

- `fetchInvitations` (line 51) is commented out and replaced with demo data
- `handleAcceptInvitation` (line 74) only updates local state; no API call
- `handleRejectInvitation` (line 93) only updates local state; no API call

**Note:** There is no backend endpoint for “invitations received by the current user.”  
The backend only has `GET /api/shared/company/invitations`, which returns invitations **sent by** the active company.

---

## 2. useInvitations Hook

### File
`app/src/hooks/useInvitations.ts`

### Purpose
Manages **outgoing** company invitations: list and create.

### API
- `invitations`: `Invitation[]`
- `isLoading`: boolean
- `error`: Error | undefined
- `refetch`: function
- `invite`: mutation `{ mutateAsync({ email, role_id }) }`

### Implementation
- **List:** `GET /api/shared/company/invitations`
  - Query key: `["company-invitations", activeCompany?.id]`
  - Enabled when `activeCompany?.id` is set
  - `staleTime`: 1 minute
- **Create:** `POST /api/shared/company/invite` with `{ email, role_id }`
  - Invalidates `["company-invitations", activeCompany?.id]` on success

### Invitation Type (useInvitations)
```ts
type Invitation = {
    id: string;
    invited_email: string;
    token: string;
    status: string;
    expires_at: string;
    created_at: string;
    role: { id: string; key: string; name: string } | null;
    invited_by: string | null;
};
```

### Usage
Currently used only in **TeamInvites** (`app/src/pages/protected/settings/TeamInvites.tsx`):
- `const { invitations, isLoading, invite } = useInvitations();`

---

## 3. TeamInvites Page (Admin – Send Invites)

### File
`app/src/pages/protected/settings/TeamInvites.tsx`

### Route
`/settings/team/invites` (inside `SettingsPageLayout`)

### Access
Requires `PERMISSIONS.USERS_INVITE`; otherwise redirects to `/settings/team`.

### Features
1. **New invitation form**
   - Email (required)
   - Role dropdown (from `useRoles`)
   - Submit button: "Αποστολή πρόσκλησης"

2. **Pending invitations**
   - List of invitations from `useInvitations`
   - Shows: email, role, expiry
   - Expired invitations visually marked (`.expired`)

### Flow
1. User enters email and role, submits
2. `invite.mutateAsync({ email, role_id })` calls `POST /api/shared/company/invite`
3. Toast on success / error
4. Form cleared on success
5. List refetched via React Query invalidation

---

## 4. Invite Acceptance Flow (SetPassword, etc.)

### Route
`/invite/:token` — public, no auth required

### Component
`app/src/pages/InviteSetPassword.tsx`

### Steps

#### Step 1: Load invite info
- `GET /api/shared/invite/:token` (public)
- Response: `{ email, company: { name }, role: { name } }`
- If invalid/expired/not pending: show "Η πρόσκληση δεν είναι διαθέσιμη."

#### Step 2: Email mismatch (logged-in user)
- If `user?.email !== invitedEmail`: show “Δεν έχετε πρόσβαση” and offer “Αποσύνδεση και συνέχεια”
- **Note:** `existingUser` is currently hardcoded to `true` (line 77)

#### Step 3: New user (no account)
- If `!existingUser`: show password form (Κωδικός Πρόσβασης + Επανάληψη)
- Validation: length ≥ 6, passwords match
- Calls `handleAccept` with `password`

#### Step 4: Existing user
- If user already exists: no password form, just “Αποδοχή Πρόσκλησης” button

#### Step 5: Accept
- `handleAccept` posts to `/api/invite/accept` (⚠️ see note below) with `{ token, password? }`
- On success: `navigate("/select-company", { replace: true })`
- Backend returns `access_token`; current code does not use it for login (TODO)

### Backend: POST /invite/accept
- Mounted under shared: `POST /api/shared/invite/accept`
- Validates token, status, expiry
- Checks if user exists by `invited_email`
- **New user:** creates user with hashed password
- **Existing user:** uses existing user id
- Creates `company_users` row
- Updates invitation to `accepted`
- Returns JWT `access_token`

### InviteSetPassword API Path
- Frontend calls: `POST "/api/invite/accept"` (line 86)
- Shared routes are under `/api/shared`
- Correct path: `POST /api/shared/invite/accept`
- ⚠️ **Bug:** Frontend uses `/api/invite/accept`; backend endpoint is at `/api/shared/invite/accept`.

---

## Backend Endpoints Summary

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/shared/company/invite` | Yes | Create invitation, send email |
| GET | `/api/shared/company/invitations` | Yes (users.invite) | List company’s pending invitations |
| GET | `/api/shared/invite/:token` | No | Fetch invite details for acceptance page |
| POST | `/api/shared/invite/accept` | No* | Accept invitation, create user/company_user |

\* Accept does not require auth; token is provided in body.

---

## Database (invitations table)

```sql
invitations (
    id, invited_email, company_id, role_id, invited_by,
    token, status (pending|accepted|expired|revoked),
    created_at, accepted_at, expires_at
)
```

---

## Email
Invitation email is sent via Resend with link:  
`https://app.olyntos.gr/invite/${invitation.token}`
