import { createContext, useState, useEffect, useContext, useRef, useCallback } from 'react';
import { axiosPrivate, axiosPublic } from '../api/axios';
import { getExp } from '../auth/getExp';
import { setToken as storeSetToken } from '../auth/tokenStore';
import { registerLogout } from '../auth/logoutHandler';
import { useNavigate } from 'react-router-dom';
import { registerRefresh } from '../auth/refreshHandler';
import Toast from '../components/Toast';
import { AuthResponseData, CompanySessionInfo, MeResponse, RefreshResponseData, User } from '../types/auth.types';
import { ToastData } from '../types/toast.types';
import { OnboardingStepNumber } from '../onboarding/types';
import { STEP_ROUTES } from '../onboarding/steps';


const REFRESH_MARGIN_SEC = Number(import.meta.env.VITE_REFRESH_MARGIN_SEC) || 60;

interface AuthContextType {
    token: string | null;

    user: User | null;
    setUser: React.Dispatch<React.SetStateAction<User | null>>;
    companies: CompanySessionInfo[];
    setCompanies: React.Dispatch<React.SetStateAction<CompanySessionInfo[]>>;
    activeCompany: CompanySessionInfo | null;
    setActiveCompany: (company: CompanySessionInfo | null) => void;
    updateActiveCompany: ( updater: (prev: CompanySessionInfo) => CompanySessionInfo ) => void;

    createCompany: () => Promise<void>;
    selectCompany: (companyId: string) => Promise<void>;

    login: (data: AuthResponseData) => void;
    logout: () => Promise<void>;
    refresh: () => Promise<RefreshResponseData>;
    me: () => Promise<MeResponse>

    loading: boolean;
    showToast: (data: ToastData) => void;
}

interface AuthProviderProps {
    children: React.ReactNode;
}

