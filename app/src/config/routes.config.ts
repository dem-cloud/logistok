import { PERMISSIONS } from "@/constants/permissions";

export type RouteConfig = {
    path: string;
    label: string;
    icon: string;
    breadcrumbPath: string[];  // Path segments after company/store (e.g., ['Ρυθμίσεις', 'Εταιρεία'])
    title: string;
    permission?: string;
    ownerOnly?: boolean;       // Only company owner can access
    section: 'quick' | 'core' | 'catalog' | 'financial' | 'system' | 'settings';
};

export const ROUTES: Record<string, RouteConfig> = {
    // ============================================
    // QUICK MENU
    // ============================================
    HOME: {
        path: '/',
        label: 'Πίνακας Ελέγχου',
        icon: 'home',
        breadcrumbPath: ['Πίνακας Ελέγχου'],
        title: 'Πίνακας Ελέγχου',
        section: 'quick',
    },
    NOTIFICATIONS: {
        path: '/notifications',
        label: 'Ειδοποιήσεις',
        icon: 'bell',
        breadcrumbPath: ['Ειδοποιήσεις'],
        title: 'Ειδοποιήσεις',
        section: 'quick',
    },
    // MVP: hidden
    // CALENDAR: {
    //     path: '/calendar',
    //     label: 'Ημερολόγιο',
    //     icon: 'calendar',
    //     breadcrumbPath: ['Ημερολόγιο'],
    //     title: 'Ημερολόγιο',
    //     section: 'quick',
    // },

    // ============================================
    // CORE OPERATIONS
    // ============================================
    SALES: {
        path: '/sales',
        label: 'Πωλήσεις',
        icon: 'cart',
        breadcrumbPath: ['Πωλήσεις'],
        title: 'Πωλήσεις',
        permission: PERMISSIONS.SALES_VIEW,
        section: 'core',
    },
    PURCHASES: {
        path: '/purchases',
        label: 'Αγορές',
        icon: 'package',
        breadcrumbPath: ['Αγορές'],
        title: 'Αγορές',
        permission: PERMISSIONS.PURCHASES_VIEW,
        section: 'core',
    },
    PRODUCTS: {
        path: '/products',
        label: 'Προϊόντα',
        icon: 'box',
        breadcrumbPath: ['Προϊόντα'],
        title: 'Προϊόντα',
        permission: PERMISSIONS.PRODUCTS_VIEW,
        section: 'catalog',
    },
    INVENTORY: {
        path: '/inventory',
        label: 'Απόθεμα',
        icon: 'warehouse',
        breadcrumbPath: ['Απόθεμα'],
        title: 'Απόθεμα',
        permission: PERMISSIONS.INVENTORY_VIEW,
        section: 'core',
    },
    CUSTOMERS: {
        path: '/customers',
        label: 'Πελάτες',
        icon: 'users',
        breadcrumbPath: ['Πελάτες'],
        title: 'Πελάτες',
        permission: PERMISSIONS.CUSTOMERS_VIEW,
        section: 'catalog',
    },
    VENDORS: {
        path: '/vendors',
        label: 'Προμηθευτές',
        icon: 'truck',
        breadcrumbPath: ['Προμηθευτές'],
        title: 'Προμηθευτές',
        permission: PERMISSIONS.VENDORS_VIEW,
        section: 'catalog',
    },

    // ============================================
    // FINANCIAL
    // ============================================
    // MVP: hidden
    // TRANSACTIONS: {
    //     path: '/transactions',
    //     label: 'Συναλλαγές',
    //     icon: 'transfer',
    //     breadcrumbPath: ['Συναλλαγές'],
    //     title: 'Συναλλαγές',
    //     permission: PERMISSIONS.TRANSACTIONS_VIEW,
    //     section: 'financial',
    // },
    RECEIPTS: {
        path: '/receipts',
        label: 'Εισπράξεις',
        icon: 'receipt',
        breadcrumbPath: ['Εισπράξεις'],
        title: 'Εισπράξεις',
        permission: PERMISSIONS.SALES_VIEW,
        section: 'financial',
    },
    PAYMENTS: {
        path: '/payments',
        label: 'Πληρωμές',
        icon: 'wallet',
        breadcrumbPath: ['Πληρωμές'],
        title: 'Πληρωμές',
        permission: PERMISSIONS.PURCHASES_VIEW,
        section: 'financial',
    },
    REPORTS: {
        path: '/reports',
        label: 'Αναφορές',
        icon: 'chart',
        breadcrumbPath: ['Αναφορές'],
        title: 'Αναφορές',
        permission: PERMISSIONS.REPORTS_VIEW,
        section: 'financial',
    },
    // MVP: hidden
    // INVOICES: {
    //     path: '/invoices',
    //     label: 'Τιμολόγια',
    //     icon: 'file-text',
    //     breadcrumbPath: ['Τιμολόγια'],
    //     title: 'Τιμολόγια',
    //     permission: PERMISSIONS.INVOICES_VIEW,
    //     section: 'financial',
    // },

    // ============================================
    // SYSTEM (Υποστήριξη)
    // ============================================
    PLUGINS: {
        path: '/plugins',
        label: 'Τα Plugins μου',
        icon: 'puzzle',
        breadcrumbPath: ['Τα Plugins μου'],
        title: 'Τα Plugins μου',
        section: 'system',
    },
    MARKETPLACE: {
        path: '/marketplace',
        label: 'Marketplace',
        icon: 'grid',
        breadcrumbPath: ['Marketplace'],
        title: 'Marketplace',
        section: 'system',
    },
    HELP: {
        path: '/help',
        label: 'Βοήθεια',
        icon: 'help',
        breadcrumbPath: ['Βοήθεια'],
        title: 'Βοήθεια',
        section: 'system',
    },

    // ============================================
    // SETTINGS
    // ============================================
    SETTINGS: {
        path: '/settings',
        label: 'Ρυθμίσεις',
        icon: 'settings',
        breadcrumbPath: ['Ρυθμίσεις'],
        title: 'Ρυθμίσεις',
        section: 'settings',
    },
    SETTINGS_ACCOUNT: {
        path: '/settings/account',
        label: 'Ο Λογαριασμός μου',
        icon: 'user',
        breadcrumbPath: ['Ρυθμίσεις', 'Ο Λογαριασμός μου', 'Προφίλ'],
        title: 'Προφίλ',
        section: 'settings',
        // No permission - everyone can see their own account
    },
    SETTINGS_ACCOUNT_SECURITY: {
        path: '/settings/account/security',
        label: 'Ασφάλεια',
        icon: 'user',
        breadcrumbPath: ['Ρυθμίσεις', 'Ο Λογαριασμός μου', 'Ασφάλεια'],
        title: 'Ασφάλεια',
        section: 'settings',
    },
    SETTINGS_ACCOUNT_NOTIFICATIONS: {
        path: '/settings/account/notifications',
        label: 'Ειδοποιήσεις',
        icon: 'user',
        breadcrumbPath: ['Ρυθμίσεις', 'Ο Λογαριασμός μου', 'Ειδοποιήσεις'],
        title: 'Ειδοποιήσεις',
        section: 'settings',
    },
    SETTINGS_COMPANY: {
        path: '/settings/company',
        label: 'Εταιρεία',
        icon: 'building',
        breadcrumbPath: ['Ρυθμίσεις', 'Εταιρεία', 'Γενικά'],
        title: 'Γενικά',
        ownerOnly: true,
        section: 'settings',
    },
    SETTINGS_COMPANY_BRANDING: {
        path: '/settings/company/branding',
        label: 'Branding',
        icon: 'building',
        breadcrumbPath: ['Ρυθμίσεις', 'Εταιρεία', 'Branding'],
        title: 'Branding',
        ownerOnly: true,
        section: 'settings',
    },
    SETTINGS_COMPANY_LEGAL: {
        path: '/settings/company/legal',
        label: 'Νομικά Στοιχεία',
        icon: 'building',
        breadcrumbPath: ['Ρυθμίσεις', 'Εταιρεία', 'Νομικά Στοιχεία'],
        title: 'Νομικά Στοιχεία',
        ownerOnly: true,
        section: 'settings',
    },
    SETTINGS_TEAM: {
        path: '/settings/team',
        label: 'Ομάδα',
        icon: 'users',
        breadcrumbPath: ['Ρυθμίσεις', 'Ομάδα', 'Μέλη'],
        title: 'Μέλη',
        permission: PERMISSIONS.USERS_VIEW,
        section: 'settings',
    },
    SETTINGS_TEAM_INVITES: {
        path: '/settings/team/invites',
        label: 'Προσκλήσεις',
        icon: 'users',
        breadcrumbPath: ['Ρυθμίσεις', 'Ομάδα', 'Προσκλήσεις'],
        title: 'Προσκλήσεις',
        permission: PERMISSIONS.USERS_INVITE,
        section: 'settings',
    },
    SETTINGS_ROLES: {
        path: '/settings/roles',
        label: 'Ρόλοι & Δικαιώματα',
        icon: 'shield',
        breadcrumbPath: ['Ρυθμίσεις', 'Ρόλοι & Δικαιώματα'],
        title: 'Ρόλοι & Δικαιώματα',
        ownerOnly: true,
        section: 'settings',
    },
    SETTINGS_STORES: {
        path: '/settings/stores',
        label: 'Καταστήματα',
        icon: 'store',
        breadcrumbPath: ['Ρυθμίσεις', 'Καταστήματα'],
        title: 'Καταστήματα',
        permission: PERMISSIONS.STORES_MANAGE,
        section: 'settings',
    },
    SETTINGS_SUBSCRIPTION: {
        path: '/settings/subscription',
        label: 'Συνδρομή',
        icon: 'credit-card',
        breadcrumbPath: ['Ρυθμίσεις', 'Συνδρομή', 'Πλάνο'],
        title: 'Πλάνο',
        ownerOnly: true,
        section: 'settings',
    },
    SETTINGS_SUBSCRIPTION_BILLING: {
        path: '/settings/subscription/billing',
        label: 'Τιμολόγηση',
        icon: 'credit-card',
        breadcrumbPath: ['Ρυθμίσεις', 'Συνδρομή', 'Τιμολόγηση'],
        title: 'Τιμολόγηση',
        ownerOnly: true,
        section: 'settings',
    },
    SETTINGS_SUBSCRIPTION_INVOICES: {
        path: '/settings/subscription/invoices',
        label: 'Ιστορικό Πληρωμών',
        icon: 'credit-card',
        breadcrumbPath: ['Ρυθμίσεις', 'Συνδρομή', 'Ιστορικό'],
        title: 'Ιστορικό Πληρωμών',
        ownerOnly: true,
        section: 'settings',
    },
};

// Helper για εύκολη πρόσβαση
export const getRoutesBySection = (section: RouteConfig['section']) => {
    return Object.values(ROUTES).filter(route => route.section === section);
};

// Helper για να βρούμε route από path (exact match)
export const getRouteByPath = (path: string): RouteConfig | undefined => {
    return Object.values(ROUTES).find(route => route.path === path);
};

// Helper για να βρούμε route από path (partial match για nested routes)
export const getRouteByPathPrefix = (path: string): RouteConfig | undefined => {
    return Object.values(ROUTES).find(route => 
        path === route.path || path.startsWith(route.path + '/')
    );
};