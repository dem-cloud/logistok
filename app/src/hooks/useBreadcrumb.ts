import { ROUTES } from "@/config/routes.config";
import { useBreadcrumbContext } from "@/contexts/BreadcrumbContext";
import { useMemo } from "react";
import { useLocation } from "react-router-dom";

type BreadcrumbConfig = {
    breadcrumb: string[];
    title: string;
};

export const useBreadcrumb = (): BreadcrumbConfig => {
    const location = useLocation();
    const context = useBreadcrumbContext();

    return useMemo(() => {
        // 1. Context override (για dynamic pages)
        if (context?.breadcrumb && context.breadcrumb.length > 0) {
            return {
                breadcrumb: context.breadcrumb,
                title: context.title,
            };
        }

        // 2. Exact match από ROUTES config
        const route = Object.values(ROUTES).find(r => r.path === location.pathname);
        if (route) {
            return {
                breadcrumb: route.breadcrumb,
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
                    breadcrumb: baseRoute.breadcrumb,
                    title: baseRoute.title,
                };
            }
        }

        // 4. Fallback
        return {
            breadcrumb: ['Logistok'],
            title: 'Logistok',
        };
    }, [location.pathname, context?.breadcrumb, context?.title]);
};