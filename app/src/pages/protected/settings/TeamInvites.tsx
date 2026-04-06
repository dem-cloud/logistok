import { useState } from "react";
import { Mail, Send, Clock, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import useInvitations from "@/hooks/useInvitations";
import useRoles from "@/hooks/useRoles";
import LoadingSpinner from "@/components/LoadingSpinner";
import Button from "@/components/reusable/Button";
import styles from "./TeamInvites.module.css";

export default function TeamInvites() {
    const { showToast } = useAuth();
    const { invitations, isLoading, invite, revoke } = useInvitations();
    const { roles } = useRoles();

    const [email, setEmail] = useState("");
    const [roleId, setRoleId] = useState("");

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = email.trim();
        if (!trimmed) {
            showToast({ message: "Εισάγετε email", type: "warning" });
            return;
        }
        if (!roleId) {
            showToast({ message: "Επιλέξτε ρόλο", type: "warning" });
            return;
        }
        try {
            await invite.mutateAsync({ email: trimmed, role_id: roleId });
            showToast({ message: "Η πρόσκληση στάλθηκε", type: "success" });
            setEmail("");
            setRoleId("");
        } catch (e) {
            showToast({ message: (e as Error).message, type: "error" });
        }
    };

    const handleRevoke = async (invitationId: string) => {
        try {
            await revoke.mutateAsync(invitationId);
            showToast({ message: "Η πρόσκληση ακυρώθηκε", type: "success" });
        } catch (e) {
            showToast({ message: (e as Error).message, type: "error" });
        }
    };

    const formatDate = (d: string) => {
        const date = new Date(d);
        return date.toLocaleDateString("el-GR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

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
                <h3 className={styles.sectionTitle}>Νέα πρόσκληση</h3>
                <form onSubmit={handleInvite} className={styles.inviteForm}>
                    <div className={styles.formRow}>
                        <div className={styles.field}>
                            <label>Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="synaedelfos@example.com"
                            />
                        </div>
                        <div className={styles.field}>
                            <label>Ρόλος</label>
                            <select
                                value={roleId}
                                onChange={(e) => setRoleId(e.target.value)}
                                required
                            >
                                <option value="">Επιλέξτε ρόλο</option>
                                {roles.map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {r.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <Button
                        type="submit"
                        variant="primary"
                        loading={invite.isPending}
                        disabled={!email.trim() || !roleId || roles.length === 0}
                    >
                        <Send size={18} />
                        Αποστολή πρόσκλησης
                    </Button>
                </form>
            </div>

            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Εκκρεμείς προσκλήσεις</h3>
                {invitations.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Mail size={40} className={styles.emptyIcon} />
                        <p>Δεν υπάρχουν εκκρεμείς προσκλήσεις</p>
                    </div>
                ) : (
                    <div className={styles.inviteList}>
                        {invitations.map((inv) => (
                            <div
                                key={inv.id}
                                className={`${styles.inviteCard} ${
                                    isExpired(inv.expires_at) ? styles.expired : ""
                                }`}
                            >
                                <div className={styles.inviteLeft}>
                                    <div className={styles.inviteMain}>
                                        <span className={styles.inviteEmail}>{inv.invited_email}</span>
                                        <span className={styles.inviteRole}>{inv.role?.name || "—"}</span>
                                    </div>
                                    <div className={styles.inviteMeta}>
                                        <Clock size={14} />
                                        <span>
                                            {isExpired(inv.expires_at)
                                                ? "Έληξε"
                                                : `Λήγει ${formatDate(inv.expires_at)}`}
                                        </span>
                                    </div>
                                </div>
                                {inv.status === "pending" && (
                                    <Button
                                        variant="secondary"
                                        onClick={() => handleRevoke(inv.id)}
                                        loading={revoke.isPending}
                                        disabled={revoke.isPending}
                                    >
                                        <XCircle size={16} />
                                        Ακύρωση
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
