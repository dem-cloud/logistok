import { createContext, useState, useEffect, ReactNode, useContext, useRef, useCallback } from 'react';
import { axiosPublic } from '../api/axios';
import { getExp } from '../auth/getExp';
import { getToken, setToken } from '../auth/tokenStore';
import { registerLogout } from '../auth/logoutHandler';
import { useNavigate } from 'react-router-dom';
import { getFingerprint } from '../auth/getFingerprint';
import { registerRefresh } from '../auth/refreshHandler';

// Define types for the user and context
interface User {
    email: string;
    first_name: string;
    last_name: string;
}

interface AuthContextType {
    user: User | null;
    setUser: React.Dispatch<React.SetStateAction<User | null>>;
    login: (token: string, user: User) => void;
    refresh: () => Promise<void>;
    forceLogout: () => void;
}

interface AuthProviderProps {
    children: ReactNode;
}

const REFRESH_MARGIN_SEC = import.meta.env.REFRESH_MARGIN_SEC;

// Create the AuthContext
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<User | null>(null);
    const navigate = useNavigate();

    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Κράτα τον χρήστη μέσα, μην λήξει το access token
    const schedule = () => {
        const token = getToken();
        if (!token) return;

        const exp = getExp(token);
        if (!exp) return;

        const now = Math.floor(Date.now() / 1000);
        const delayMs = Math.max(exp - now - REFRESH_MARGIN_SEC, 5) * 1000;

        if (timer.current) window.clearTimeout(timer.current);

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
        const token = getToken();
        if (token) schedule();

        return () => {
            if (timer.current) {
                window.clearTimeout(timer.current);
                timer.current = null;
            }
        }
    }, [])

    const login = (token: string, userData: User) => {
        setToken(token);
        setUser(userData);
        schedule();
    };

    const refresh = useCallback(async () => {

        const fingerprint = await getFingerprint();

        const response = await axiosPublic.post("/api/auth/refresh", { fingerprint }, { withCredentials: true });
        const { success, message, data } = response.data;
        const { access_token } = data;

        if(!success || !access_token){
            console.log(message)
            throw new Error("invalid_refresh_response");
        }

        setToken(access_token);

        return access_token;
    }, []);


    const logout = async () => {

        try {
            const fingerprint = await getFingerprint();

            const response = await axiosPublic.post('/api/auth/logout', { fingerprint }, { withCredentials: true });
            const { } = response.data;
            
            // console.log(message)
        } catch (error) {
            console.error(error);
        } finally {
            if (timer.current) {
                window.clearTimeout(timer.current);
                timer.current = null;
            }

            setToken(null);
            setUser(null);
        }
    };

    const forceLogout = useCallback(() => {
        logout();
        // window.location.href = "/auth";
        navigate("/auth", { replace: true });
    }, [logout]);


    //--- Χρησιμοποιούνται για να ενημερώνουμε τους helpers ώστε να παίρνουμε τις μεταβλητές στο axios interceptor
    useEffect(() => {
        registerLogout(forceLogout); // Επιτρέπει στον axios interceptor να το καλέσει
    }, [forceLogout]);

    useEffect(() => {
        registerRefresh(refresh);
    }, [refresh]);
    //---

    return (
        <AuthContext.Provider value={{ user, setUser, login, refresh, forceLogout }}>
            {children}
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