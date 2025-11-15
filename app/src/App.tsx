// import reactLogo from './assets/react.svg'
// import viteLogo from '/vite.svg'
import './App.css'
import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './routes/ProtectedRoute'
import Dashboard from './pages/protected/Dashboard'
import Auth from './pages/Auth'
import { useAuth } from './context/AuthContext'
import ResetPassword from './pages/ResetPassword'
import RequireLoggedOut from './routes/RequireLoggedOut'

export default function App() {

    const { loading } = useAuth()

    if (loading) {
        return <div>Loading...</div> // μπορείς να βάλεις skeleton
    }

    return (
        <Routes>
            {/* AUTH ROUTES (μόνο για logged-out users) */}
            <Route element={<RequireLoggedOut />}>
                <Route path="/auth">
                    {/* Log In | Sign Up */}
                    <Route index element={<Auth />} />
                    <Route path="reset-password" element={<ResetPassword />} />
                </Route>
            </Route>

            {/* PROTECTED ROUTES - APP */}
            <Route element={<ProtectedRoute />}>
                <Route path="/" element={<Dashboard />} />
                {/* Catch-all για logged-in χρήστες -> redirect στο "/" */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Route>

            {/* Catch-all για NOT logged-in χρήστες -> redirect στο "/auth" */}
            <Route path="*" element={<Navigate to="/auth" replace />} />
        </Routes>
    )
}
