import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AppLayout from "../AppLayout";

export default function RequireFinishedOnboarding() {
    const { user } = useAuth();

    // Αν δεν υπάρχει user -> redirect σε login
    if (!user) {
        return <Navigate to="/auth" replace />;
    }

    // Αν ο χρήστης είναι σε onboarding mode force onboarding
    if (user.needsOnboarding) {
        return <Navigate to={`/onboarding/${user.onboardingStep}`} replace />;
    }

    return (
        <>
            <AppLayout />
            <Outlet />
        </>
    );
}
