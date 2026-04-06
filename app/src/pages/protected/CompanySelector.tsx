import styles from './CompanySelector.module.css';
import { Crown, Hourglass, Check } from "lucide-react";
import Spinner from "@/components/Spinner";
import { useAuth } from "@/contexts/AuthContext";
import useMyInvitations from "@/hooks/useMyInvitations";
import { CompanySessionInfo } from "@/types/auth.types";

export default function CompanySelector() {
    const {
        companies,
        setCompanies,
        createCompany,
        selectCompany,
        showToast,
        me,
    } = useAuth();

    const {
        invitations,
        accept: acceptInvitation,
        reject: rejectInvitation,
    } = useMyInvitations();

    const getRoleSummary = (company: CompanySessionInfo): string => {
        if (company.membership.role) {
            return company.membership.role.name;
        }
        if (company.stores.length === 1) {
            return company.stores[0].role.name;
        }
        const uniqueRoles = [...new Set(company.stores.map(s => s.role.key))];
        if (uniqueRoles.length === 1) {
            return company.stores[0].role.name;
        }
        const roleNames = [...new Set(company.stores.map(s => s.role.name))];
        return roleNames.join(", ");
    };

    const handleAcceptInvitation = async (invitationId: string) => {
        try {
            await acceptInvitation.mutateAsync(invitationId);
            const { companies: refreshedCompanies } = await me();
            setCompanies(refreshedCompanies);
            showToast({ message: "Η πρόσκληση αποδεχτήθηκε", type: "success" });
        } catch (err) {
            showToast({
                message: (err as Error).message || "Κάτι πήγε στραβά",
                type: "error",
            });
        }
    };

    const handleRejectInvitation = async (invitationId: string) => {
        try {
            await rejectInvitation.mutateAsync(invitationId);
            showToast({ message: "Η πρόσκληση απορρίφθηκε", type: "success" });
        } catch (err) {
            showToast({
                message: (err as Error).message || "Κάτι πήγε στραβά",
                type: "error",
            });
        }
    };

    return (
        <div className={styles.wrapper}>
            <header className={styles.header}>
                <div className={styles.titleWrapper}>
                    <p className={styles.eyebrow}>Επιλογή εταιρείας</p>
                    <h1 className={styles.title}>Οι εταιρείες μου</h1>
                </div>
            </header>

            {invitations.length > 0 && (
                <section className={styles.invitationsSection}>
                    <h2 className={styles.invitationsTitle}>
                        Προσκλήσεις
                        <span className={styles.invitationsTitleBadge}>{invitations.length}</span>
                    </h2>
                    <div className={styles.invitationsList}>
                        {invitations.map((invitation) => (
                            <div key={invitation.id} className={styles.invitationCard}>
                                <div className={styles.invitationAvatar}>
                                    {invitation.company?.name?.charAt(0) || "?"}
                                </div>
                                <div className={styles.invitationBody}>
                                    <div className={styles.invitationTop}>
                                        <p className={styles.invitationCompanyName}>
                                            {invitation.company?.name || "Εταιρεία"}
                                        </p>
                                    </div>
                                    <div className={styles.invitationMeta}>
                                        <span className={styles.invitationRole}>
                                            {invitation.role?.name || "Ρόλος"}
                                        </span>
                                    </div>
                                </div>
                                <div className={styles.invitationActions}>
                                    <button
                                        className={styles.acceptButton}
                                        onClick={() => handleAcceptInvitation(invitation.id)}
                                        disabled={acceptInvitation.isPending}
                                    >
                                        {acceptInvitation.isPending ? (
                                            <>
                                                <Spinner size={14} />
                                                <span>Αποδοχή...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Check size={14} />
                                                <span>Αποδοχή</span>
                                            </>
                                        )}
                                    </button>
                                    <button
                                        className={styles.rejectButton}
                                        onClick={() => handleRejectInvitation(invitation.id)}
                                        disabled={rejectInvitation.isPending}
                                    >
                                        {rejectInvitation.isPending ? (
                                            <>
                                                <Spinner size={14} />
                                                <span>Απόρριψη...</span>
                                            </>
                                        ) : (
                                            <span>Απόρριψη</span>
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <div className={styles.grid}>
                {companies.length > 0 &&
                    companies.map((company) => {
                        const isOwner = company.membership.is_owner;
                        const isOnboarding = !company.onboarding.is_completed;
                        const isDisabled =
                            !isOwner &&
                            (company.membership.status !== "active" || isOnboarding);

                        return (
                            <button
                                key={company.id}
                                className={`${styles.card} ${isDisabled ? styles.cardDisabled : ""}`}
                                onClick={() => !isDisabled && selectCompany(company.id)}
                                disabled={isDisabled}
                            >
                                <div className={styles.avatarWrapper}>
                                    <div className={styles.avatar}>
                                        {company.name.charAt(0)}
                                    </div>
                                    {isOnboarding ? (
                                        <span
                                            className={`${styles.statusIndicator} ${styles.statusIndicatorOnboarding}`}
                                            title="Σε διαδικασία εγκατάστασης"
                                        />
                                    ) : (
                                        <span
                                            className={`${styles.statusIndicator} ${styles.statusIndicatorActive}`}
                                            title="Ενεργή εταιρεία"
                                        />
                                    )}
                                </div>
                                <div className={styles.cardBody}>
                                    <div className={styles.cardTop}>
                                        <p className={styles.cardTitle}>{company.name}</p>
                                        <div className={styles.cardIcons}>
                                            {isOwner && (
                                                <span
                                                    className={styles.ownerIcon}
                                                    title="Ιδιοκτήτης"
                                                >
                                                    <Crown size={16} />
                                                </span>
                                            )}
                                            {isOnboarding && (
                                                <span
                                                    className={styles.onboardingIcon}
                                                    title="Σε διαδικασία εγκατάστασης"
                                                >
                                                    <Hourglass size={16} />
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <p className={styles.cardSubtitle}>
                                        {getRoleSummary(company)}
                                    </p>
                                </div>
                            </button>
                        );
                    })}

                {(() => {
                    const hasOnboardingCompany = companies.some(
                        (c) => !c.onboarding.is_completed
                    );
                    return (
                        <button
                            className={`${styles.card} ${styles.dashed} ${
                                hasOnboardingCompany ? styles.cardDisabled : ""
                            }`}
                            onClick={() => !hasOnboardingCompany && createCompany()}
                            disabled={hasOnboardingCompany}
                            title={
                                hasOnboardingCompany
                                    ? "Υπάρχει μη ολοκληρωμένη εταιρεία. Ολοκληρώστε πρώτα την εγκατάσταση."
                                    : ""
                            }
                        >
                            <div className={styles.avatarGhost}>+</div>
                            <div className={styles.cardBody}>
                                <p className={styles.cardTitle}>Νέα εταιρεία</p>
                                <p className={styles.cardSubtitleMuted}>
                                    Δημιουργήστε εταιρεία
                                </p>
                            </div>
                        </button>
                    );
                })()}
            </div>
        </div>
    );
}
