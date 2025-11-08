// import reactLogo from './assets/react.svg'
// import viteLogo from '/vite.svg'
import './App.css'
import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './routes/ProtectedRoute'
import Dashboard from './pages/protected/Dashboard'
import Auth from './pages/Auth'
import { useAutoLogin } from './hooks/useAutoLogin'

export default function App() {

    const { loading } = useAutoLogin()

    if (loading) {
        return <div>Loading...</div> // μπορείς να βάλεις skeleton
    }

    return (
        <Routes>
            {/* Log In | Sign Up */}
            <Route path="/auth" element={<Auth />} />

            {/* APP */}
            <Route element={<ProtectedRoute />}>
                <Route path="/" element={<Dashboard />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    )
}
