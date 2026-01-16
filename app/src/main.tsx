import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import { BrowserRouter } from 'react-router-dom';
import { OnboardingProvider } from './onboarding/OnboardingContext.tsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BreadcrumbProvider } from './contexts/BreadcrumbContext.tsx'

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
    // <StrictMode>
    <QueryClientProvider client={queryClient}>
        <BrowserRouter>
            <AuthProvider>
                <BreadcrumbProvider>
                    <OnboardingProvider>
                        <App />
                    </OnboardingProvider>
                </BreadcrumbProvider>
            </AuthProvider>
        </BrowserRouter>
    </QueryClientProvider>
    // </StrictMode>,
)
