// RequireSelectCompany.tsx
import { Navigate, Outlet } from "react-router-dom";
import { STEP_ROUTES } from "../onboarding/steps";
import { OnboardingStepNumber } from "../onboarding/types";
import { useAuth } from "@/contexts/AuthContext";
import { SelectCompanyLayout } from "@/layouts/SelectCompanyLayout";

export default function RequireSelectCompany() {
    const { activeCompany } = useAuth();

    // Αν έχει active company → δεν πρέπει να είναι εδώ
    if (activeCompany) {

        const onboarding = activeCompany.onboarding;
        const isOwner = activeCompany.membership.is_owner;

        if(!onboarding.is_completed && !isOwner){
            // κάποιος παγαπόντης
            // forceLogout()
            return <Navigate to="/auth" replace />;
        }

        if (!onboarding.is_completed) {
            const currentStepNumber = (activeCompany.onboarding.current_step) as OnboardingStepNumber;
            const currentStepRoute = STEP_ROUTES[currentStepNumber];
            return <Navigate to={`/onboarding/${currentStepRoute}`} replace />;
        }

        return <Navigate to="/" replace />;
    }

    // OK → επιτρέπουμε το CompanySelector
    return (
        <SelectCompanyLayout>
            <Outlet />
        </SelectCompanyLayout>
    );
}
