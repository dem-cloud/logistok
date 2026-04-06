import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useChangePassword } from "@/hooks/useChangePassword";
import { useSessions, type SessionInfo } from "@/hooks/useSessions";
import LoadingSpinner from "@/components/LoadingSpinner";
import Button from "@/components/reusable/Button";
import styles from "./AccountSecurity.module.css";

function formatDate(s: string | null) {
    if (!s) return "—";
    try {
        const d = new Date(s);
        return d.toLocaleDateString("el-GR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return s;
    }
}

function formatDevice(ua: string | null) {
    if (!ua) return "Άγνωστη συσκευή";
    let browser = "Browser";
    if (ua.includes("Edg/")) browser = "Edge";
    else if (ua.includes("OPR/") || ua.includes("Opera/")) browser = "Opera";
    else if (ua.includes("Chrome/") && !ua.includes("Edg")) browser = "Chrome";
    else if (ua.includes("Firefox/")) browser = "Firefox";
    else if (ua.includes("Safari/") && !ua.includes("Chrome")) browser = "Safari";
    let os = "Unknown";
    if (ua.includes("Windows")) os = "Windows";
    else if (ua.includes("Mac OS X") || ua.includes("Macintosh")) os = "macOS";
    else if (ua.includes("Linux")) os = "Linux";
    else if (ua.includes("Android")) os = "Android";
    else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
    return `${browser} on ${os}`;
}

export default function AccountSecurity() {
    const { showToast, logout } = useAuth();
    const changePassword = useChangePassword();
    const { sessions, isLoading, revokeSession, revokeAllOthers } = useSessions();

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        const next: Partial<Record<string, string>> = {};
        if (!currentPassword.trim()) next.currentPassword = "Ο τρέχων κωδικός απαιτείται";
        if (!newPassword.trim()) next.newPassword = "Ο νέος κωδικός απαιτείται";
        else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/.test(newPassword)) {
            next.newPassword = "Τουλάχιστον 6 χαρακτήρες, 1 κεφαλαίο, 1 πεζό και 1 αριθμό";
        }
        if (newPassword !== confirmPassword) next.confirmPassword = "Οι κωδικοί δεν ταιριάζουν";
        setErrors(next);
        if (Object.keys(next).length > 0) return;

        try {
            await changePassword.mutateAsync({
                currentPassword: currentPassword.trim(),
                newPassword: newPassword.trim(),
            });
            showToast({ message: "Ο κωδικός ενημερώθηκε. Συνδεθείτε ξανά.", type: "success" });
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            await logout();
        } catch (e: unknown) {
            const err = e as { message?: string; response?: { data?: { code?: string } } };
            if (err.response?.data?.code === "GOOGLE_ACCOUNT") {
                showToast({
                    message: "Ο λογαριασμός συνδέεται με Google. Άλλαξτε τον κωδικό από τις ρυθμίσεις του Google.",
                    type: "error",
                });
            } else {
                showToast({ message: err.message || "Αποτυχία αλλαγής κωδικού", type: "error" });
            }
        }
    };

    const handleRevoke = async (sessionId: string) => {
        try {
            await revokeSession.mutateAsync(sessionId);
            showToast({ message: "Η συνεδρία τερματίστηκε", type: "success" });
        } catch (e) {
            showToast({ message: (e as Error).message, type: "error" });
        }
    };

    const handleRevokeAll = async () => {
        if (!window.confirm("Θέλετε να τερματίσετε όλες τις άλλες συνεδρίες; Θα αποσυνδεθούν από τις άλλες συσκευές.")) return;
        try {
            await revokeAllOthers.mutateAsync();
            showToast({ message: "Όλες οι άλλες συνεδρίες τερματίστηκαν", type: "success" });
        } catch (e) {
            showToast({ message: (e as Error).message, type: "error" });
        }
    };

    const othersCount = sessions.filter((s: SessionInfo) => !s.is_current).length;

    return (
        <div className={styles.wrapper}>
            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Αλλαγή κωδικού</h3>
                <form onSubmit={handleChangePassword} className={styles.form}>
                    <div className={styles.field}>
                        <label htmlFor="currentPassword">Τρέχων κωδικός</label>
                        <input
                            id="currentPassword"
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder="••••••••"
                            className={errors.currentPassword ? styles.inputError : ""}
                            autoComplete="current-password"
                        />
                        {errors.currentPassword && (
                            <span className={styles.errorText}>{errors.currentPassword}</span>
                        )}
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="newPassword">Νέος κωδικός</label>
                        <input
                            id="newPassword"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="••••••••"
                            className={errors.newPassword ? styles.inputError : ""}
                            autoComplete="new-password"
                        />
                        <p className={styles.fieldHint}>
                            Τουλάχιστον 6 χαρακτήρες, 1 κεφαλαίο, 1 πεζό και 1 αριθμό
                        </p>
                        {errors.newPassword && (
                            <span className={styles.errorText}>{errors.newPassword}</span>
                        )}
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="confirmPassword">Επιβεβαίωση νέου κωδικού</label>
                        <input
                            id="confirmPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="••••••••"
                            className={errors.confirmPassword ? styles.inputError : ""}
                            autoComplete="new-password"
                        />
                        {errors.confirmPassword && (
                            <span className={styles.errorText}>{errors.confirmPassword}</span>
                        )}
                    </div>
                    <div className={styles.formActions}>
                        <Button
                            type="submit"
                            variant="primary"
                            loading={changePassword.isPending}
                            disabled={changePassword.isPending}
                        >
                            Αλλαγή κωδικού
                        </Button>
                    </div>
                </form>
            </div>

            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Ενεργές συνεδρίες</h3>
                {isLoading ? (
                    <LoadingSpinner />
                ) : (
                    <>
                        <p className={styles.sectionHint}>
                            Συνδεθείτε από διαφορετικές συσκευές; Μπορείτε να τερματίσετε συνεδρίες από εδώ.
                        </p>
                        {othersCount > 0 && (
                            <div className={styles.revokeAllRow}>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={handleRevokeAll}
                                    loading={revokeAllOthers.isPending}
                                    disabled={revokeAllOthers.isPending}
                                >
                                    Τερμάτισε όλες τις άλλες συνεδρίες
                                </Button>
                            </div>
                        )}
                        <div className={styles.sessionsList}>
                            {sessions.map((s: SessionInfo) => (
                                <div
                                    key={s.id}
                                    className={`${styles.sessionCard} ${s.is_current ? styles.currentSession : ""}`}
                                >
                                    <div className={styles.sessionInfo}>
                                        <span className={styles.sessionDevice}>
                                            {formatDevice(s.user_agent)}
                                            {s.is_current && (
                                                <span className={styles.currentBadge}>Αυτή η συνεδρία</span>
                                            )}
                                        </span>
                                        <span className={styles.sessionMeta}>
                                            IP: {s.ip_address || "—"} · Τελευταία δραστηριότητα:{" "}
                                            {formatDate(s.last_activity_at)}
                                        </span>
                                    </div>
                                    {!s.is_current && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => handleRevoke(s.id)}
                                            loading={revokeSession.isPending}
                                            disabled={revokeSession.isPending}
                                        >
                                            Τερμάτισε
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                        {sessions.length === 0 && !isLoading && (
                            <p className={styles.emptyHint}>Δεν βρέθηκαν ενεργές συνεδρίες.</p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
