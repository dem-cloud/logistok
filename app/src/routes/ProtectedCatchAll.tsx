import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";


export default function ProtectedCatchAll() {
    const { user } = useAuth();

    if (!user) return <Navigate to="/auth" replace />;

    if (user.needsOnboarding) {
        return <Navigate to={`/onboarding/${user.onboardingStep}`} replace />;
    }

    return <Navigate to="/" replace />;
}
