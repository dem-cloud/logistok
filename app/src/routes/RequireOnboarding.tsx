import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RequireOnboarding() {
    const { user } = useAuth();

    // Αν ο χρήστης *δεν* είναι σε onboarding mode πήγαινε dashboard
    
    // if (user && !user.needsOnboarding) {
        return <Navigate to="/" replace />;
    // }

    return <Outlet />;
}
