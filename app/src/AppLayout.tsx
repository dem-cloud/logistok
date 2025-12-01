import { useAuth } from './context/AuthContext';

export default function AppLayout() {
    const { user, logout } = useAuth();

    return (
        <div>
            AppLayout
            <h1>Welcome, {user?.email}!</h1>
            {/* <p>Your role: {user.role}</p> */}
            <p>Email: {user?.email}</p>

            <button onClick={logout}>Αποσύνδεση</button>
        </div>
    );
}
