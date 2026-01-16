// import reactLogo from './assets/react.svg'
// import viteLogo from '/vite.svg'
import './App.css'
import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './routes/ProtectedRoute'
import Dashboard from './pages/protected/Dashboard'
import Auth from './pages/Auth'
import ResetPassword from './pages/ResetPassword'
import RequireLoggedOut from './routes/RequireLoggedOut'
import RequireOnboarding from './routes/RequireOnboarding'
import RequireFinishedOnboarding from './routes/RequireFinishedOnboarding'
import ProtectedCatchAll from './routes/ProtectedCatchAll'
import CompanySelector from './pages/protected/CompanySelector'
import InviteSetPassword from './pages/InviteSetPassword'
import RequireSelectCompany from './routes/RequireSelectCompany'
import LoadingSpinner from './components/LoadingSpinner'
import { useAuth } from './contexts/AuthContext'
import { OnboardingLayout } from './onboarding/OnboardingLayout'

export default function App() {

    const { loading } = useAuth()

    if (loading) {
        return <LoadingSpinner />
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

            <Route path="/invite/:token" element={<InviteSetPassword />} />

            {/* PROTECTED ROUTES - APP */}
            <Route element={<ProtectedRoute />}>

                <Route element={<RequireSelectCompany />}>
                    <Route path="/select-company" element={<CompanySelector />} />
                </Route>

                {/* ROUTES ΓΙΑ ΧΡΗΣΤΕΣ ΠΟΥ ΕΙΝΑΙ ΣΕ ONBOARDING */}
                <Route element={<RequireOnboarding />}>
                    <Route path="/onboarding/:step" element={<OnboardingLayout />} />
                </Route>

                {/* ROUTES ΓΙΑ ΧΡΗΣΤΕΣ ΠΟΥ ΕΧΟΥΝ ΟΛΟΚΛΗΡΩΣΕΙ ΤΟ ONBOARDING */}
                <Route element={<RequireFinishedOnboarding />}>
                    <Route path="/" element={<Dashboard />} />
                    {/* άλλα protected routes εδώ */}
                </Route>

                {/* LOGGED-IN catch-all (smart) */}
                <Route path="*" element={<ProtectedCatchAll />} />
            </Route>

            {/* Catch-all για NOT logged-in χρήστες -> redirect στο "/auth" */}
            <Route path="*" element={<Navigate to="/auth" replace />} />
        </Routes>
    )
}
