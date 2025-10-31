import { AxiosResponse } from 'axios';
import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { axiosPrivate } from '../api/axios';
import FingerprintJS from '@fingerprintjs/fingerprintjs';

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

// Define AuthContext type
interface AuthContextType {
    user: User | null;
    setUser: React.Dispatch<React.SetStateAction<User | null>>;
    loading: boolean;
    refresh: () => Promise<void>;
    logout: () => Promise<void>;
}

// Create the AuthContext
// export const AuthContext = createContext<AuthContextType | undefined>(undefined);
export const AuthContext = createContext<AuthContextType>({
    user: null,
    setUser: () => {},
    loading: true,
    refresh: async () => {},
    logout: async () => {},
});


interface AuthProviderProps {
    children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    async function getFingerprint() {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        return result.visitorId; // Unique fingerprint
    }

    const refresh = async () => {

        try {
            const fingerprint = await getFingerprint();

            const response: AxiosResponse<RefreshResponse> = await axiosPrivate.post<RefreshResponse>('/api/auth/refresh', {fingerprint});
            const data = response.data;
            
            if (data.success) {

                setUser({
                    email: data.userInfo.email,
                    firstName: data.userInfo.firstName,
                    lastName: data.userInfo.lastName,
                    role: data.userInfo.role,
                    accessTokenExpiration: data.accessTokenExpiration,
                    industry: data.industry,
                    setupStep: data.setupStep,
                });

            } else {
                logout();
            }
        } catch (error) {
            console.error(error);
            logout();
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {

        try {
            const fingerprint = await getFingerprint();

            const response: AxiosResponse<LogOutResponse> = await axiosPrivate.post<LogOutResponse>('/api/auth/logout', {fingerprint});
            const data = response.data;
            
            console.log(data.message)
            setUser(null);
            window.location.href = "http://localhost:3000/login";
        } catch (error) {
            console.error(error);
            setUser(null);
            window.location.href = "http://localhost:3000/login";
        }
    };

    useEffect(() => {
        refresh();
    }, []);

    return (
        <AuthContext.Provider value={{ user, setUser, loading, refresh, logout }}>
            {children}
        </AuthContext.Provider>
    );
}
