import { useAuth } from '@/contexts/AuthContext';
import { hasWildcardPermission, Permission } from '@/constants/permissions';
import { useMemo } from 'react';

type UsePermissionsReturn = {
    permissions: string[];
    can: (permission: Permission | string) => boolean;
    canAny: (permissions: Permission[] | string[]) => boolean;
    canAll: (permissions: Permission[] | string[]) => boolean;
    isOwner: boolean;
    isAdmin: boolean;
};

export const usePermissions = (): UsePermissionsReturn => {
    const { activeCompany, activeStore } = useAuth();

    const permissions = useMemo(() => {
        if (!activeCompany) return [];
        
        if (activeCompany.membership.is_owner) {
            return ['*'];
        }

        // Priority 1: Store-specific permissions
        if (activeStore?.permissions) {
            return activeStore.permissions;
        }

        // Priority 2: Company-level permissions (fallback)
        if (activeCompany.membership.permissions) {
            return activeCompany.membership.permissions;
        }

        return [];
    }, [activeCompany, activeStore]);

    // Check single permission
    const can = (permission: Permission | string): boolean => {
        if (!activeCompany || !activeStore) return false;
        
        // Owners can do everything
        if (activeCompany.membership.is_owner) return true;
        
        // Check exact match
        if (permissions.includes(permission)) return true;
        
        // Check wildcard (π.χ. "sales.*" includes "sales.view")
        return hasWildcardPermission(permissions, permission);
    };

    // Check if user has ANY of the permissions
    const canAny = (perms: Permission[] | string[]): boolean => {
        return perms.some(p => can(p));
    };

    // Check if user has ALL of the permissions
    const canAll = (perms: Permission[] | string[]): boolean => {
        return perms.every(p => can(p));
    };

    const isOwner = activeCompany?.membership.is_owner || false;
    const isAdmin = can('company.manage'); // Based on activeStore permissions

    return {
        permissions,
        can,
        canAny,
        canAll,
        isOwner,
        isAdmin,
    };
};