import { Outlet } from 'react-router-dom';
import AppLayout from '../AppLayout';
import useAuth from '../auth/useAuth';

export default function ProtectedRoute() {
    
    const { user, loading } = useAuth();

    if (loading) return <p>Loading...</p>;
    
    // If no user redirect to the login page
    if (!user) {
        // window.location.href = "http://localhost:3000/login";
        return null;
    }

    return (
        <>
            <AppLayout />
            <Outlet />
        </>
    );
}
