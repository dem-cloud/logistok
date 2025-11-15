import { Navigate, Outlet } from 'react-router-dom';
import AppLayout from '../AppLayout';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute() {
    
    const { loading, user } = useAuth();

    if (loading) {
        return <LoadingSpinner />;
    }

    if (!user) {
        return <Navigate to="/auth" replace />;
    }

    return (
        <>
            <AppLayout />
            <Outlet />
        </>
    );
}
