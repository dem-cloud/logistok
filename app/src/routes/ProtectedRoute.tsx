import { Navigate, Outlet } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '@/contexts/AuthContext';


export default function ProtectedRoute() {
    
    const { loading, token } = useAuth();

    // if (loading) {
    //     return <LoadingSpinner />;
    // }

    if (!token) {
        return <Navigate to="/auth" replace />;
    }

    return <Outlet />;
}
