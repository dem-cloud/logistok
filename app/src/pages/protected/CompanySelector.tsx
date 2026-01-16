import { useEffect, useState } from "react";
import Spinner from "../../components/Spinner";
import styles from './CompanySelector.module.css';
import { Crown, Hourglass } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { CompanySessionInfo } from "@/types/auth.types";


type Invitation = {
  id: string;
  companyId: string;
  companyName: string;
  role: string;
  invitedBy?: string;
};

export default function CompanySelector() {

    const { 
        companies,
        setCompanies,
        createCompany,
        selectCompany,
        showToast
    } = useAuth();

    const [invitations, setInvitations] = useState<Invitation[]>([]);

    const getRoleSummary = (company: CompanySessionInfo): string => {
        // Case 1: Has company-level role (applies to all stores)
        // This includes owners with "Admin" role
        if (company.membership.role) {
            return company.membership.role.name;
        }

        // Case 2: Single store-specific role
        if (company.stores.length === 1) {
            return company.stores[0].role.name;
        }

        // Case 3: Multiple stores - check if all have same role
        const uniqueRoles = [...new Set(company.stores.map(s => s.role.key))];
        
        if (uniqueRoles.length === 1) {
            // All stores have the same role
            return company.stores[0].role.name;
        }

        // Case 4: Multiple different roles
        const roleNames = [...new Set(company.stores.map(s => s.role.name))];
        return roleNames.join(", ");
    };

    const fetchInvitations = async () => {
        try {
            // const invitationsData = await fetchInvitations();
            // setInvitations(invitationsData);
            
            // Demo invitations (αφαιρέστε όταν έχετε API)
            setInvitations([
                { id: '1', companyId: 'comp1', companyName: 'TechCorp', role: 'Manager', invitedBy: 'John Doe' },
                { id: '2', companyId: 'comp2', companyName: 'StartupXYZ', role: 'Developer' },
            ]);

        } catch (err) {
            showToast({message: "Κάτι πήγε στραβά", type: "error"})
            // Αν κάτι πάει στραβά → logout
            // forceLogout();
        }
    }

    useEffect(() => {
        fetchInvitations();
    }, []);


    const handleAcceptInvitation = async (invitationId: string, companyId: string) => {
        try {
            // API call για αποδοχή
            // await acceptInvitation(invitationId);
            
            // Αφαιρούμε το invitation από τη λίστα
            setInvitations(prev => prev.filter(inv => inv.id !== invitationId));
            
            // Προαιρετικά: refresh companies list
            // const { companies } = await me();
            // setCompanies(companies);
            
            // Προαιρετικά: auto-select την εταιρεία
            // selectCompany(companyId);
        } catch (err) {
            console.error('Error accepting invitation:', err);
        }
    };

    const handleRejectInvitation = async (invitationId: string) => {
        try {
            // API call για απόρριψη
            // await rejectInvitation(invitationId);
            
            // Αφαιρούμε το invitation από τη λίστα
            setInvitations(prev => prev.filter(inv => inv.id !== invitationId));
        } catch (err) {
            console.error('Error rejecting invitation:', err);
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
                                    {invitation.companyName.charAt(0)}
                                </div>
                                <div className={styles.invitationBody}>
                                    <div className={styles.invitationTop}>
                                        <p className={styles.invitationCompanyName}>
                                            {invitation.companyName}
                                        </p>
                                    </div>
                                    <div className={styles.invitationMeta}>
                                        <span className={styles.invitationRole}>
                                            {invitation.role}
                                        </span>
                                        {invitation.invitedBy && (
                                            <>
                                                <span className={styles.invitationSeparator}>•</span>
                                                <span className={styles.invitationInvitedBy}>
                                                    Προσκλήθηκε από {invitation.invitedBy}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className={styles.invitationActions}>
                                    <button
                                        className={styles.acceptButton}
                                        onClick={() => handleAcceptInvitation(invitation.id, invitation.companyId)}
                                    >
                                        Αποδοχή
                                    </button>
                                    <button
                                        className={styles.rejectButton}
                                        onClick={() => handleRejectInvitation(invitation.id)}
                                    >
                                        Απόρριψη
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <div className={styles.grid}>
                {
                    companies.length > 0 && companies.map((company) => {
                        const isOwner = company.membership.is_owner;
                        const isOnboarding = !company.onboarding.is_completed;
                        const isDisabled = !isOwner && (company.membership.status !== "active" || isOnboarding);
                        
                        return (
                            <button
                                key={company.id}
                                className={`${styles.card} ${isDisabled ? styles.cardDisabled : ''}`}
                                onClick={() => !isDisabled && selectCompany(company.id)}
                                disabled={isDisabled}
                            >
                                <div className={styles.avatarWrapper}>
                                    <div className={styles.avatar}>{company.name.charAt(0)}</div>
                                    {isOnboarding ? (
                                        <span className={`${styles.statusIndicator} ${styles.statusIndicatorOnboarding}`} title="Σε διαδικασία εγκατάστασης" />
                                    ) : (
                                        <span className={`${styles.statusIndicator} ${styles.statusIndicatorActive}`} title="Ενεργή εταιρεία" />
                                    )}
                                </div>
                                <div className={styles.cardBody}>
                                    <div className={styles.cardTop}>
                                        <p className={styles.cardTitle}>{company.name}</p>
                                        <div className={styles.cardIcons}>
                                          {isOwner && (
                                              <span className={styles.ownerIcon} title="Ιδιοκτήτης"><Crown size={16} /></span>
                                          )}
                                          {isOnboarding && (
                                              <span className={styles.onboardingIcon} title="Σε διαδικασία εγκατάστασης"><Hourglass size={16} /></span>
                                          )}
                                      </div>
                                    </div>
                                    <p className={styles.cardSubtitle}>{getRoleSummary(company)}</p>
                                </div>
                            </button>
                        );
                  })
                }

                {(() => {
                    const hasOnboardingCompany = companies.some(c => !c.onboarding.is_completed);
                    
                    return (
                        <button 
                            className={`${styles.card} ${styles.dashed} ${hasOnboardingCompany ? styles.cardDisabled : ''}`}
                            onClick={() => !hasOnboardingCompany && createCompany()}
                            disabled={hasOnboardingCompany}
                            title={hasOnboardingCompany ? "Υπάρχει μη ολοκληρωμένη εταιρεία. Ολοκληρώστε πρώτα την εγκατάσταση." : ""}
                        >
                            <div className={styles.avatarGhost}>+</div>
                            <div className={styles.cardBody}>
                                <p className={styles.cardTitle}>Νέα εταιρεία</p>
                                <p className={styles.cardSubtitleMuted}>Δημιουργήστε εταιρεία</p>
                            </div>
                        </button>
                    );
                })()}
            </div>
        </div>
    );
}
