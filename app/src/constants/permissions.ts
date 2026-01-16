// constants/permissions.ts

// Permission structure: {module}.{resource}.{action}
export const PERMISSIONS = {
    // Sales
    SALES_VIEW: 'sales.view',
    SALES_CREATE: 'sales.create',
    SALES_EDIT: 'sales.edit',
    SALES_DELETE: 'sales.delete',
    
    // Purchases
    PURCHASES_VIEW: 'purchases.view',
    PURCHASES_CREATE: 'purchases.create',
    PURCHASES_EDIT: 'purchases.edit',
    PURCHASES_DELETE: 'purchases.delete',
    
    // Products
    PRODUCTS_VIEW: 'products.view',
    PRODUCTS_CREATE: 'products.create',
    PRODUCTS_EDIT: 'products.edit',
    PRODUCTS_DELETE: 'products.delete',
    PRODUCTS_MANAGE_CATEGORIES: 'products.categories.manage',
    
    // Inventory
    INVENTORY_VIEW: 'inventory.view',
    INVENTORY_ADJUST: 'inventory.adjust',
    INVENTORY_TRANSFER: 'inventory.transfer',
    
    // Customers
    CUSTOMERS_VIEW: 'customers.view',
    CUSTOMERS_CREATE: 'customers.create',
    CUSTOMERS_EDIT: 'customers.edit',
    CUSTOMERS_DELETE: 'customers.delete',
    
    // Vendors
    VENDORS_VIEW: 'vendors.view',
    VENDORS_CREATE: 'vendors.create',
    VENDORS_EDIT: 'vendors.edit',
    VENDORS_DELETE: 'vendors.delete',
    
    // Transactions
    TRANSACTIONS_VIEW: 'transactions.view',
    TRANSACTIONS_EXPORT: 'transactions.export',
    
    // Reports
    REPORTS_VIEW: 'reports.view',
    REPORTS_EXPORT: 'reports.export',
    REPORTS_FINANCIAL: 'reports.financial',
    
    // Invoices
    INVOICES_VIEW: 'invoices.view',
    INVOICES_CREATE: 'invoices.create',
    INVOICES_EDIT: 'invoices.edit',
    INVOICES_DELETE: 'invoices.delete',
    
    // Company Management
    COMPANY_MANAGE: 'company.manage',
    COMPANY_SETTINGS: 'company.settings',
    COMPANY_BILLING: 'company.billing',
    
    // Store Management
    STORES_MANAGE: 'stores.manage',
    STORES_CREATE: 'stores.create',
    STORES_EDIT: 'stores.edit',
    STORES_DELETE: 'stores.delete',
    
    // User Management
    USERS_VIEW: 'users.view',
    USERS_INVITE: 'users.invite',
    USERS_EDIT: 'users.edit',
    USERS_DELETE: 'users.delete',
    
    // Roles & Permissions
    ROLES_VIEW: 'roles.view',
    ROLES_CREATE: 'roles.create',
    ROLES_EDIT: 'roles.edit',
    ROLES_DELETE: 'roles.delete',
    PERMISSIONS_MANAGE: 'permissions.manage',
    
    // Plugins
    PLUGINS_VIEW: 'plugins.view',
    PLUGINS_INSTALL: 'plugins.install',
    PLUGINS_UNINSTALL: 'plugins.uninstall',
    PLUGINS_CONFIGURE: 'plugins.configure',
} as const;

// Type helper for autocomplete
export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Helper για wildcard permissions (π.χ. "sales.*" = όλα τα sales permissions)
export const hasWildcardPermission = (
    userPermissions: string[],
    permission: string
): boolean => {
    const [module] = permission.split('.');
    return userPermissions.includes(`${module}.*`) || userPermissions.includes('*');
};

// Helper για να πάρεις όλα τα permissions ενός module
export const getModulePermissions = (module: string): Permission[] => {
    return Object.values(PERMISSIONS).filter(p => p.startsWith(`${module}.`)) as Permission[];
};