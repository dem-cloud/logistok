import React, { useMemo } from 'react';
import styles from './AppLayout.module.css';
import Sidebar, { NavItem } from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { getRoutesBySection, RouteConfig } from '@/config/routes.config';
import { useAuth } from '@/contexts/AuthContext';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { useLocation } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';

type AppLayoutProps = {
    children?: React.ReactNode;
};

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {

    const { activeCompany, activeStore, switchStore, user } = useAuth();
    // const { stores, selectedStore, selectStore } = useStores();
    const { can } = usePermissions();
    // const { activePlugins } = usePlugins();
    const { breadcrumb, title } = useBreadcrumb();
    const location = useLocation();

    // Helper για να φτιάξουμε NavItem από RouteConfig
    const toNavItem = (config: RouteConfig): NavItem => ({
        label: config.label,
        icon: config.icon,
        path: config.path,
        active: location.pathname === config.path || location.pathname.startsWith(config.path + '/'),
    });

    // Quick Menu
    const quickMenu = useMemo(
        () => getRoutesBySection('quick').map(toNavItem),
        [location.pathname]
    );

    // Core Operations (με permissions)
    const coreOperations = useMemo(
        () => getRoutesBySection('core')
            .filter(route => !route.permission || can(route.permission))
            .map(toNavItem),
        [location.pathname, can]
    );

    // Financial (με permissions)
    const financial = useMemo(
        () => getRoutesBySection('financial')
            .filter(route => !route.permission || can(route.permission))
            .map(toNavItem),
        [location.pathname, can]
    );

    // Management (conditional)
    const canManageCompany = can('company.manage') || activeCompany?.membership.is_owner;
    const management = useMemo(
        () => canManageCompany 
            ? getRoutesBySection('management').map(toNavItem)
            : [],
        [location.pathname, canManageCompany]
    );

    // System
    const system = useMemo(
        () => getRoutesBySection('system')
            .filter(route => !route.permission || can(route.permission))
            .map(toNavItem),
        [location.pathname, can]
    );

    // Plugin Menu Items (Dynamic)
    // const pluginMenuItems: NavItem[] = activePlugins
    //     .filter(plugin => plugin.settings?.showInSidebar)
    //     .map(plugin => ({
    //         label: plugin.name,
    //         icon: plugin.icon || 'puzzle',
    //         path: `/plugins/${plugin.key}`,
    //         badge: plugin.notificationCount || undefined,
    //         pluginKey: plugin.key,
    //         active: location.pathname.startsWith(`/plugins/${plugin.key}`)
    //     }));
    
    return (
        <div className={styles.app}>
            
            <Sidebar
                companyName={activeCompany?.name}
                // planName={activeCompany?.subscription?.plan?.name}
                stores={activeCompany?.stores || []}
                selectedStoreId={activeStore?.id}
                onStoreChange={switchStore}
                quickMenu={quickMenu}
                coreOperations={coreOperations}
                financial={financial}
                pluginMenuItems={[]}
                management={management}
                system={system}
                userInitials={user?.email?.[0].toLocaleUpperCase() || 'X'}
            />

            <div className={styles.shell}>
                <Topbar
                    breadcrumb={breadcrumb}
                    title={title}
                />
                <main className={styles.main}>
                    {children}
                </main>
            </div>
        </div>
    );
};

export default AppLayout;