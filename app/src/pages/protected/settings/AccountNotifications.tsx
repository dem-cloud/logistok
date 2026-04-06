import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotificationPreferences } from "@/hooks/useNotificationPreferences";
import LoadingSpinner from "@/components/LoadingSpinner";
import Button from "@/components/reusable/Button";
import styles from "./AccountNotifications.module.css";

export default function AccountNotifications() {
    const { showToast } = useAuth();
    const { preferences, isLoading, updatePreferences } = useNotificationPreferences();
    const [emailInvitations, setEmailInvitations] = useState(true);
    const [emailMarketing, setEmailMarketing] = useState(true);

    useEffect(() => {
        setEmailInvitations(preferences.email_invitations);
        setEmailMarketing(preferences.email_marketing);
    }, [preferences]);

    const isHydrated = !isLoading;

    const hasChanges =
        isHydrated &&
        (
            emailInvitations !== preferences.email_invitations ||
            emailMarketing !== preferences.email_marketing
        );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await updatePreferences.mutateAsync({
                email_invitations: emailInvitations,
                email_marketing: emailMarketing,
            });
            showToast({ message: "Οι προτιμήσεις ειδοποιήσεων ενημερώθηκαν", type: "success" });
        } catch (e) {
            showToast({ message: (e as Error).message, type: "error" });
        }
    };

    if (isLoading) {
        return (
            <div className={styles.wrapper}>
                <LoadingSpinner />
            </div>
        );
    }

    return (
        <div className={styles.wrapper}>
            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Ειδοποιήσεις μέσω email</h3>
                <p className={styles.sectionHint}>
                    Οι επιβεβαιώσεις πληρωμών, τιμολόγια και ενημερώσεις συνδρομής στέλνονται πάντα. Μπορείτε να επιλέξετε τις υπόλοιπες προτιμήσεις.
                </p>
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.toggleRow}>
                        <div className={styles.toggleLabel}>
                            <span className={styles.toggleTitle}>Προσκλήσεις στην εταιρεία</span>
                            <span className={styles.toggleDesc}>
                                Ειδοποίηση όταν λαμβάνετε νέα πρόσκληση να συνδεθείτε σε εταιρεία
                            </span>
                        </div>
                        <label className={styles.switch}>
                            <input
                                type="checkbox"
                                checked={emailInvitations}
                                onChange={(e) => setEmailInvitations(e.target.checked)}
                            />
                            <span className={styles.slider}></span>
                        </label>
                    </div>
                    <div className={styles.toggleRow}>
                        <div className={styles.toggleLabel}>
                            <span className={styles.toggleTitle}>Προωθητικά και ενημερώσεις</span>
                            <span className={styles.toggleDesc}>
                                Ενημερώσεις για νέες λειτουργίες, προσφορές και προωθητικό περιεχόμενο
                            </span>
                        </div>
                        <label className={styles.switch}>
                            <input
                                type="checkbox"
                                checked={emailMarketing}
                                onChange={(e) => setEmailMarketing(e.target.checked)}
                            />
                            <span className={styles.slider}></span>
                        </label>
                    </div>
                    <div className={styles.formActions}>
                        <Button
                            type="submit"
                            variant="primary"
                            loading={updatePreferences.isPending}
                            disabled={!hasChanges || updatePreferences.isPending}
                        >
                            Αποθήκευση
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
