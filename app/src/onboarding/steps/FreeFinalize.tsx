import { useOnboarding } from "../OnboardingContext";
import styles from "./FreeFinalize.module.css";
import { CheckCircle } from "lucide-react";

export default function FreeFinalize() {

    const { onboardingData, completeOnboarding } = useOnboarding();
    
    return (
        <div className={styles.content}>
            <div className={styles.container}>
                <div className={styles.iconWrapper}>
                    <CheckCircle size={42} />
                </div>

                <h2 className={styles.title}>Όλα έτοιμα!</h2>

                <p className={styles.subtitle}>
                    Έχεις επιλέξει το
                    <strong> Free Plan</strong>.
                    Με την ολοκλήρωση, θα δημιουργηθεί ο λογαριασμός σου και θα μεταφερθείς στο dashboard.
                </p>

                <div className={styles.infoBox}>
                    <span>✔ Χωρίς χρέωση</span>
                    <span>✔ Χωρίς κάρτα</span>
                    <span>✔ Μπορείς να αναβαθμίσεις οποιαδήποτε στιγμή</span>
                </div>

                <button 
                    className={styles.cta} 
                    onClick={()=>completeOnboarding(onboardingData)}
                >
                    Ολοκλήρωση & Μετάβαση στο Dashboard
                </button>
            </div>
        </div>
    );
}
