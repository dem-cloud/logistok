import { useState } from "react";
import { axiosPrivate } from "../api/axios";
import { OnboardingBackResponse, OnboardingData, OnboardingMeta, OnboardingNextResponse } from "./types";
import { useNavigate } from "react-router-dom";
import { STEP_ROUTES } from "./steps";
import { useAuth } from "@/context/AuthContext";

export function useOnboardingInternal() {

    const { activeCompany, setActiveCompany, updateActiveCompany, setCompanies, refresh, me, showToast } = useAuth();
    const navigate = useNavigate();

    const [onboardingData, setOnboardingData] = useState<OnboardingData>({
        company: {
            name: '',
            phone: '',
        },
        industries: [],
        plan: null,
        branches: 1,
        plugins: []
    });
    const [onboardingMeta, setOnboardingDataMeta] = useState<OnboardingMeta>({})

    const [onboardingDataLoading, setOnboardingDataLoading] = useState(true);

    const syncCurrentStep = async (step: number) => {
        try {
            const response = await axiosPrivate.post(`/api/shared/onboarding/sync-step`, { step });
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
            const response = await axiosPrivate.get(`/api/shared/onboarding/data`);
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

    const nextStep = async (updates: Partial<OnboardingData>) => {
        const response = await axiosPrivate.post<OnboardingNextResponse>(`/api/shared/onboarding/next`, { updates });
        const { success, data } = response.data;

        if(!success || !data) {
            showToast({message: "Κάτι πήγε στραβά", type: "error"})
            return;
        }

        const { next_step, max_step_reached, draft_data, meta_data } = data;

        setOnboardingData(draft_data);
        setOnboardingDataMeta(meta_data);

        updateActiveCompany(prev => {
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
        const response = await axiosPrivate.post<OnboardingBackResponse>(`/api/shared/onboarding/back`);
        const { success, data } = response.data;

        if(!success || !data) {
            showToast({message: "Κάτι πήγε στραβά", type: "error"})
            return;
        }

        const { back_step } = data;

        updateActiveCompany(prev => {
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

    const completeOnboarding = async (isPaidPlan: boolean, setupIntentId: string | null = null) => {

        let response;
        if(!isPaidPlan){
            response = await axiosPrivate.post('/api/shared/onboarding-complete');
        } else {
            response = await axiosPrivate.post("/api/billing/onboarding-complete", { setupIntentId: setupIntentId });
        }

        const { success, data } = response.data;

        if(!success) {
            showToast({message: "Κάτι πήγε στραβά", type: "error"})
            return;
        }

        const { is_completed } = data;

        updateActiveCompany(prev => {
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

    const updateDraft = async (updates: Partial<OnboardingData>) => { // For changes in PaymentCheckout

        const res = await axiosPrivate.post("/api/shared/onboarding/update-draft", { updates });

        const { success, data } = res.data;

        if (!success || !data) {
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
            return;
        }

        setOnboardingData(data.draft_data);
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
        updateDraft,
        exitSetup,

        // INTERNAL only
        syncCurrentStep,
        fetchOnboardingData
    }
}
