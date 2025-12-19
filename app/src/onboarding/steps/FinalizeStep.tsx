import { Navigate } from "react-router-dom";
import { useOnboarding } from "../OnboardingContext"
import FreeFinalize from "./FreeFinalize";
import PaymentCheckout from "./PaymentCheckout";


export default function FinalizeStep() {

    const { onboardingMeta } = useOnboarding();

    if (onboardingMeta?.is_free_plan === true) {
        return <FreeFinalize />;
    }

    if (onboardingMeta?.is_free_plan === false) {
        return <PaymentCheckout />;
    }

    // ακόμα δεν έχει επιλεγεί plan
    return <Navigate to={`/onboarding/plan`} replace />;
}
