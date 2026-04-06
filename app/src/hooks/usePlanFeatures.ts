import { useAuth } from '@/contexts/AuthContext';

export function usePlanFeatures() {
    const { activeCompany } = useAuth();
    const plan = activeCompany?.subscription?.plan;
    const planKey = plan?.key ?? null;
    const features = plan?.features ?? null;
    const includedBranches = plan?.included_branches ?? 0;
    const maxUsers = plan?.max_users ?? null;

    const isBasic = planKey === 'basic';
    const hasReports = features?.reports === true;
    const pluginsAllowed = features?.plugins_allowed ?? [];
    const hasPlugins = Array.isArray(pluginsAllowed) && pluginsAllowed.length > 0 && pluginsAllowed[0] !== '';

    return {
        planKey,
        features,
        includedBranches,
        maxUsers,
        isBasic,
        hasReports,
        pluginsAllowed,
        hasPlugins,
    };
}

export default usePlanFeatures;
