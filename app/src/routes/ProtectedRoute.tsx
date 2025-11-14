import { Outlet } from 'react-router-dom';
import AppLayout from '../AppLayout';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAutoLogin } from '../hooks/useAutoLogin';

export default function ProtectedRoute() {
    
    const { loading } = useAutoLogin();

    if (loading) {
        return <LoadingSpinner />;
    }

    return (
        <>
            <AppLayout />
            <Outlet />
        </>
    );
}
