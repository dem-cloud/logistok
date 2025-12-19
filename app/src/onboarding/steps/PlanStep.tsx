import PlanList from "@/components/PlanList";
import styles from '../OnboardingLayout.module.css'


export function PlanStep() {

    return (
        <div className={styles.content}>
            <div className={styles.title}>Επιλέξτε το πλάνο που ταιριάζει στις ανάγκες σας</div>
            <div className={styles.tagline}>Ολα τα πλάνα είναι προσαρμοσμένα να εξυπηρετούν ανάλογα τις ανάγκες του καθενός</div>

            <PlanList 
                mode = "onboarding"
            />

        </div>
    );
}
