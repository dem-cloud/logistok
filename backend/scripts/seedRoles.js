/**
 * Seed script for permissions, default_roles, and default_role_permissions.
 * Run: npm run seed (from backend directory)
 * Requires: .env with SUPA_PROJECT_URL and SUPA_SERVICE_ROLE_KEY
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const supabase = require('../supabaseConfig');

// All permission keys from app/src/constants/permissions.ts (source of truth)
const PERMISSION_KEYS = [
    'sales.view', 'sales.create', 'sales.edit', 'sales.delete',
    'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.delete',
    'products.view', 'products.create', 'products.edit', 'products.delete', 'products.categories.manage',
    'inventory.view', 'inventory.adjust', 'inventory.transfer', 'inventory.sell_below_stock',
    'customers.view', 'customers.create', 'customers.edit', 'customers.delete',
    'vendors.view', 'vendors.create', 'vendors.edit', 'vendors.delete',
    'transactions.view', 'transactions.export',
    'reports.view', 'reports.export', 'reports.financial',
    'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.delete',
    'company.manage', 'company.settings', 'company.billing',
    'stores.manage', 'stores.create', 'stores.edit', 'stores.delete',
    'users.view', 'users.invite', 'users.edit', 'users.delete',
    'roles.view', 'roles.create', 'roles.edit', 'roles.delete', 'permissions.manage',
    'plugins.view', 'plugins.install', 'plugins.uninstall', 'plugins.configure',
];

// Human-readable names for permissions (module.action -> "Module Action")
function permissionKeyToName(key) {
    const parts = key.split('.');
    return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

// Default roles to seed
const DEFAULT_ROLES = [
    { key: 'admin', name: 'Admin', description: 'Πλήρη πρόσβαση σε όλες τις λειτουργίες της εταιρείας' },
    { key: 'manager', name: 'Manager', description: 'Διαχειρίζεται προϊόντα, αποθέματα, πωλήσεις, προσωπικό' },
    { key: 'cashier', name: 'Ταμίας', description: 'Χειρίζεται POS και βασικές πωλήσεις' },
    { key: 'warehouse', name: 'Αποθήκη', description: 'Διαχείριση αποθέματος και έλεγχος αποθήκης' },
    { key: 'accountant', name: 'Λογιστής', description: 'Πρόσβαση σε οικονομικά στοιχεία και τιμολόγια' },
    { key: 'viewer', name: 'Προβολή', description: 'Μόνο προβολή για auditors και εξωτερικούς συμβούλους' },
];

// Default role permissions (per plan)
const DEFAULT_ROLE_PERMISSIONS = {
    admin: PERMISSION_KEYS, // all permissions
    manager: [
        'sales.view', 'sales.create', 'sales.edit', 'sales.delete',
        'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.delete',
        'products.view', 'products.create', 'products.edit', 'products.delete', 'products.categories.manage',
        'inventory.view', 'inventory.adjust', 'inventory.transfer', 'inventory.sell_below_stock',
        'customers.view', 'customers.create', 'customers.edit', 'customers.delete',
        'vendors.view', 'vendors.create', 'vendors.edit', 'vendors.delete',
        'transactions.view', 'transactions.export',
        'reports.view', 'reports.export',
        'invoices.view',
        'stores.manage', 'stores.create', 'stores.edit',
        'users.view', 'users.invite', 'users.edit',
        'roles.view',
    ],
    cashier: [
        'sales.view', 'sales.create', 'sales.edit',
        'products.view', 'inventory.view',
        'customers.view', 'customers.create', 'customers.edit',
    ],
    warehouse: [
        'products.view', 'products.edit',
        'inventory.view', 'inventory.adjust', 'inventory.transfer',
        'purchases.view', 'vendors.view',
    ],
    accountant: [
        'transactions.view', 'transactions.export',
        'reports.view', 'reports.export', 'reports.financial',
        'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.delete',
        'customers.view', 'vendors.view',
    ],
    viewer: [
        'sales.view', 'purchases.view', 'products.view', 'inventory.view',
        'customers.view', 'vendors.view',
        'transactions.view', 'reports.view', 'invoices.view',
    ],
};

async function seed() {
    console.log('Starting seed...');

    if (!process.env.SUPA_PROJECT_URL || !process.env.SUPA_SERVICE_ROLE_KEY) {
        console.error('Missing SUPA_PROJECT_URL or SUPA_SERVICE_ROLE_KEY in .env');
        process.exit(1);
    }

    try {
        // 1. Upsert permissions
        const permissionsRows = PERMISSION_KEYS.map(key => ({
            key,
            name: permissionKeyToName(key),
            description: null,
        }));

        const { error: permErr } = await supabase
            .from('permissions')
            .upsert(permissionsRows, { onConflict: 'key' });

        if (permErr) {
            console.error('Permissions upsert error:', permErr);
            throw permErr;
        }
        console.log(`Permissions: ${permissionsRows.length} rows upserted`);

        // 2. Upsert default_roles
        const { error: rolesErr } = await supabase
            .from('default_roles')
            .upsert(DEFAULT_ROLES, { onConflict: 'key' });

        if (rolesErr) {
            console.error('Default roles upsert error:', rolesErr);
            throw rolesErr;
        }
        console.log(`Default roles: ${DEFAULT_ROLES.length} rows upserted`);

        // 3. Build default_role_permissions rows
        const drpRows = [];
        for (const [roleKey, permKeys] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
            for (const pk of permKeys) {
                if (pk === '*') continue;
                if (!PERMISSION_KEYS.includes(pk)) {
                    console.warn(`Unknown permission key "${pk}" for role ${roleKey}, skipping`);
                    continue;
                }
                drpRows.push({
                    default_role_key: roleKey,
                    permission_key: pk,
                });
            }
        }

        const { error: drpErr } = await supabase
            .from('default_role_permissions')
            .upsert(drpRows, { onConflict: 'default_role_key,permission_key' });

        if (drpErr) {
            console.error('Default role permissions upsert error:', drpErr);
            throw drpErr;
        }
        console.log(`Default role permissions: ${drpRows.length} rows upserted`);

        console.log('Seed completed successfully.');
    } catch (err) {
        console.error('Seed failed:', err);
        process.exit(1);
    }
}

seed();
