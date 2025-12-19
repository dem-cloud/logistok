import { useEffect, useState } from "react";
import styles from '../OnboardingLayout.module.css'
import Button from "../../components/reusable/Button";
import IndustryCard from "../../components/IndustryCard";
import { useAuth } from "@/context/AuthContext";
import { useOnboarding } from "../OnboardingContext";

export function IndustriesStep() {
    
    const { showToast } = useAuth();
    const { onboardingData, industries, nextStep } = useOnboarding();

    const [selectedIndustries, setSelectedIndustries] = useState<string[]>(onboardingData.industries)
    const [loadingSubmitRequest, setLoadingSubmitRequest] = useState(false)
    
    useEffect(() => {
        setSelectedIndustries(onboardingData.industries)
    }, [onboardingData])

    const handleSelect = (industryKey: string) => {
        setSelectedIndustries(prev =>
            prev.includes(industryKey)
            ? prev.filter(key => key !== industryKey) // unselect
            : [...prev, industryKey]                   // select
        )
    }

    const handleNext = async (e: React.FormEvent, industries: string[]) => {
        e.preventDefault();

        try {
            setLoadingSubmitRequest(true);

            await nextStep({ industries: industries });
            
        } catch (error) {
            console.error("error:", error);
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
        } finally {
            setLoadingSubmitRequest(false);
        }
    };

    return (
        <main className={styles.content}>
            <div className={styles.title}>Σε ποιο κλάδο ανήκεις;</div>
            <div className={styles.tagline}>Επέλεξε τον κλάδο ή τους κλάδους που σου ταιριάζουν</div>


            <form 
                onSubmit={(e)=>handleNext(e, selectedIndustries)}
            >

                <div className={styles.industries}>
                    {industries.map((industry) => {
                        const isSelected = selectedIndustries.includes(industry.key)
                        return <IndustryCard
                                    key={industry.key}
                                    item={industry}
                                    selected={isSelected}
                                    onSelect={() => handleSelect(industry.key)}
                                />
                    })}
                </div>

                <div className={styles.industriesBtn}>
                    <Button
                        type = "submit"
                        loading = {loadingSubmitRequest}
                        disabled = {loadingSubmitRequest}
                    >
                        Συνέχεια
                    </Button>
                </div>

                <button
                    type="button"
                    className={styles.skipButton}
                    onClick={(e)=>handleNext(e, [])}
                >
                    Παράληψη
                </button>
            </form>

        </main>
    );
}
