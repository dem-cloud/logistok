import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useOnboardingInternal } from "./useOnboardingInternal";
import { Industry, OnboardingData, OnboardingMeta, OnboardingProviderProps, Plan, Plugin } from "./types";
import { useAuth } from "@/context/AuthContext";

interface OnboardingContextValue {
    onboardingData: OnboardingData;
    onboardingMeta: OnboardingMeta;
    
    industries: Industry[];
    plans: Plan[];
    plugins: Plugin[];

    onboardingDataLoading: boolean;
    optionsLoading: boolean;
    pluginsLoading: boolean;

    nextStep: (updates: Partial<OnboardingData>) => Promise<void>;
    backStep: () => Promise<void>;
    completeOnboarding: (final_updates: Partial<OnboardingData>) => Promise<void>;
    exitSetup: () => void;

    __internal: {
        fetchOnboardingData: () => Promise<void>;
        syncCurrentStep: (step: number) => Promise<void>;
        fetchBaseOptions: () => Promise<void>;
        fetchPlugins: () => Promise<void>;
        /** routing intent flag (read-only for layout) */
        isAppNavigationRef: { current: boolean };
    };
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export const OnboardingProvider = ({ children }: OnboardingProviderProps) => {
    
    const internal = useOnboardingInternal();
    const isAppNavigationRef = useRef(false);

    const { activeCompany } = useAuth();

    const canRunOnboarding =
        !!activeCompany &&
        !activeCompany.onboarding.is_completed &&
        activeCompany.membership.is_owner;

    // Μονο οταν αλλαξουν τα keys στον πινακα industries κανω κληση για plugins
    const industriesKey = useMemo(() => {
        return internal.onboardingData.industries
            ?.slice()
            .sort()
            .join("|") ?? "";
    }, [internal.onboardingData.industries]);


    // Κανουμε API call στο context για να γινονται μια φορα στο mount
    useEffect(() => {
        if (!canRunOnboarding) return;

        internal.fetchOnboardingData();
        internal.fetchBaseOptions();
    }, [canRunOnboarding]);

    useEffect(() => {
        if (!canRunOnboarding) return;
        internal.fetchPlugins();
    }, [canRunOnboarding, industriesKey]);

    // Βαζουμε ref για να αποφυγουμε περισια api calls οταν ο χρηστης χρησιμοποιει το browser navigation
    const nextStep = async (updates: Partial<OnboardingData>) => {
        isAppNavigationRef.current = true; 
        await internal.nextStep(updates);
    };

    const backStep = async () => {
        isAppNavigationRef.current = true;
        await internal.backStep();
    };





    const publicApi: OnboardingContextValue = {
        onboardingData: internal.onboardingData,
        onboardingMeta: internal.onboardingMeta,

        industries: internal.industries,
        plans: internal.plans,
        plugins: internal.plugins,

        onboardingDataLoading: internal.onboardingDataLoading,
        optionsLoading: internal.optionsLoading,
        pluginsLoading: internal.pluginsLoading,

        nextStep,
        backStep,
        completeOnboarding: internal.completeOnboarding,
        exitSetup: internal.exitSetup,

        __internal: {
            fetchOnboardingData: internal.fetchOnboardingData,
            syncCurrentStep: internal.syncCurrentStep,
            fetchBaseOptions: internal.fetchBaseOptions,
            fetchPlugins: internal.fetchPlugins,
            isAppNavigationRef
        }
    };

    return (
        <OnboardingContext.Provider value={publicApi}>
        {children}
        </OnboardingContext.Provider>
    );
};

export const useOnboarding = (): OnboardingContextValue => {
    const ctx = useContext(OnboardingContext);

    if (!ctx) {
        throw new Error("useOnboarding must be used inside OnboardingProvider");
    }

    return ctx;
};

