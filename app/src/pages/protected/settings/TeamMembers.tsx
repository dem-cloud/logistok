import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus, Pencil, Trash2, UserX, UserCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyMembers from "@/hooks/useCompanyMembers";
import useRoles, { Role } from "@/hooks/useRoles";
import { usePermissions } from "@/hooks/usePermissions";
import LoadingSpinner from "@/components/LoadingSpinner";
import Button from "@/components/reusable/Button";
import styles from "./TeamMembers.module.css";

export default function TeamMembers() {
    const navigate = useNavigate();
    const { showToast } = useAuth();
    const { can, isOwner } = usePermissions();
    const canInvite = isOwner || can("users.invite");
    const canEditMembers = isOwner || can("users.edit");
    const { members, isLoading, updateMemberRole, removeMember, disableMember, reactivateMember, transferOwnership } = useCompanyMembers();
    const { roles } = useRoles();

    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [editingRoleId, setEditingRoleId] = useState<string>("");
    const [editingMakeOwner, setEditingMakeOwner] = useState<boolean>(false);
    const [removeConfirm, setRemoveConfirm] = useState<{ id: string; name: string } | null>(null);

    const handleRoleChange = async () => {
        if (!editingUserId) return;
        try {
            if (editingMakeOwner) {
                await transferOwnership.mutateAsync(editingUserId);
                showToast({ message: "Η μεταβίβαση ownership ολοκληρώθηκε", type: "success" });
            } else {
                if (!editingRoleId) return;
                await updateMemberRole.mutateAsync({ userId: editingUserId, role_id: editingRoleId });
                showToast({ message: "Ο ρόλος ενημερώθηκε", type: "success" });
            }
            setEditingUserId(null);
            setEditingMakeOwner(false);
        } catch (e) {
            showToast({ message: (e as Error).message, type: "error" });
        }
    };

    const handleRemove = async () => {
        if (!removeConfirm) return;
        try {
            await removeMember.mutateAsync(removeConfirm.id);
            showToast({ message: "Το μέλος αφαιρέθηκε", type: "success" });
            setRemoveConfirm(null);
        } catch (e) {
            showToast({ message: (e as Error).message, type: "error" });
        }
    };

    const getDisplayName = (m: { user: { first_name?: string | null; last_name?: string | null; email?: string | null } }) => {
        const first = m.user?.first_name?.trim();
        const last = m.user?.last_name?.trim();
        if (first || last) return `${first || ""} ${last || ""}`.trim();
        return m.user?.email || "—";
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
            <div className={styles.header}>
                <p className={styles.description}>
                    Διαχειριστείτε τα μέλη της ομάδας και τις ρόλους τους.
                </p>
                <Button
                    variant="primary"
                    onClick={() => canInvite && navigate("/settings/team/invites")}
                    disabled={!canInvite}
                >
                    <UserPlus size={18} />
                    Πρόσκληση
                </Button>
            </div>

            <div className={styles.tableWrap}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Μέλος</th>
                            <th>Email</th>
                            <th>Ρόλος</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {members.map((member) => {
                            const memberIsOwner = member.is_owner;

                            return (
                                <tr key={member.id}>
                                    <td>
                                        <span className={styles.memberName}>{getDisplayName(member)}</span>
                                        {memberIsOwner && <span className={styles.ownerBadge}>Owner</span>}
                                        {member.status === "disabled" && (
                                            <span className={styles.disabledBadge}>Ανενεργός</span>
                                        )}
                                    </td>
                                    <td className={styles.email}>{member.user?.email || "—"}</td>
                                    <td>
                                        {editingUserId === member.user_id ? (
                                            <div className={styles.roleEdit}>
                                                <select
                                                    value={editingRoleId}
                                                    onChange={(e) => setEditingRoleId(e.target.value)}
                                                    className={styles.select}
                                                    disabled={editingMakeOwner}
                                                >
                                                    {(isOwner ? roles : roles.filter((r) => r.key !== "admin")).map((r: Role) => (
                                                        <option key={r.id} value={r.id}>
                                                            {r.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                {isOwner && (
                                                    <label className={styles.checkboxLabel}>
                                                        <input
                                                            type="checkbox"
                                                            checked={editingMakeOwner}
                                                            onChange={(e) => setEditingMakeOwner(e.target.checked)}
                                                        />
                                                        <span>Ιδιοκτήτης</span>
                                                    </label>
                                                )}
                                                <button
                                                    className={styles.btnSave}
                                                    onClick={handleRoleChange}
                                                    disabled={updateMemberRole.isPending || transferOwnership.isPending}
                                                >
                                                    Αποθήκευση
                                                </button>
                                                <button
                                                    className={styles.btnCancel}
                                                    onClick={() => {
                                                        setEditingUserId(null);
                                                        setEditingMakeOwner(false);
                                                    }}
                                                >
                                                    Ακύρωση
                                                </button>
                                            </div>
                                        ) : (
                                            <span className={styles.roleName}>
                                                {member.role?.name || "—"}
                                            </span>
                                        )}
                                    </td>
                                    <td className={styles.actions}>
                                        <div className={styles.actionsCell}>
                                            {canEditMembers && !member.is_owner && editingUserId !== member.user_id && (
                                                member.status === "disabled" ? (
                                                    <>
                                                        <button
                                                            className={styles.iconBtn}
                                                            onClick={async () => {
                                                                try {
                                                                    await reactivateMember.mutateAsync(member.user_id);
                                                                    showToast({ message: "Το μέλος επανενεργοποιήθηκε", type: "success" });
                                                                } catch (e) {
                                                                    showToast({ message: (e as Error).message, type: "error" });
                                                                }
                                                            }}
                                                            disabled={reactivateMember.isPending}
                                                            title="Επανενεργοποίηση"
                                                        >
                                                            <UserCheck size={16} />
                                                        </button>
                                                        {isOwner && (
                                                            <button
                                                                className={styles.iconBtnDanger}
                                                                onClick={() =>
                                                                    setRemoveConfirm({
                                                                        id: member.user_id,
                                                                        name: getDisplayName(member),
                                                                    })
                                                                }
                                                                title="Οριστική αφαίρεση"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            className={styles.iconBtn}
                                                    onClick={() => {
                                                        setEditingUserId(member.user_id);
                                                        setEditingRoleId(member.role?.id || "");
                                                        setEditingMakeOwner(false);
                                                    }}
                                                            title="Αλλαγή ρόλου"
                                                        >
                                                            <Pencil size={16} />
                                                        </button>
                                                        <button
                                                            className={styles.iconBtn}
                                                            onClick={async () => {
                                                                try {
                                                                    await disableMember.mutateAsync(member.user_id);
                                                                    showToast({ message: "Το μέλος απενεργοποιήθηκε", type: "success" });
                                                                } catch (e) {
                                                                    showToast({ message: (e as Error).message, type: "error" });
                                                                }
                                                            }}
                                                            disabled={disableMember.isPending}
                                                            title="Απενεργοποίηση"
                                                        >
                                                            <UserX size={16} />
                                                        </button>
                                                        {isOwner && (
                                                            <button
                                                                className={styles.iconBtnDanger}
                                                                onClick={() =>
                                                                    setRemoveConfirm({
                                                                        id: member.user_id,
                                                                        name: getDisplayName(member),
                                                                    })
                                                                }
                                                                title="Οριστική αφαίρεση"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        )}
                                                    </>
                                                )
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {members.length === 0 && (
                <div className={styles.emptyState}>
                    <p>Δεν υπάρχουν μέλη. Προσκαλέστε συναδέλφους από την καρτέλα Προσκλήσεις.</p>
                    <Button
                        variant="primary"
                        onClick={() => canInvite && navigate("/settings/team/invites")}
                        disabled={!canInvite}
                    >
                        Πρόσκληση
                    </Button>
                </div>
            )}

            {removeConfirm && (
                <div className={styles.modalOverlay} onClick={() => setRemoveConfirm(null)}>
                    <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
                        <h4>Αφαίρεση μέλους</h4>
                        <p>
                            Θέλετε να αφαιρέσετε το μέλος &quot;{removeConfirm.name}&quot; από την εταιρεία;
                        </p>
                        <div className={styles.confirmActions}>
                            <Button variant="outline" onClick={() => setRemoveConfirm(null)}>
                                Ακύρωση
                            </Button>
                            <Button variant="danger" onClick={handleRemove} loading={removeMember.isPending}>
                                Αφαίρεση
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
