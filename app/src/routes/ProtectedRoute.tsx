import { Navigate, Outlet } from 'react-router-dom';
import AppLayout from '../AppLayout';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute() {
    
    const { user, loading } = useAuth();

    // if (loading) return <p>Loading...</p>;
    if (loading) {
        return <LoadingSpinner />;
    }
    
    // If no user redirect to the login page
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
