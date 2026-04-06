import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';

type RequirePlanFeatureProps = {
    children: React.ReactNode;
    feature: 'reports';
    redirectTo?: string;
};

/**
 * Route guard that requires plan feature (e.g. reports).
 * Redirects to subscription page when plan does not include the feature.
 */
export const RequirePlanFeature: React.FC<RequirePlanFeatureProps> = ({
    children,
    feature,
    redirectTo = '/settings/subscription',
}) => {
    const { hasReports } = usePlanFeatures();
    const location = useLocation();

    const hasAccess = feature === 'reports' ? hasReports : false;

    if (!hasAccess) {
        return <Navigate to={redirectTo} state={{ from: location }} replace />;
    }

    return <>{children}</>;
};

export default RequirePlanFeature;
