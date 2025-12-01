import PlanList from '../../components/PlanList';
import styles from './Onboarding.module.css'

interface StepThreeProps {
    plans?: [];
    goBack: () => void;
}

export default function OnboardingStep3({ plans, goBack }: StepThreeProps) {

    const handleBack = async () => {
        goBack();
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

            <div className={styles.onboardingStep3Content}>
                <div className={styles.title}>Επιλέξτε το πλάνο που ταιριάζει στις ανάγκες σας</div>
                <div className={styles.tagline}>Ολα τα πλάνα είναι προσαρμοσμένα να εξυπηρετούν ανάλογα τις ανάγκες του καθενός</div>

                <PlanList 
                    plans={plans??[]}
                />

            </div>
        </div>
    )
}
