import { createContext, useState, useEffect, ReactNode, useContext, useRef, useCallback } from 'react';
import { axiosPublic } from '../api/axios';
import { getExp } from '../auth/getExp';
import { getToken, setToken } from '../auth/tokenStore';
import { registerLogout } from '../auth/logoutHandler';
import { useNavigate } from 'react-router-dom';
import { registerRefresh } from '../auth/refreshHandler';
import Toast from '../components/Toast';

// Define types for the user and context
interface User {
    email: string;
    first_name: string;
    last_name: string;
    needsOnboarding: boolean;
    onboardingStep: number | null;
}

interface RefreshResponse {
    access_token: string;
    user: User;
}

interface AuthContextType {
    user: User | null;
    setUser: React.Dispatch<React.SetStateAction<User | null>>;
    login: (token: string, user: User) => void;
    refresh: () => Promise<RefreshResponse>; // Επιστρέφει access token
    logout: () => Promise<void>; // Async function
    forceLogout: () => void; // Sync function
    loading: boolean;
    showToast: (data: ToastData) => void;
}

interface AuthProviderProps {
    children: ReactNode;
}

type ToastType = "success" | "error" | "info";

interface ToastData {
    message: string;
    type?: ToastType;
    duration?: number;
}

const REFRESH_MARGIN_SEC = Number(import.meta.env.VITE_REFRESH_MARGIN_SEC) || 60;

// Create the AuthContext
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: AuthProviderProps) {

    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const [toast, setToast] = useState<ToastData | null>(null);

    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    

    const showToast = ({ message, type = "info", duration = 3000 }: ToastData) => {
        setToast({ message, type });

        setTimeout(() => {
            setToast(null);
        }, duration);
    };

    // Κράτα τον χρήστη μέσα, μην λήξει το access token
    const schedule = () => {
        
        const token = getToken();
        if (!token) return;

        const exp = getExp(token);
        if (!exp) return;

        const now = Math.floor(Date.now() / 1000);
        const timeUntilExpiry = exp - now;
        const delay = timeUntilExpiry - REFRESH_MARGIN_SEC;
        
        // Ελάχιστο delay 5 δευτερόλεπτα
        const delayMs = Math.max(delay, 5) * 1000;

        // console.log(`Token expires in ${timeUntilExpiry}s, will refresh in ${delay}s`);

        if (timer.current) window.clearTimeout(timer.current);

        // console.log(`Schedule - Will refresh in ${delayMs}ms (${delayMs / 1000}s)`);

        timer.current = window.setTimeout(async () => {
            try {
                await refresh();
                schedule();
            } catch {
                forceLogout();
            }
        }, delayMs);
    };


    useEffect(() => {
        const initAuth = async () => {
            try {
                
                const { user } = await refresh();

                setUser(user);
                schedule();

            } catch {
                forceLogout();
            } finally {
                setLoading(false);
            }
        };

        initAuth();

        return () => {
            if (timer.current) {
                window.clearTimeout(timer.current);
                timer.current = null;
            }
        };
    }, []);

    const login = (token: string, userData: User) => {
        setToken(token);
        setUser(userData);
        schedule();
    };

    const refresh = useCallback(async () => {

        const response = await axiosPublic.post("/api/auth/refresh", {}, { withCredentials: true });
        const { success, message, data } = response.data;
        const { access_token, user } = data;

        if(!success || !access_token || !user){
            console.log(message)
            throw new Error("invalid_refresh_response");
        }

        setToken(access_token);

        return { access_token, user };
    }, []);

    // Graceful logout - Όταν ο χρήστης πατάει "Logout"
    const logout = async () => {

        try {

            await axiosPublic.post('/api/auth/logout', {}, { withCredentials: true });

        } catch (error) {
            console.error(error);
            // setResponseMessage
        } finally {
            if (timer.current) {
                window.clearTimeout(timer.current);
                timer.current = null;
            }

            setToken(null);
            setUser(null);
            navigate("/auth", { replace: true });
        }
    };

    // Force logout - Όταν αποτυγχάνει authentication (401, refresh failed)
    const forceLogout = useCallback(() => {
        // ΔΕΝ καλούμε logout API - το session ήδη έληξε
        if (timer.current) {
            window.clearTimeout(timer.current);
            timer.current = null;
        }

        // window.location.href = "/auth";
        setToken(null);
        setUser(null);
        
        // Αν ο χρήστης βρίσκεται ήδη σε /auth paths, μην κάνεις redirect
        if (!window.location.pathname.startsWith("/auth")) {
            navigate("/auth", { replace: true });
        }

    }, []);


    //--- Χρησιμοποιούνται για να ενημερώνουμε τους helpers ώστε να παίρνουμε τις μεταβλητές στο axios interceptor
    useEffect(() => {
        registerLogout(forceLogout); // Επιτρέπει στον axios interceptor να το καλέσει
    }, [forceLogout]);

    useEffect(() => {
        registerRefresh(refresh);
    }, [refresh]);
    //---

    return (
        <AuthContext.Provider value={{ user, setUser, login, refresh, logout, forceLogout, loading, showToast }}>
            {children}
            {toast && <Toast message={toast.message} type={toast.type ?? "info"} />}
        </AuthContext.Provider>
    );
}

// Custom Hook (Could be in auth/useAuth.ts)
export const useAuth = () => {

    const context = useContext(AuthContext);
    // Handle case where context is undefined
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    
    return context;
}