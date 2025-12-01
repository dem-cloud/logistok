import { useEffect, useState } from "react";
import Button from "../../components/reusable/Button";
import styles from './Onboarding.module.css'
import IndustryCard from "../../components/IndustryCard";
import { useAuth } from "../../context/AuthContext";
import { axiosPrivate } from "../../api/axios";

interface Industry {
    id: number;
    display_name: string;
    description: string;
    photo_url: string;
}

interface StepTwoProps {
    industries?: Industry[];
    stepData?: {
        industryId?: number;
    }
    goNext: () => Promise<void>;
    goBack: () => void;
}

export default function OnboardingStep2({ industries, stepData, goNext, goBack }: StepTwoProps) {

    const { showToast } = useAuth();

    const [loadingSubmitRequest, setLoadingSubmitRequest] = useState(false)
    const [selectedIndustryId, setSelectedIndustryId] = useState<number | null>(stepData?.industryId || null)
    const [error, setError] = useState("");

    useEffect(() => {
        setSelectedIndustryId(stepData?.industryId ?? null);
    }, [stepData]);

    const handleSelect = (industryId: number) => {
        setSelectedIndustryId(industryId);

        if(error){
            setError("");
        }
    }

    const handleBack = async () => {
        goBack();
    };

    const handleNext = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedIndustryId) {
            setError("Η επιλογή κλάδου είναι υποχρεωτική");
            return;
        }

        try {
            setLoadingSubmitRequest(true);

            const response = await axiosPrivate.post("/api/shared/submit-step-two", { selectedIndustryId })
            const { success, message, code } = response.data;

            if(!success){
                // MISSING_INDUSTRY
                // INDUSTRY_NOT_FOUND
                // SUB_NOT_FOUND

                switch (code) {
                    case "MISSING_INDUSTRY":
                        setError(message);
                        return;
                    default:
                        showToast({ message: "Κάτι πήγε στραβά", type: "error" });
                        return;
                }
            }

            await goNext();
            
        } catch (error) {
            console.error("error:", error);
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
        } finally {
            setLoadingSubmitRequest(false);
        }
    };

    return (
        <div className={styles.onboarding}>

            <button
                type="button"
                className={styles.backButton}
                onClick={handleBack}
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

            <div className={styles.onboardingContent}>
                <div className={styles.title}>Σε ποιο κλάδο ανήκεις;</div>
                <div className={styles.tagline}>Σημείωσε ότι αν ολοκληρώσεις τον οδηγό δεν θα μπορείς να αλλάξεις κλάδο.</div>


                <form 
                    onSubmit={handleNext}
                >

                    <div className={styles.industries}>
                        {industries?.map((industry) => (
                            <IndustryCard
                                key={industry.id}
                                item={industry}
                                selected={selectedIndustryId === industry.id}
                                onSelect={() => handleSelect(industry.id)}
                                hasError={!!error}
                            />
                        ))}
                    </div>

                    <div className={`${styles.error} ${!error ? styles.hiddenError : ""}`}>
                        {error || "placeholder"}
                    </div>

                    <Button
                        type = "submit"
                        loading = {loadingSubmitRequest}
                        disabled = {loadingSubmitRequest}
                    >
                        Συνέχεια
                    </Button>
                </form>

            </div>
        </div>
    )
}
