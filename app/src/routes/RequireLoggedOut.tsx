import { Navigate, Outlet } from "react-router-dom";
import LoadingSpinner from "../components/LoadingSpinner";
import { useAuth } from "@/context/AuthContext";

export default function RequireLoggedOut() {
    const { user, loading } = useAuth();

    if (loading) {
        return <LoadingSpinner />;
    }

    // Αν είσαι logged-in, δεν μπορείς να δεις /auth pages
    if (user) return <Navigate to="/" replace />;

    return <Outlet />;
}
