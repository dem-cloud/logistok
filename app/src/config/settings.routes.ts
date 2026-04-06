import { ROUTES } from "./routes.config";
import { PERMISSIONS } from "@/constants/permissions";

// Extra settings-specific configuration (description, tabs)
// Base route data (including permissions) comes from routes.config.ts

export type SettingsTabConfig = {
    key: string;
    path: string;
    label: string;
    /** Permission required to see this tab (e.g. users.invite). Owner always has access. */
    permission?: string;
};

export type SettingsCardConfig = {
    key: string;
    path: string;
    label: string;
    description: string;
    icon: string;
    permission?: string;
    ownerOnly?: boolean;
    tabs?: SettingsTabConfig[];
};

export const SETTINGS_CARDS: SettingsCardConfig[] = [
    // ============================================
    // Ο ΛΟΓΑΡΙΑΣΜΟΣ ΜΟΥ - Everyone can access
    // ============================================
    {
        key: 'SETTINGS_ACCOUNT',
        path: ROUTES.SETTINGS_ACCOUNT.path,
        label: 'Ο Λογαριασμός μου',
        description: 'Προφίλ, ασφάλεια, προτιμήσεις ειδοποιήσεων',
        icon: ROUTES.SETTINGS_ACCOUNT.icon,
        permission: ROUTES.SETTINGS_ACCOUNT.permission,
        ownerOnly: ROUTES.SETTINGS_ACCOUNT.ownerOnly,
        tabs: [
            { key: 'SETTINGS_ACCOUNT', path: ROUTES.SETTINGS_ACCOUNT.path, label: 'Προφίλ' },
            { key: 'SETTINGS_ACCOUNT_SECURITY', path: ROUTES.SETTINGS_ACCOUNT_SECURITY.path, label: 'Ασφάλεια' },
            { key: 'SETTINGS_ACCOUNT_NOTIFICATIONS', path: ROUTES.SETTINGS_ACCOUNT_NOTIFICATIONS.path, label: 'Ειδοποιήσεις' },
        ],
    },

    // ============================================
    // ΕΤΑΙΡΕΙΑ
    // ============================================
    {
        key: 'SETTINGS_COMPANY',
        path: ROUTES.SETTINGS_COMPANY.path,
        label: ROUTES.SETTINGS_COMPANY.label,
        description: 'Στοιχεία επιχείρησης, branding, νομικά στοιχεία',
        icon: ROUTES.SETTINGS_COMPANY.icon,
        permission: ROUTES.SETTINGS_COMPANY.permission,
        ownerOnly: ROUTES.SETTINGS_COMPANY.ownerOnly,
        tabs: [
            { key: 'SETTINGS_COMPANY', path: ROUTES.SETTINGS_COMPANY.path, label: 'Γενικά' },
            { key: 'SETTINGS_COMPANY_BRANDING', path: ROUTES.SETTINGS_COMPANY_BRANDING.path, label: ROUTES.SETTINGS_COMPANY_BRANDING.label },
            { key: 'SETTINGS_COMPANY_LEGAL', path: ROUTES.SETTINGS_COMPANY_LEGAL.path, label: ROUTES.SETTINGS_COMPANY_LEGAL.label },
        ],
    },

    // ============================================
    // ΟΜΑΔΑ
    // ============================================
    {
        key: 'SETTINGS_TEAM',
        path: ROUTES.SETTINGS_TEAM.path,
        label: ROUTES.SETTINGS_TEAM.label,
        description: 'Μέλη ομάδας, προσκλήσεις, διαχείριση χρηστών',
        icon: ROUTES.SETTINGS_TEAM.icon,
        permission: ROUTES.SETTINGS_TEAM.permission,
        ownerOnly: ROUTES.SETTINGS_TEAM.ownerOnly,
        tabs: [
            { key: 'SETTINGS_TEAM', path: ROUTES.SETTINGS_TEAM.path, label: 'Μέλη' },
            { key: 'SETTINGS_TEAM_INVITES', path: ROUTES.SETTINGS_TEAM_INVITES.path, label: ROUTES.SETTINGS_TEAM_INVITES.label, permission: PERMISSIONS.USERS_INVITE },
        ],
    },

    // ============================================
    // ΡΟΛΟΙ & ΔΙΚΑΙΩΜΑΤΑ
    // ============================================
    {
        key: 'SETTINGS_ROLES',
        path: ROUTES.SETTINGS_ROLES.path,
        label: ROUTES.SETTINGS_ROLES.label,
        description: 'Διαχείριση ρόλων και δικαιωμάτων πρόσβασης',
        icon: ROUTES.SETTINGS_ROLES.icon,
        permission: ROUTES.SETTINGS_ROLES.permission,
        ownerOnly: ROUTES.SETTINGS_ROLES.ownerOnly,
    },

    // ============================================
    // ΚΑΤΑΣΤΗΜΑΤΑ
    // ============================================
    {
        key: 'SETTINGS_STORES',
        path: ROUTES.SETTINGS_STORES.path,
        label: ROUTES.SETTINGS_STORES.label,
        description: 'Διαχείριση καταστημάτων και αποθηκών',
        icon: ROUTES.SETTINGS_STORES.icon,
        permission: ROUTES.SETTINGS_STORES.permission,
        ownerOnly: ROUTES.SETTINGS_STORES.ownerOnly,
    },

    // ============================================
    // ΣΥΝΔΡΟΜΗ
    // ============================================
    {
        key: 'SETTINGS_SUBSCRIPTION',
        path: ROUTES.SETTINGS_SUBSCRIPTION.path,
        label: ROUTES.SETTINGS_SUBSCRIPTION.label,
        description: 'Πλάνο συνδρομής, τιμολόγηση, ιστορικό πληρωμών',
        icon: ROUTES.SETTINGS_SUBSCRIPTION.icon,
        permission: ROUTES.SETTINGS_SUBSCRIPTION.permission,
        ownerOnly: ROUTES.SETTINGS_SUBSCRIPTION.ownerOnly,
        tabs: [
            { key: 'SETTINGS_SUBSCRIPTION', path: ROUTES.SETTINGS_SUBSCRIPTION.path, label: 'Πλάνο' },
            { key: 'SETTINGS_SUBSCRIPTION_BILLING', path: ROUTES.SETTINGS_SUBSCRIPTION_BILLING.path, label: ROUTES.SETTINGS_SUBSCRIPTION_BILLING.label },
            { key: 'SETTINGS_SUBSCRIPTION_INVOICES', path: ROUTES.SETTINGS_SUBSCRIPTION_INVOICES.path, label: 'Ιστορικό' },
        ],
    },
];

// Helper για να πάρουμε τα cards με permission check
export const getSettingsCards = (
    can: (permission: string) => boolean, 
    isOwner: boolean
): SettingsCardConfig[] => {
    return SETTINGS_CARDS.filter(card => {
        // Owner-only cards
        if (card.ownerOnly) {
            return isOwner;
        }
        
        // Permission-based cards
        if (card.permission) {
            return can(card.permission) || isOwner;
        }
        
        // No restriction (e.g., My Account)
        return true;
    });
};

// Helper για να βρούμε card config από path
export const getSettingsCardByPath = (path: string): SettingsCardConfig | undefined => {
    return SETTINGS_CARDS.find(card => 
        path === card.path || path.startsWith(card.path + '/')
    );
};