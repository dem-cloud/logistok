# User Notification Preferences

## Overview

The `notification_preferences` column on `users` stores simple email toggles for the My Account > Notifications settings tab.

## Column

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| notification_preferences | JSONB | '{}' | Object with boolean keys |

## Schema

```json
{
  "email_invitations": true,
  "email_marketing": true
}
```

- **email_invitations**: Team invitations (optional).
- **email_marketing**: Promotional/news emails (optional).

Receipts, invoices, welcome emails, and subscription lifecycle emails are always sent (mandatory).

## Migration

Run `migrations/add_notification_preferences.sql` in Supabase SQL Editor.

## Supabase Storage

Create a **public** bucket named `user-avatars` for profile photo uploads (Account Profile tab).

Path: Storage → New bucket → Name: `user-avatars` → Public bucket: Yes
