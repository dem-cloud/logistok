import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ONBOARDING_STEPS, STEP_ROUTES } from "../onboarding/steps";
import { OnboardingStepKey, OnboardingStepNumber } from "../onboarding/types";
import { useAuth } from "@/context/AuthContext";

export default function RequireOnboarding() {
    const { activeCompany } = useAuth();
    const location = useLocation();

    if (!activeCompany) {
        return <Navigate to="/select-company" replace />;
    }

    // Μόνο ο owner μπορεί να δει το onboarding
    if(!activeCompany.onboarding.is_completed && !activeCompany.membership.is_owner){
        // κάποιος παγαπόντης
        // forceLogout()
        return <Navigate to="/auth" replace />;
    }

    // Αν έχει ολοκληρώσει το onboarding
    if (activeCompany.onboarding.is_completed) {
        return <Navigate to="/" replace />;
    }

    const currentStepNumber = (activeCompany.onboarding.current_step) as OnboardingStepNumber;
    const maxStepNumber = (activeCompany.onboarding.max_step_reached) as OnboardingStepNumber;
    const currentStepRoute = STEP_ROUTES[currentStepNumber];

    const urlStep = location.pathname.split("/")[2] as OnboardingStepKey; // /onboarding/:step

    const requestedStepNumber = ONBOARDING_STEPS[urlStep];

    if (!requestedStepNumber || requestedStepNumber > maxStepNumber) {
        return <Navigate to={`/onboarding/${currentStepRoute}`} replace />;
    }

    return <Outlet />;
}
