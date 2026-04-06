-- Migration: Add notification_preferences to users table
-- Run this in Supabase SQL Editor
-- Used by My Account > Notifications settings

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{}';

COMMENT ON COLUMN users.notification_preferences IS 'User notification settings: email_invitations, email_marketing (booleans). Receipts and plan/subscription emails are always sent.';
