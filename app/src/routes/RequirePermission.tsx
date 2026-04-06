import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';

type RequirePermissionProps = {
    children: React.ReactNode;
    permission?: string;
    permissions?: string[];      // Any of these permissions
    ownerOnly?: boolean;
    redirectTo?: string;         // Default: '/'
    fallback?: React.ReactNode;  // Optional: show this instead of redirect
};

/**
 * Route guard component that checks permissions before rendering children.
 * 
 * Usage:
 * - Single permission: <RequirePermission permission="invoices.view">
 * - Multiple (any): <RequirePermission permissions={["sales.view", "sales.create"]}>
 * - Owner only: <RequirePermission ownerOnly>
 * - Combined: <RequirePermission permission="users.view" ownerOnly> (owner OR permission)
 */
export const RequirePermission: React.FC<RequirePermissionProps> = ({
    children,
    permission,
    permissions,
    ownerOnly = false,
    redirectTo = '/',
    fallback,
}) => {
    const { can, canAny, isOwner } = usePermissions();
    const location = useLocation();

    // Check access
    const hasAccess = (() => {
        // Owner always has access if ownerOnly is set
        if (ownerOnly && isOwner) {
            return true;
        }

        // If ownerOnly is set and user is not owner, deny (unless they have permission)
        if (ownerOnly && !permission && !permissions) {
            return false;
        }

        // Check single permission
        if (permission) {
            return can(permission) || isOwner;
        }

        // Check multiple permissions (any)
        if (permissions && permissions.length > 0) {
            return canAny(permissions) || isOwner;
        }

        // No restrictions specified
        return true;
    })();

    if (!hasAccess) {
        // Show fallback if provided
        if (fallback) {
            return <>{fallback}</>;
        }

        // Redirect to specified path, preserving the attempted location
        return <Navigate to={redirectTo} state={{ from: location }} replace />;
    }

    return <>{children}</>;
};

export default RequirePermission;