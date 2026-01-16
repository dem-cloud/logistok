import { axiosPrivate } from "@/api/axios";
import { useOnboarding } from "../OnboardingContext";
import styles from "./FreeFinalize.module.css";
import { CheckCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function FreeFinalize() {

    const { showToast } = useAuth();
    const { completeOnboarding } = useOnboarding();

    const handleSubmit = async () => {

        try {
            const response = await axiosPrivate.post('/api/shared/onboarding-complete-free');
            const { success, data, message } = response.data;

            if (!success) {
                showToast({ message: message || "Κάτι πήγε στραβά", type: "error" });
                return;
            }

            completeOnboarding(data)
        } catch (error) {
            console.error("error:", error);
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
        }
        
    }
    
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
                    onClick={handleSubmit}
                >
                    Ολοκλήρωση & Μετάβαση στο Dashboard
                </button>
            </div>
        </div>
    );
}
