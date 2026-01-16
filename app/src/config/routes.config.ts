import { PERMISSIONS } from "@/constants/permissions";

export type RouteConfig = {
    path: string;
    label: string;
    icon: string;
    breadcrumb: string[];
    title: string;
    permission?: string;
    section: 'quick' | 'core' | 'financial' | 'management' | 'system';
};

export const ROUTES: Record<string, RouteConfig> = {
    // Quick Menu
    HOME: {
        path: '/',
        label: 'Αρχική',
        icon: 'home',
        breadcrumb: ['Logistok', 'Πίνακας Ελέγχου'],
        title: 'Πίνακας Ελέγχου',
        section: 'quick',
    },
    NOTIFICATIONS: {
        path: '/notifications',
        label: 'Ειδοποιήσεις',
        icon: 'bell',
        breadcrumb: ['Logistok', 'Ειδοποιήσεις'],
        title: 'Ειδοποιήσεις',
        section: 'quick',
    },
    CALENDAR: {
        path: '/calendar',
        label: 'Ημερολόγιο',
        icon: 'calendar',
        breadcrumb: ['Logistok', 'Ημερολόγιο'],
        title: 'Ημερολόγιο',
        section: 'quick',
    },

    // Core Operations
    SALES: {
        path: '/sales',
        label: 'Πωλήσεις',
        icon: 'cart',
        breadcrumb: ['Logistok', 'Πωλήσεις'],
        title: 'Πωλήσεις',
        permission: PERMISSIONS.SALES_VIEW,
        section: 'core',
    },
    PURCHASES: {
        path: '/purchases',
        label: 'Αγορές',
        icon: 'package',
        breadcrumb: ['Logistok', 'Αγορές'],
        title: 'Αγορές',
        permission: PERMISSIONS.PURCHASES_VIEW,
        section: 'core',
    },
    PRODUCTS: {
        path: '/products',
        label: 'Προϊόντα',
        icon: 'box',
        breadcrumb: ['Logistok', 'Προϊόντα'],
        title: 'Προϊόντα',
        permission: PERMISSIONS.PRODUCTS_VIEW,
        section: 'core',
    },
    INVENTORY: {
        path: '/inventory',
        label: 'Απόθεμα',
        icon: 'warehouse',
        breadcrumb: ['Logistok', 'Απόθεμα'],
        title: 'Απόθεμα',
        permission: PERMISSIONS.INVENTORY_VIEW,
        section: 'core',
    },
    CUSTOMERS: {
        path: '/customers',
        label: 'Πελάτες',
        icon: 'users',
        breadcrumb: ['Logistok', 'Πελάτες'],
        title: 'Πελάτες',
        permission: PERMISSIONS.CUSTOMERS_VIEW,
        section: 'core',
    },
    VENDORS: {
        path: '/vendors',
        label: 'Προμηθευτές',
        icon: 'truck',
        breadcrumb: ['Logistok', 'Προμηθευτές'],
        title: 'Προμηθευτές',
        permission: PERMISSIONS.VENDORS_VIEW,
        section: 'core',
    },

    // Financial
    TRANSACTIONS: {
        path: '/transactions',
        label: 'Συναλλαγές',
        icon: 'transfer',
        breadcrumb: ['Logistok', 'Συναλλαγές'],
        title: 'Συναλλαγές',
        permission: PERMISSIONS.TRANSACTIONS_VIEW,
        section: 'financial',
    },
    REPORTS: {
        path: '/reports',
        label: 'Αναφορές',
        icon: 'chart',
        breadcrumb: ['Logistok', 'Αναφορές'],
        title: 'Αναφορές',
        permission: PERMISSIONS.REPORTS_VIEW,
        section: 'financial',
    },
    INVOICES: {
        path: '/invoices',
        label: 'Τιμολόγια',
        icon: 'receipt',
        breadcrumb: ['Logistok', 'Τιμολόγια'],
        title: 'Τιμολόγια',
        permission: PERMISSIONS.INVOICES_VIEW,
        section: 'financial',
    },

    // Management
    STORES: {
        path: '/stores',
        label: 'Καταστήματα',
        icon: 'store',
        breadcrumb: ['Logistok', 'Διαχείριση', 'Καταστήματα'],
        title: 'Καταστήματα',
        permission: PERMISSIONS.COMPANY_MANAGE,
        section: 'management',
    },
    USERS: {
        path: '/users',
        label: 'Χρήστες',
        icon: 'team',
        breadcrumb: ['Logistok', 'Διαχείριση', 'Χρήστες'],
        title: 'Χρήστες',
        permission: PERMISSIONS.COMPANY_MANAGE,
        section: 'management',
    },
    ROLES: {
        path: '/roles',
        label: 'Ρόλοι & Άδειες',
        icon: 'shield',
        breadcrumb: ['Logistok', 'Διαχείριση', 'Ρόλοι & Άδειες'],
        title: 'Ρόλοι & Άδειες',
        permission: PERMISSIONS.COMPANY_MANAGE,
        section: 'management',
    },

    // System
    MARKETPLACE: {
        path: '/marketplace',
        label: 'Marketplace',
        icon: 'grid',
        breadcrumb: ['Logistok', 'Marketplace'],
        title: 'Marketplace',
        section: 'system',
    },
    SUBSCRIPTION: {
        path: '/subscription',
        label: 'Συνδρομή',
        icon: 'credit-card',
        breadcrumb: ['Logistok', 'Συνδρομή'],
        title: 'Συνδρομή',
        permission: PERMISSIONS.COMPANY_MANAGE,
        section: 'system',
    },
    SETTINGS: {
        path: '/settings',
        label: 'Ρυθμίσεις',
        icon: 'settings',
        breadcrumb: ['Logistok', 'Ρυθμίσεις'],
        title: 'Ρυθμίσεις',
        section: 'system',
    },
    HELP: {
        path: '/help',
        label: 'Βοήθεια',
        icon: 'help',
        breadcrumb: ['Logistok', 'Βοήθεια'],
        title: 'Βοήθεια',
        section: 'system',
    },
};

// Helper για εύκολη πρόσβαση
export const getRoutesBySection = (section: RouteConfig['section']) => {
    return Object.values(ROUTES).filter(route => route.section === section);
};