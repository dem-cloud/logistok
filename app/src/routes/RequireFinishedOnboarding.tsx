import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RequireFinishedOnboarding() {
    const { user } = useAuth();

    // Αν ο χρήστης είναι σε onboarding mode force onboarding

    // if (user && user.needsOnboarding) {
        return <Navigate to="/onboarding" replace />;
    // }

    return <Outlet />;
}
