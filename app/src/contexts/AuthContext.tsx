import { createContext, useState, useEffect, useContext, useRef, useCallback } from 'react';
import { axiosPrivate, axiosPublic } from '../api/axios';
import { getExp } from '../auth/getExp';
import { setToken as storeSetToken } from '../auth/tokenStore';
import { registerLogout } from '../auth/logoutHandler';
import { useNavigate } from 'react-router-dom';
import { registerRefresh } from '../auth/refreshHandler';
import Toast from '../components/Toast';
import { AuthResponseData, CompanySessionInfo, MeResponse, RefreshResponseData, User, StoreRole } from '../types/auth.types';
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
    updateActiveCompany: (updater: (prev: CompanySessionInfo) => CompanySessionInfo) => void;
    
    activeStore: StoreRole | null;
    setActiveStore: (store: StoreRole | null) => void;
    switchStore: (storeId: string) => Promise<void>;

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
    const [activeStore, setActiveStoreState] = useState<StoreRole | null>(null);
    
    const tokenRef = useRef<string | null>(null);
    const activeCompanyRef = useRef<CompanySessionInfo | null>(null);
    const activeStoreRef = useRef<StoreRole | null>(null);

    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<ToastData | null>(null);

    const timer = useRef<number | null>(null);
    
    const setToken = (newToken: string | null) => {
        tokenRef.current = newToken;
        setTokenState(newToken);
        storeSetToken(newToken);
    };

    const setActiveCompany = (company: CompanySessionInfo | null) => {
        activeCompanyRef.current = company;
        setActiveCompanyState(company);
    };

    const setActiveStore = (store: StoreRole | null) => {
        activeStoreRef.current = store;
        setActiveStoreState(store);
    };

    const updateActiveCompany = (updater: (prev: CompanySessionInfo) => CompanySessionInfo) => {
        if (!activeCompanyRef.current) return;

        const updated = updater(activeCompanyRef.current);

        activeCompanyRef.current = updated;
        setActiveCompanyState(updated);
    };

    const showToast = ({ message, type = "info", duration = 3000 }: ToastData) => {
        setToast({ message, type });

        setTimeout(() => {
            setToast(null);
        }, duration);
    };

    const schedule = () => {
        const currentToken = tokenRef.current;
        if (!currentToken) return;

        const exp = getExp(currentToken);
        if (!exp) return;

        const now = Math.floor(Date.now() / 1000);
        const timeUntilExpiry = exp - now;
        const delay = timeUntilExpiry - REFRESH_MARGIN_SEC;
        
        const delayMs = Math.max(delay, 5) * 1000;

        if (timer.current) window.clearTimeout(timer.current);

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
        let isMounted = true;

        const initAuth = async () => {
            try {
                // 1) Naked refresh
                await refresh();
                if (!isMounted) return;

                // 2) Fetch user + companies
                const { user, companies } = await me();
                if (!isMounted) return;

                setUser(user);
                setCompanies(companies);

                // 3) Try to restore last active company
                const savedCompanyId = localStorage.getItem("activeCompanyId");

                if (companies.length === 0) {
                    setActiveCompany(null);
                    setActiveStore(null);
                    localStorage.removeItem("activeCompanyId");
                    
                    Object.keys(localStorage).forEach(key => {
                        if (key.startsWith('activeStoreId_')) {
                            localStorage.removeItem(key);
                        }
                    });
                    return;
                }

                // Restore company + store
                if (savedCompanyId && companies.length > 0) {
                    const match = companies.find(c => c.id === savedCompanyId);
                    if (match) {
                        // Try to restore last active store
                        const savedStoreId = localStorage.getItem(`activeStoreId_${savedCompanyId}`);
                        
                        await switchCompanyLogic(savedCompanyId, match, savedStoreId || undefined);
                        return;
                    } else {
                        localStorage.removeItem("activeCompanyId");
                        localStorage.removeItem(`activeStoreId_${savedCompanyId}`);
                    }
                }

            } catch (err) {
                if (!isMounted) return;
                forceLogout();
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        initAuth();

        return () => {
            isMounted = false;

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
        const store = activeStoreRef.current;

        const payload = company && store
            ? { companyId: company.id, storeId: store.id }  // Store-specific refresh
            : company
            ? { companyId: company.id }                     // Company-level refresh
            : {};                                            // Naked refresh

        const response = await axiosPublic.post("/api/auth/refresh", payload, { withCredentials: true });
        const { success, message, data } = response.data;

        if (!success) {
            console.log(message);
            throw new Error("invalid_refresh_response");
        }

        const { access_token } = data;
        
        setToken(access_token);

        return { access_token };

    }, []);

    const me = async (): Promise<MeResponse> => {
        const response = await axiosPrivate.get("/api/auth/me");
        const { success, message, data } = response.data;

        if (!success) {
            console.log(message);
            throw new Error("invalid_me_response");
        }

        return data;
    };

    const createCompany = async () => {
        try {
            const response = await axiosPrivate.post("/api/auth/create-company", {});
            const { success, message, code, data } = response.data;
            
            if (!success) {
                if (code === "ONBOARDING_INCOMPLETE") {
                    showToast({ message, type: "warning" });
                    return;
                }
                
                showToast({ message: "Κάτι πήγε στραβά", type: "error" });
                return;
            }

            const { access_token, active_company } = data;

            setToken(access_token);
            setActiveCompany(active_company);
            setActiveStore(null); // No stores yet
            
            setCompanies(prev => [...prev, active_company]);
            
            localStorage.setItem("activeCompanyId", active_company.id);

            schedule();

            const currentStepNumber = (active_company?.onboarding.current_step ?? 1) as OnboardingStepNumber;
            const currentStepRoute = STEP_ROUTES[currentStepNumber];
            navigate(`/onboarding/${currentStepRoute}`, { replace: true });

        } catch (error) {
            console.error("error:", error);
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
            localStorage.removeItem("activeCompanyId");
        }
    };
    
    const switchCompanyLogic = async ( companyId: string, company: CompanySessionInfo, targetStoreId?: string ) => {

        try {
            const payload: any = { companyId };
            
            if (targetStoreId) {
                payload.storeId = targetStoreId;
            } else {
                const savedStoreId = localStorage.getItem(`activeStoreId_${companyId}`);
                if (savedStoreId) {
                    payload.storeId = savedStoreId;
                }
            }

            const response = await axiosPrivate.post('/api/auth/switch-company', payload);
            const { success, data } = response.data;

            if (!success) {
                showToast({ message: "Κάτι πήγε στραβά", type: "error" });
                return null;
            }

            const { access_token, selected_store_id } = data;
            
            setToken(access_token);
            
            // Company already has stores from login/me response
            setActiveCompany(company);
            
            // Find selected store from existing company.stores
            const selectedStore = company.stores?.find(s => s.id === selected_store_id);
            if (selectedStore) {
                setActiveStore(selectedStore);
                localStorage.setItem(`activeStoreId_${companyId}`, selected_store_id);
            } else if (company.stores?.length > 0) {
                // Fallback to first store
                setActiveStore(company.stores[0]);
                localStorage.setItem(`activeStoreId_${companyId}`, company.stores[0].id);
            }
            
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

        if (!company.onboarding.is_completed) {
            const currentStepNumber = (company?.onboarding.current_step ?? 1) as OnboardingStepNumber;
            const currentStepRoute = STEP_ROUTES[currentStepNumber];
            navigate(`/onboarding/${currentStepRoute}`, { replace: true });
        } else {
            navigate('/');
        }
    };

    // Switch store within same company
    const switchStore = async (storeId: string) => {
        if (!activeCompany) {
            showToast({ message: "Δεν υπάρχει ενεργή εταιρεία", type: "error" });
            return;
        }

        const store = activeCompany.stores?.find(s => s.id === storeId);
        if (!store) {
            showToast({ message: "Το κατάστημα δεν βρέθηκε", type: "error" });
            return;
        }

        try {
            // Call switch-company with same companyId but different storeId
            await switchCompanyLogic(activeCompany.id, activeCompany, storeId);
            
            showToast({ message: `Αλλαγή σε: ${store.name}`, type: "success" });
        } catch (error) {
            console.error("error:", error);
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
        }
    };

    const logout = async () => {
        try {
            await axiosPublic.post('/api/auth/logout', {}, { withCredentials: true });
        } catch (error) {
            console.error(error);
        } finally {
            if (timer.current) {
                window.clearTimeout(timer.current);
                timer.current = null;
            }

            setToken(null);
            setUser(null);
            setCompanies([]);
            setActiveCompany(null);
            setActiveStore(null);
            localStorage.removeItem("activeCompanyId");
            // Clear all store selections
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('activeStoreId_')) {
                    localStorage.removeItem(key);
                }
            });

            navigate("/auth", { replace: true });
        }
    };

    const forceLogout = useCallback(() => {
        if (timer.current) {
            window.clearTimeout(timer.current);
            timer.current = null;
        }

        setToken(null);
        setUser(null);
        setCompanies([]);
        setActiveCompany(null);
        setActiveStore(null);
        localStorage.removeItem("activeCompanyId");
        // Clear all store selections
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('activeStoreId_')) {
                localStorage.removeItem(key);
            }
        });
        
        const currentPath = window.location.pathname;
        if (currentPath !== "/auth" && !currentPath.startsWith("/auth/")) {
            navigate("/auth", { replace: true });
        }
    }, []);

    useEffect(() => {
        registerLogout(forceLogout);
    }, [forceLogout]);

    useEffect(() => {
        registerRefresh(refresh);
    }, [refresh]);

    return (
        <AuthContext.Provider value={{ 
            token, 
            user, 
            setUser, 
            companies, 
            setCompanies, 
            activeCompany, 
            setActiveCompany, 
            updateActiveCompany,
            activeStore,
            setActiveStore,
            switchStore,
            createCompany, 
            selectCompany, 
            login, 
            logout, 
            refresh, 
            me, 
            loading, 
            showToast 
        }}>
            {children}
            {toast && <Toast message={toast.message} type={toast.type ?? "info"} />}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    
    if (!context) {
        if (import.meta.env.DEV) {
            const defaultUser: User = { id: '', email: null, phone: null, first_name: null, last_name: null };
            return {
                token: null,
                user: null,
                setUser: () => {},
                companies: [],
                setCompanies: () => {},
                activeCompany: null,
                setActiveCompany: () => {},
                updateActiveCompany: () => {},
                activeStore: null,
                setActiveStore: () => {},
                switchStore: async () => {},
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

        throw new Error('useAuth must be used within an AuthProvider');
    }
    
    return context;
};