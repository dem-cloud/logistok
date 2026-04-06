import { ROUTES } from "@/config/routes.config";
import { useBreadcrumbContext } from "@/contexts/BreadcrumbContext";
import { useAuth } from "@/contexts/AuthContext";
import { useMemo } from "react";
import { useLocation } from "react-router-dom";

type BreadcrumbConfig = {
    breadcrumb: string[];
    title: string;
};

export const useBreadcrumb = (): BreadcrumbConfig => {
    const location = useLocation();
    const context = useBreadcrumbContext();
    const { activeCompany, activeStore } = useAuth();

    return useMemo(() => {
        // Settings are company-wide (no store in breadcrumb)
        const isCompanyScope = location.pathname.startsWith('/settings');

        // Dynamic prefix based on scope
        const dynamicPrefix = isCompanyScope
            ? [activeCompany?.name || 'Company']
            : [activeCompany?.name || 'Company', activeStore?.name || 'Store'];

        // 1. Context override (για dynamic pages)
        if (context?.breadcrumb && context.breadcrumb.length > 0) {
            return {
                breadcrumb: [...dynamicPrefix, ...context.breadcrumb],
                title: context.title,
            };
        }

        // 2. Exact match από ROUTES config
        const route = Object.values(ROUTES).find(r => r.path === location.pathname);
        if (route) {
            return {
                breadcrumb: [...dynamicPrefix, ...route.breadcrumbPath],
                title: route.title,
            };
        }

        // 3. Partial match για nested routes (π.χ. /products/123/edit)
        const pathSegments = location.pathname.split('/').filter(Boolean);
        if (pathSegments.length > 1) {
            const basePath = `/${pathSegments[0]}`;
            const baseRoute = Object.values(ROUTES).find(r => r.path === basePath);
            
            if (baseRoute) {
                return {
                    breadcrumb: [...dynamicPrefix, ...baseRoute.breadcrumbPath],
                    title: baseRoute.title,
                };
            }
        }

        // 4. Fallback
        return {
            breadcrumb: dynamicPrefix,
            title: activeCompany?.name || 'Πίνακας Ελέγχου',
        };
    }, [location.pathname, context?.breadcrumb, context?.title, activeCompany?.name, activeStore?.name]);
};