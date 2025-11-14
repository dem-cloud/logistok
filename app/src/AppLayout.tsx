import { useAuth } from './context/AuthContext';

export default function AppLayout() {
    const { user } = useAuth();

    return (
        <div>
            AppLayout
            <h1>Welcome, {user?.first_name || user?.email}!</h1>
            {/* <p>Your role: {user.role}</p> */}
            <p>Email: {user?.email}</p>
        </div>
    );
}
