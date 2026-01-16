import { Navigate, Outlet } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import { OnboardingStepNumber } from "../onboarding/types";
import { STEP_ROUTES } from "../onboarding/steps";
import { useAuth } from "@/contexts/AuthContext";

export default function RequireFinishedOnboarding() {
    const { activeCompany } = useAuth();

    if (!activeCompany) {
        return <Navigate to="/select-company" replace />;
    }

    if(!activeCompany.onboarding.is_completed && !activeCompany.membership.is_owner){
        // κάποιος παγαπόντης
        // forceLogout()
        return <Navigate to="/auth" replace />;
    }

    // Αν ο χρήστης είναι σε onboarding mode force onboarding
    if (!activeCompany.onboarding.is_completed) {
        const currentStepNumber = (activeCompany.onboarding.current_step) as OnboardingStepNumber;
        const currentStepRoute = STEP_ROUTES[currentStepNumber];
        return <Navigate to={`/onboarding/${currentStepRoute}`} replace />;
    }

    return (
        <AppLayout>
            <Outlet />
        </AppLayout>
    );
}
