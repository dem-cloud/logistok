import { useEffect } from "react";
import styles from './OnboardingLayout.module.css'
import { useParams } from "react-router-dom";
import { ONBOARDING_STEPS, STEP_COMPONENTS } from "./steps";
import { OnboardingStepKey } from "./types";
import { useAuth } from "@/contexts/AuthContext";
import { useOnboarding } from "./OnboardingContext";
import LoadingSpinner from "@/components/LoadingSpinner";

export function OnboardingLayout() {

    const { step } = useParams();
    const { activeCompany } = useAuth();

    const {
        backStep,
        exitSetup,

        onboardingDataLoading,
        optionsLoading,
        pluginsLoading,

        __internal
    } = useOnboarding();

    const {
        fetchOnboardingData,
        syncCurrentStep,
        isAppNavigationRef
    } = __internal;

    const stepKey = step as OnboardingStepKey;
    const stepNumber = ONBOARDING_STEPS[stepKey];
    
    const StepComponent = STEP_COMPONENTS[stepKey];

    const canGoBack = stepNumber > 1;

    useEffect(() => {
        if (!stepNumber) return;

        if (isAppNavigationRef.current) {
            isAppNavigationRef.current = false;
            return;
        }

        if (stepNumber !== activeCompany?.onboarding.current_step) {
            const sync = async () => {
                await syncCurrentStep(stepNumber);
                await fetchOnboardingData();
            };

            sync();
        }
    }, [stepNumber, activeCompany?.onboarding.current_step]);

    if (onboardingDataLoading || optionsLoading || pluginsLoading) 
        return <LoadingSpinner />;
    
    return (
        <div className={styles.onboarding}>
            {/* ===== Header ===== */}
            <header className={styles.header}>
                
                {canGoBack &&
                    <button
                        type="button"
                        className={styles.backButton}
                        onClick={backStep}
                    >
                        <span className={styles.backIcon}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                <path
                                    d="M15 18L9 12L15 6"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </span>
                        Πίσω
                    </button>
                }

                <button
                    type="button"
                    className={styles.exitButton}
                    onClick={exitSetup}
                >
                    Έξοδος
                </button>
            </header>

            {/* ===== Step ===== */}
            <StepComponent />
        </div>
    );
}
