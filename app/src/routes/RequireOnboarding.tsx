import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RequireOnboarding() {
    const { user } = useAuth();
    const location = useLocation();

    // Αν δεν υπάρχει user -> redirect σε login
    if (!user) {
        return <Navigate to="/auth" replace />;
    }

    // Αν έχει ολοκληρώσει το onboarding -> δεν πρέπει να είναι εδώ
    if (!user.needsOnboarding || !user.onboardingStep) {
        return <Navigate to="/" replace />;
    }

    const step = Number(location.pathname.split("/").pop());
    const allowedStep = user.onboardingStep; // Μέγιστο επιτρεπόμενο

    // Αν /onboarding -> πήγαινε στο *μεγιστο* επιτρεπόμενο
    if (location.pathname === "/onboarding") {
        return <Navigate to={`/onboarding/${allowedStep}`} replace />;
    }

    // Αν ο χρήστης ζητάει βήμα μεγαλύτερο από αυτό που έχει φτάσει -> μπλοκ
    if (step > allowedStep) {
        return <Navigate to={`/onboarding/${allowedStep}`} replace />;
    }

    return <Outlet />;
}
