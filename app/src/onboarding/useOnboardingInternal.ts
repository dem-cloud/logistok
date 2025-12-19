import { useState } from "react";
import { axiosPrivate } from "../api/axios";
import { Industry, OnboardingBackResponse, OnboardingData, OnboardingMeta, OnboardingNextResponse, Plan, Plugin } from "./types";
import { useNavigate } from "react-router-dom";
import { STEP_ROUTES } from "./steps";
import { useAuth } from "@/context/AuthContext";

export function useOnboardingInternal() {

    const { activeCompany, setActiveCompany, setCompanies, refresh, me, showToast } = useAuth();
    const navigate = useNavigate();

    const [onboardingData, setOnboardingData] = useState<OnboardingData>({
        company: {
            name: '',
            phone: '',
        },
        industries: [],
        plan: null,
        plugins: []
    });
    const [onboardingMeta, setOnboardingDataMeta] = useState<OnboardingMeta>({})

    // State for options data (industries, plans, plugins)
    const [industries, setIndustries] = useState<Industry[]>([]);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [plugins, setPlugins] = useState<Plugin[]>([]);

    const [optionsLoading, setOptionsLoading] = useState(true);
    const [pluginsLoading, setPluginsLoading] = useState(false);

    const [onboardingDataLoading, setOnboardingDataLoading] = useState(true);

    const syncCurrentStep = async (step: number) => {
        try {
            const response = await axiosPrivate.post(`/api/shared/${activeCompany?.id}/onboarding/sync-step`, { step });
            const { success } = response.data;

            if(!success){
                showToast({message: "Κάτι πήγε στραβά", type: "error"})
                return;
            }
        } catch (error) {
            showToast({message: "Κάτι πήγε στραβά", type: "error"})
        }
    };

    const fetchOnboardingData = async () => {
        try {
            const response = await axiosPrivate.get(`/api/shared/${activeCompany?.id}/onboarding/data`);
            const { success, data } = response.data;

            if(!success){
                showToast({message: "Κάτι πήγε στραβά", type: "error"})
                return;
            }

            const { draft_data, meta_data } = data;

            setOnboardingData(draft_data);
            setOnboardingDataMeta(meta_data);

        } catch (error) {
            showToast({message: "Κάτι πήγε στραβά", type: "error"})
        } finally {
            setOnboardingDataLoading(false)
        }
    }

    const fetchBaseOptions = async () => {
        try {
            setOptionsLoading(true);

            const [industriesRes, plansRes] = await Promise.all([
                axiosPrivate.get("/api/shared/industries"),
                axiosPrivate.get("/api/shared/plans")
            ]);
            
            setIndustries(industriesRes.data.data);
            setPlans(plansRes.data.data);
        } catch (error) {
            console.error("Error fetching base options:", error);
        } finally {
            setOptionsLoading(false);
        }
    };

    const fetchPlugins = async () => {
        
        try {
            setPluginsLoading(true);

            const selectedIndustryKeys = onboardingData?.industries || [];
            const res = await axiosPrivate.get("/api/shared/plugins", {
                params: {
                    scope: "onboarding",
                    industries: selectedIndustryKeys.length > 0
                        ? selectedIndustryKeys.join(",")
                        : undefined
                }
            });
            setPlugins(res.data.data);
        } catch (error) {
            console.error("Error fetching plugins:", error);
        } finally {
            setPluginsLoading(false);
        }
    };


    const nextStep = async (updates: Partial<OnboardingData>) => {
        const response = await axiosPrivate.post<OnboardingNextResponse>(`/api/shared/${activeCompany?.id}/onboarding/next`, { updates });
        const { success, data } = response.data;

        if(!success || !data) {
            showToast({message: "Κάτι πήγε στραβά", type: "error"})
            return;
        }

        const { next_step, max_step_reached, draft_data, meta_data } = data;

        setOnboardingData(draft_data);
        setOnboardingDataMeta(meta_data);

        setActiveCompany(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                onboarding: {
                    ...prev.onboarding,
                    current_step: next_step,
                    max_step_reached: max_step_reached
                }
            };
        })

        setCompanies(prev =>
            prev.map(c =>
                c.id === activeCompany?.id
                    ? { ...c, onboarding: { ...c.onboarding, current_step: next_step, max_step_reached: max_step_reached } }
                    : c
            )
        )

        navigate(`/onboarding/${STEP_ROUTES[next_step]}`)
    };

    const backStep = async () => {
        const response = await axiosPrivate.post<OnboardingBackResponse>(`/api/shared/${activeCompany?.id}/onboarding/back`);
        const { success, data } = response.data;

        if(!success || !data) {
            showToast({message: "Κάτι πήγε στραβά", type: "error"})
            return;
        }

        const { back_step } = data;

        setActiveCompany(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                onboarding: {
                    ...prev.onboarding,
                    current_step: back_step
                }
            };
        })

        setCompanies(prev =>
            prev.map(c =>
                c.id === activeCompany?.id
                    ? { ...c, onboarding: { ...c.onboarding, current_step: back_step } }
                    : c
            )
        )

        navigate(`/onboarding/${STEP_ROUTES[back_step]}`)
    }

    const completeOnboarding = async (final_updates: Partial<OnboardingData>) => {

        const response = await axiosPrivate.post(`/api/shared/${activeCompany?.id}/onboarding/complete`, { final_updates });

        const { success, data } = response.data;

        if(!success) {
            showToast({message: "Κάτι πήγε στραβά", type: "error"})
            return;
        }

        const { is_completed } = data;

        setActiveCompany(prev => {
            if (!prev) return prev;

            return {
                ...prev,
                onboarding: {
                    ...prev.onboarding,
                    is_completed: is_completed,
                }
            }
        })

        setCompanies(prev =>
            prev.map(c =>
                c.id === activeCompany?.id
                    ? { ...c, onboarding: { ...c.onboarding, is_completed: is_completed } }
                    : c
            )
        )

        navigate('/')
    }

    const exitSetup = async () => {

        // 1. Βγαίνεις από company context
        setActiveCompany(null);
        localStorage.removeItem("activeCompanyId");

        // 2. Ζητάς naked token (χωρίς companyId / role / permissions)
        await refresh(); 

        // 3. Παίρνεις ενημερωμένα onboarding data
        const { companies } = await me();
        setCompanies(companies)

        // 4. Πηγαίνεις στο select company
        navigate("/select-company", { replace: true });
    }

    return { 
        onboardingData,
        onboardingDataLoading,
        onboardingMeta,

        // PUBLIC actions
        nextStep,
        backStep,
        completeOnboarding,
        exitSetup,

        // INTERNAL only
        syncCurrentStep,
        fetchOnboardingData,
        fetchBaseOptions,
        fetchPlugins,

        industries,
        plans,
        plugins,
        optionsLoading,
        pluginsLoading
    }
}
