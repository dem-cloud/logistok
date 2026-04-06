import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';


export default function ProtectedRoute() {
    
    const { token, user } = useAuth();

    // if (loading) {
    //     return <LoadingSpinner />;
    // }

    if (!token || !user) {
        return <Navigate to="/auth" replace />;
    }

    return <Outlet />;
}
