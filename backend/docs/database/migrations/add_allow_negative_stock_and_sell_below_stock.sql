-- Migration: Add allow_negative_stock to companies, inventory.sell_below_stock permission
-- Part of: Allow Negative Stock and Purchase Edit Fix

-- 1. Add allow_negative_stock to companies
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS allow_negative_stock BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN companies.allow_negative_stock IS 'When true, allows sales/purchase edits to reduce stock below zero, subject to inventory.sell_below_stock permission.';

-- 2. Add inventory.sell_below_stock permission
INSERT INTO permissions (key, name, description)
VALUES (
    'inventory.sell_below_stock',
    'Sell Below Stock',
    'Επιτρέπει πώληση/επεξεργασία όταν το απόθεμα θα γίνει αρνητικό (όταν η επιλογή επιτρέπεται από την εταιρεία)'
)
ON CONFLICT (key) DO NOTHING;

-- 3. Add to default_role_permissions for admin and manager
INSERT INTO default_role_permissions (default_role_key, permission_key)
VALUES
    ('admin', 'inventory.sell_below_stock'),
    ('manager', 'inventory.sell_below_stock')
ON CONFLICT (default_role_key, permission_key) DO NOTHING;

-- 4. For existing companies: add inventory.sell_below_stock to roles with key 'admin' or 'manager'
INSERT INTO role_permissions (role_id, permission_key, source)
SELECT r.id, 'inventory.sell_below_stock', 'custom'
FROM roles r
WHERE r.key IN ('admin', 'manager')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_key = 'inventory.sell_below_stock'
  );
