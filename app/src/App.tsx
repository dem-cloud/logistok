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
import Onboarding from './pages/protected/Onboarding'
import RequireOnboarding from './routes/RequireOnboarding'
import RequireFinishedOnboarding from './routes/RequireFinishedOnboarding'

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

                {/* ROUTES ΓΙΑ ΧΡΗΣΤΕΣ ΠΟΥ ΕΙΝΑΙ ΣΕ ONBOARDING */}
                <Route element={<RequireOnboarding />}>
                    <Route path="/onboarding" element={<Onboarding />} />
                </Route>

                {/* ROUTES ΓΙΑ ΧΡΗΣΤΕΣ ΠΟΥ ΕΧΟΥΝ ΟΛΟΚΛΗΡΩΣΕΙ ΤΟ ONBOARDING */}
                <Route element={<RequireFinishedOnboarding />}>
                    <Route path="/" element={<Dashboard />} />
                    {/* άλλα protected routes εδώ */}
                </Route>

                {/* Catch-all για logged-in χρήστες -> redirect στο "/" */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Route>

            {/* Catch-all για NOT logged-in χρήστες -> redirect στο "/auth" */}
            <Route path="*" element={<Navigate to="/auth" replace />} />
        </Routes>
    )
}
