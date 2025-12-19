import { Navigate } from "react-router-dom";
import { OnboardingStepNumber } from "../onboarding/types";
import { STEP_ROUTES } from "../onboarding/steps";
import { useAuth } from "@/context/AuthContext";


export default function ProtectedCatchAll() {
    const { activeCompany } = useAuth();

    if (!activeCompany) {
        return <Navigate to="/select-company" replace />;
    }

    if(!activeCompany.onboarding.is_completed && !activeCompany.membership.is_owner){
        // κάποιος παγαπόντης
        // forceLogout()
        return <Navigate to="/auth" replace />;
    }

    // Αν έχει ολοκληρώσει το onboarding
    if (activeCompany.onboarding.is_completed) {
        return <Navigate to="/" replace />;
    }

    if (!activeCompany.onboarding.is_completed) {
        const currentStepNumber = (activeCompany.onboarding.current_step) as OnboardingStepNumber;
        const currentStepRoute = STEP_ROUTES[currentStepNumber];
        return <Navigate to={`/onboarding/${currentStepRoute}`} replace />;
    }

    return <Navigate to="/auth" replace />;
}
