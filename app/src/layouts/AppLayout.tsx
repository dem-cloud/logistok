import React, { useMemo } from 'react';
import styles from './AppLayout.module.css';
import Sidebar, { NavItem } from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { getRoutesBySection, RouteConfig } from '@/config/routes.config';
import { useAuth } from '@/contexts/AuthContext';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useLocation } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';
import LoadingSpinner from '@/components/LoadingSpinner';

type AppLayoutProps = {
    children?: React.ReactNode;
};

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
    const { activeCompany, activeStore, switchStore, clearActiveCompany, user, logout } = useAuth();
    const { can, isOwner } = usePermissions();
    const { isBasic } = usePlanFeatures();
    const { breadcrumb, title } = useBreadcrumb();
    const { notifications, markAsRead, markAllAsRead, clearNotification, toastNotification, dismissToast, unreadCount } = useNotifications();
    const location = useLocation();

    // Check if user can manage company (for invite users in popup)
    // Hide invite when Basic plan (max 1 user, always at limit)
    const canManageCompany = (can('company.manage') || isOwner) && !isBasic;

    // Quick Menu (με unreadCount για badge)
    const quickMenu = useMemo(
        () => getRoutesBySection('quick').map((config): NavItem => ({
            label: config.label,
            icon: config.icon,
            path: config.path,
            active: location.pathname === config.path || location.pathname.startsWith(config.path + '/'),
            badge: config.path === '/notifications' && unreadCount > 0 ? unreadCount : undefined,
        })),
        [location.pathname, unreadCount]
    );

    // Helper για να φτιάξουμε NavItem από RouteConfig για τα υπόλοιπα sections (χωρίς badge)
    const toNavItem = (config: RouteConfig): NavItem => ({
        label: config.label,
        icon: config.icon,
        path: config.path,
        active: location.pathname === config.path || location.pathname.startsWith(config.path + '/'),
    });

    // Core Operations (με permissions)
    const coreOperations = useMemo(
        () => getRoutesBySection('core')
            .filter(route => !route.permission || can(route.permission))
            .map(toNavItem),
        [location.pathname, can]
    );

    // Catalog (Προϊόντα, Πελάτες, Προμηθευτές)
    const catalog = useMemo(
        () => getRoutesBySection('catalog')
            .filter(route => !route.permission || can(route.permission))
            .map(toNavItem),
        [location.pathname, can]
    );

    // Financial (με permissions - Αναφορές για όποιον έχει REPORTS_VIEW, κάθε πλάνο έχει reports)
    const financial = useMemo(
        () => getRoutesBySection('financial')
            .filter(route => !route.permission || can(route.permission))
            .map(toNavItem),
        [location.pathname, can]
    );

    // System (Support)
    const system = useMemo(
        () => getRoutesBySection('system')
            .filter(route => !route.permission || can(route.permission))
            .map(toNavItem),
        [location.pathname, can]
    );

    // Plugin Menu Items - hidden for Basic plan (hasPlugins false)

    // TypeScript safety check (δεν θα πρέπει ποτέ να συμβεί λόγω ProtectedRoute & RequireFinishedOnboarding)
    if (!user || !activeCompany || !activeStore) {
        return <LoadingSpinner />;
    }
    
    return (
        <div className={styles.app}>
            <Sidebar
                companyName={activeCompany.name}
                planName={activeCompany.subscription?.plan.name}
                stores={activeCompany.stores}
                selectedStore={activeStore}
                onStoreChange={switchStore}
                quickMenu={quickMenu}
                coreOperations={coreOperations}
                catalog={catalog}
                financial={financial}
                pluginMenuItems={[]}
                system={system}
                user={user}
                showInviteUsers={canManageCompany}
                onLogout={logout}
                isOwner={isOwner}
                clearActiveCompany={clearActiveCompany}
            />

            <div className={styles.shell}>
                <Topbar
                    breadcrumb={breadcrumb}
                    title={title}

                    notifications={notifications}
                    onMarkAsRead={markAsRead}
                    onMarkAllAsRead={markAllAsRead}
                    onClearNotification={clearNotification}

                    toastNotification={toastNotification}
                    onDismissToast={dismissToast}

                />
                <main className={styles.main}>
                    {children}
                </main>
            </div>
        </div>
    );
};

export default AppLayout;