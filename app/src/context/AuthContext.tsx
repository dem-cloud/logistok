import { AxiosResponse } from 'axios';
import React, { createContext, useState, useEffect, ReactNode, useContext, useRef } from 'react';
import { axiosPrivate } from '../api/axios';
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import { getExp } from '../auth/getExp';
import { getToken, setToken } from '../auth/tokenStore';

// Define types for the user and context
interface User {
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    accessTokenExpiration: number;
    industry: string;
    setupStep: number | null;
}

interface RefreshResponse {
    success: boolean;
    userInfo: {
        email: string;
        firstName: string;
        lastName: string;
        role: string;
    };
    accessTokenExpiration: number;
    industry: string;
    setupStep: number | null;
}

interface LogOutResponse {
    message: string;
}

interface AuthContextType {
    user: User | null;
    setUser: React.Dispatch<React.SetStateAction<User | null>>;
    loading: boolean;
    login: (token: string, user: User) => void;
    refresh: () => Promise<void>;
    logout: () => Promise<void>;
}

interface AuthProviderProps {
    children: ReactNode;
}

interface User {
  id: number;
  name: string;
  email: string;
  // add whatever fields your user has
};

const REFRESH_MARGIN_SEC = 60;


// Create the AuthContext
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Κράτα τον χρήστη μέσα, μην λήξει το access token
    const schedule = () => {
        const t = getToken();
        if (!t) return;

        const exp = getExp(t);
        if (!exp) return;

        const now = Math.floor(Date.now() / 1000);
        const delayMs = Math.max(exp - now - REFRESH_MARGIN_SEC, 5) * 1000;

        if (timer.current) window.clearTimeout(timer.current);

        timer.current = window.setTimeout(async () => {
            try {
                await refresh();
                schedule();
            } catch {
                setToken(null);
                setUser(null);
            }
        }, delayMs);
    };


    useEffect(() => {
        const t = getToken();
        if (t) schedule();
        
        setLoading(false);

        return () => {
            if (timer.current) window.clearTimeout(timer.current);
        }
    }, [])

    async function getFingerprint() {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        return result.visitorId; // Unique fingerprint
    }

    const login = (token: string, userData: User) => {
        setToken(token);
        setUser(userData);
        schedule();
    };

    const refresh = async () => {

        const fingerprint = await getFingerprint();

        const response = await axiosPrivate.post("/api/auth/refresh", {fingerprint});
        const data = response.data;

        const { access_token, user } = data;

        if (!access_token || !user) throw new Error("invalid_refresh_response");

        // ενημέρωσε το state όπως στο login
        setToken(access_token);
        setUser(user);

        return access_token;
    };



    // const refresh = async () => {

    //     try {
    //         const fingerprint = await getFingerprint();

    //         const response: AxiosResponse<RefreshResponse> = await axiosPrivate.post<RefreshResponse>('/api/auth/refresh', {fingerprint});
    //         const data = response.data;
            
    //         if (data.success) {

    //             setUser({
    //                 email: data.userInfo.email,
    //                 firstName: data.userInfo.firstName,
    //                 lastName: data.userInfo.lastName,
    //                 role: data.userInfo.role,
    //                 accessTokenExpiration: data.accessTokenExpiration,
    //                 industry: data.industry,
    //                 setupStep: data.setupStep,
    //             });

    //         } else {
    //             logout();
    //         }
    //     } catch (error) {
    //         console.error('Refresh failed:', error);
    //         logout();
    //     } finally {
    //         setLoading(false);
    //     }
    // };

    const logout = async () => {

        try {
            const fingerprint = await getFingerprint();

            const response: AxiosResponse<LogOutResponse> = await axiosPrivate.post<LogOutResponse>('/api/auth/logout', {fingerprint});
            const data = response.data;
            
            console.log(data.message)
        } catch (error) {
            console.error(error);
        } finally {
            setUser(null);
        }
    };

    useEffect(() => {
        refresh();
    }, []);

    return (
        <AuthContext.Provider value={{ user, setUser, loading, login, refresh, logout }}>
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