import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import LoadingSpinner from "../components/LoadingSpinner";

export default function RequireLoggedOut() {
    const { user, loading } = useAuth();

    if (loading) {
        return <LoadingSpinner />;
    }

    // Αν είσαι logged-in, δεν μπορείς να δεις /auth pages
    if (user) return <Navigate to="/" replace />;

    return <Outlet />;
}
