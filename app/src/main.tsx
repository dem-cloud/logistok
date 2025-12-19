import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext'
import { BrowserRouter } from 'react-router-dom';
import { OnboardingProvider } from './onboarding/OnboardingContext.tsx'

createRoot(document.getElementById('root')!).render(
    // <StrictMode>
        <BrowserRouter>
            <AuthProvider>
                <OnboardingProvider>
                    <App />
                </OnboardingProvider>
            </AuthProvider>
        </BrowserRouter>
    // </StrictMode>,
)
