import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import OnboardingStep1 from "./OnboardingStep1";
import OnboardingStep2 from "./OnboardingStep2";
import OnboardingStep3 from "./OnboardingStep3";
import { useEffect, useState } from "react";
import { axiosPrivate } from "../../api/axios";

interface OnboardingData {
    industries: [],
    plans: [],
    step1: {
        companyName: string;
        managersPhone: string;
    };
    step2: {
        industryId: number;
    };
}


export default function Onboarding() {

    const { user, setUser, showToast } = useAuth();
    const { step } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState<OnboardingData | null>(null);

    const getOnboardingData = async () => {
        try {
            const response = await axiosPrivate.get("/api/shared/onboarding-data");
            setData(response.data.data)

        } catch (error) {
            showToast({message: "Κάτι πήγε στραβά", type: "error"})
        }
    }

    useEffect(() => {
        getOnboardingData()
    }, []);



    if (!user) {
        return <Navigate to="/auth" replace />;
    }

    const currentStep = Number(step);

    // Τα συνολικά βήματα του onboarding
    const MAX_STEPS = 3;

    // Validation: Πρέπει να είναι integer 1–3
    if (isNaN(currentStep) || currentStep < 1 || currentStep > MAX_STEPS) {
        return <Navigate to={`/onboarding/${user.onboardingStep}`} replace />;
    }
    

    // NAVIGATION HANDLERS
    const goNext = async () => {
        if (currentStep < MAX_STEPS) {
            const nextStep = currentStep + 1;
            // 1. ενημέρωσε το user context
            setUser(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    onboardingStep: nextStep
                };
            });

            // 2. φέρε φρεσκα δεδομένα
            await getOnboardingData();

            // 3. προχώρησε στο επόμενο βήμα
            navigate(`/onboarding/${nextStep}`);
        }
    };

    const goBack = () => {
        if (currentStep > 1) {
            navigate(`/onboarding/${currentStep - 1}`);
        }
    };

    

    return (
        <>
            {currentStep === 1 && (
                <OnboardingStep1 
                    stepData={data?.step1}
                    goNext={goNext}
                />
            )}
            
            {currentStep === 2 && (
                <OnboardingStep2
                    industries={data?.industries}
                    stepData={data?.step2}
                    goNext={goNext}
                    goBack={goBack}
                />
            )}
            
            {currentStep === 3 && (
                <OnboardingStep3
                    plans={data?.plans}
                    goBack={goBack}
                />
            )}
        </>
    );
}