// Create the AuthContext
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: AuthProviderProps) {

    const navigate = useNavigate();

    const [token, setTokenState] = useState<string | null>(null);

    const [user, setUser] = useState<User | null>(null);
    const [companies, setCompanies] = useState<CompanySessionInfo[]>([]);
    const [activeCompany, setActiveCompanyState] = useState<CompanySessionInfo | null>(null);
    
    const tokenRef = useRef<string | null>(null);
    const activeCompanyRef = useRef<CompanySessionInfo | null>(null);

    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<ToastData | null>(null);

    const timer = useRef<number | null>(null);
    
    const setToken = (newToken: string | null) => {
        tokenRef.current = newToken;
        setTokenState(newToken);
        storeSetToken(newToken); // sync with tokenStore
    };

    const setActiveCompany = (company: CompanySessionInfo | null) => {
        activeCompanyRef.current = company;
        setActiveCompanyState(company);
    };

    const updateActiveCompany = (updater: (prev: CompanySessionInfo) => CompanySessionInfo) => {

        if (!activeCompanyRef.current) return;

        const updated = updater(activeCompanyRef.current);

        activeCompanyRef.current = updated;
        setActiveCompanyState(updated);
    };


    useEffect(() => {
        tokenRef.current = token;
    }, [token]);

    useEffect(() => {
        activeCompanyRef.current = activeCompany;
    }, [activeCompany]);

    const showToast = ({ message, type = "info", duration = 3000 }: ToastData) => {
        setToast({ message, type });

        setTimeout(() => {
            setToast(null);
        }, duration);
    };

    // Κράτα τον χρήστη μέσα, μην λήξει το access token
    const schedule = () => {
        
        const currentToken = tokenRef.current;
        if (!currentToken) return;

        const exp = getExp(currentToken);
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
                const { access_token } = await refresh();
                tokenRef.current = access_token;
                schedule();
            } catch {
                forceLogout();
            }
        }, delayMs);
    };

    useEffect(() => {
        const initAuth = async () => {
            try {
                // 1) Πάρε νέο naked access token (μόνο sub)
                await refresh();

                // 2) Φέρε user + companies
                const { user, companies } = await me();

                setUser(user);
                setCompanies(companies);

                // 3) Προσπάθησε να ανακτήσεις την τελευταία active company από localStorage
                const savedCompanyId = localStorage.getItem("activeCompanyId");

                if(companies.length === 0) {
                    setActiveCompany(null);
                    localStorage.removeItem("activeCompanyId");
                    return;
                }

                // Πρώτα προσπαθούμε restore
                if (savedCompanyId && companies.length > 0) {
                    const match = companies.find(c => c.id === savedCompanyId);
                    if (match) {
                        // Κάνουμε switchCompany ΧΩΡΙΣ redirect,
                        // για να μείνει ο χρήστης στο path που ήταν στο reload
                        await switchCompanyLogic(savedCompanyId, match);

                        return;
                    } else {
                        localStorage.removeItem("activeCompanyId");
                    }
                }

            } catch (err) {
                // console.error("initAuth error:", err);
                forceLogout();
            } finally {
                setLoading(false);
            }
        };

        initAuth();

        return () => {
            if (timer.current) {
                clearTimeout(timer.current);
                timer.current = null;
            }
        };
    }, []);


    const login = (data: AuthResponseData) => {

        const { access_token, user, companies } = data;
        
        setToken(access_token);
        setUser(user);
        setCompanies(companies);

        schedule();

        navigate('/select-company');
    };

    const refresh = useCallback(async () => {

        const company = activeCompanyRef.current;

        // console.log(company);

        const payload = company
            ? { companyId: company.id }   // Contextual refresh
            : {};                         // Naked refresh

        const response = await axiosPublic.post("/api/auth/refresh", payload, { withCredentials: true });
        const { success, message, data } = response.data;

        if(!success){
            console.log(message)
            throw new Error("invalid_refresh_response");
        }

        const { access_token } = data;
        
        setToken(access_token);

        return { access_token }

    }, [activeCompany]);

    const me = async (): Promise<MeResponse> => {

        const response = await axiosPrivate.get("/api/auth/me"); //μπορει να θελει post για να παιρναει το τοκεν
        const { success, message, data } = response.data;

        if(!success){
            console.log(message)
            throw new Error("invalid_me_response");
        }

        return data;
    }

    const createCompany = async () => {

        try {

            const response = await axiosPrivate.post("/api/auth/create-company", {})
            const { success, message, code, data } = response.data;
            
            if(!success){
                if (code === "ONBOARDING_INCOMPLETE") {
                    // Redirect στο incomplete onboarding
                    showToast({ 
                        message, 
                        type: "warning" 
                    });
                    return;
                }
                
                showToast({ message: "Κάτι πήγε στραβά", type: "error" });
                return;
            }

            const { access_token, active_company } = data;

            // 1) Βάλε το contextual access token
            setToken(access_token);
            // 2) Ορισμός active company
            setActiveCompany(active_company);

            // 4) Προσθήκη νέας εταιρείας
            setCompanies(prev=>[...prev, active_company])
            
            // 5) Αποθήκευση για restore στο reload
            localStorage.setItem("activeCompanyId", active_company.id);

            // 6) Νέο token → νέο schedule
            schedule();

            // 7) Redirect ΣΙΓΟΥΡΑ σε onboarding
            const currentStepNumber = (activeCompany?.onboarding.current_step ?? 1) as OnboardingStepNumber;
            const currentStepRoute = STEP_ROUTES[currentStepNumber];
            navigate(`/onboarding/${currentStepRoute}`, { replace: true } );

        } catch (error) {
            console.error("error:", error);
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
            // Αν αποτύχει, cleanup
            localStorage.removeItem("activeCompanyId");
        }
    }
    
    const switchCompanyLogic = async ( companyId: string, company: CompanySessionInfo ) => {

        try {
            const response = await axiosPrivate.post('/api/auth/switch-company', { companyId });
            const { success, data } = response.data;

            if(!success){
                showToast({ message: "Κάτι πήγε στραβά", type: "error" });
                return null;
            }

            const { access_token } = data;
            
            setToken(access_token);
            setActiveCompany(company);
            localStorage.setItem("activeCompanyId", companyId);

            schedule();


        } catch (error) {
            console.error("error:", error);
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
            localStorage.removeItem("activeCompanyId");
            return null;
        }

    };

    const selectCompany = async (companyId: string) => {

        const company = companies.find(c => c.id === companyId);
        if (!company) {
            showToast({ message: "Η εταιρεία δεν βρέθηκε", type: "error" });
            return;
        }

        await switchCompanyLogic(companyId, company);

        if(!company.onboarding.is_completed){
            const currentStepNumber = (activeCompany?.onboarding.current_step ?? 1) as OnboardingStepNumber;
            const currentStepRoute = STEP_ROUTES[currentStepNumber];
            navigate(`/onboarding/${currentStepRoute}`, { replace: true } );
        }
        else
            navigate('/')

    };

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
            setCompanies([]);
            setActiveCompany(null);
            localStorage.removeItem("activeCompanyId");

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
        setCompanies([]);
        setActiveCompany(null);
        localStorage.removeItem("activeCompanyId");
        
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
        <AuthContext.Provider value={{ token, user, setUser, companies, setCompanies, activeCompany, setActiveCompany, updateActiveCompany, createCompany, selectCompany, login, logout, refresh, me, loading, showToast }}>
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

        /* =================== TODO: Delete it on production =================== */
        // During HMR/Fast Refresh, context might temporarily be undefined
        // Return a safe default to prevent crashes during development
        if (import.meta.env.DEV) {
            // Return a minimal safe default during development HMR
            const defaultUser: User = { email: null, phone: null };
            return {
                token: null,
                user: null,
                setUser: () => {},
                companies: [],
                setCompanies: () => {},
                activeCompany: null,
                setActiveCompany: () => {},
                updateActiveCompany: () => {},
                createCompany: async () => {},
                selectCompany: async () => {},
                login: () => {},
                logout: async () => {},
                refresh: async () => ({ access_token: '' }),
                me: async () => ({ user: defaultUser, companies: [] }),
                loading: true,
                showToast: () => {},
            } as AuthContextType;
        }
        /* =================== TODO: Delete it on production =================== */

        throw new Error('useAuth must be used within an AuthProvider');
    }
    
    return context;
}