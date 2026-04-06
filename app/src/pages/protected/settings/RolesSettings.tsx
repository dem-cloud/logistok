import { useState, useEffect } from "react";
import { Shield, Plus, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import useRoles, { Role } from "@/hooks/useRoles";
import useDefaultRoles from "@/hooks/useDefaultRoles";
import usePermissionsList from "@/hooks/usePermissionsList";
import useCompanyMembers from "@/hooks/useCompanyMembers";
import LoadingSpinner from "@/components/LoadingSpinner";
import Button from "@/components/reusable/Button";
import SidePopup from "@/components/reusable/SidePopup";
import styles from "./RolesSettings.module.css";

export default function RolesSettings() {
    const { showToast } = useAuth();
    const { roles, isLoading, createFromTemplate, createCustom, updateRole, updatePermissions, deleteRole } = useRoles();
    const { defaultRoles } = useDefaultRoles();
    const { data: permissionsByModule, isLoading: permsLoading } = usePermissionsList();
    const { members } = useCompanyMembers();

    const [createOpen, setCreateOpen] = useState(false);
    const [createMode, setCreateMode] = useState<"template" | "custom">("template");
    const [selectedTemplate, setSelectedTemplate] = useState<string>("");
    const [templatePerms, setTemplatePerms] = useState<string[]>([]);
    const [templateVariantName, setTemplateVariantName] = useState("");
    const [customName, setCustomName] = useState("");
    const [customPerms, setCustomPerms] = useState<string[]>([]);

    // When template changes, pre-fill permission matrix from that template
    useEffect(() => {
        const t = defaultRoles.find((r) => r.key === selectedTemplate);
        setTemplatePerms(t ? [...t.permission_keys] : []);
    }, [selectedTemplate, defaultRoles]);

    const [editOpen, setEditOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [editName, setEditName] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [editPerms, setEditPerms] = useState<string[]>([]);

    const [deleteConfirm, setDeleteConfirm] = useState<Role | null>(null);

    const memberCountByRole = (roleId: string) =>
        members.filter((m) => m.role?.id === roleId).length;

    const togglePermission = (key: string, list: string[], setter: (p: string[]) => void) => {
        if (list.includes(key)) setter(list.filter((k) => k !== key));
        else setter([...list, key]);
    };

    const toggleModuleAll = (moduleKeys: string[], list: string[], setter: (p: string[]) => void) => {
        const allInList = moduleKeys.every((k) => list.includes(k));
        if (allInList) setter(list.filter((k) => !moduleKeys.includes(k)));
        else setter([...new Set([...list, ...moduleKeys])]);
    };

    const closeCreatePopup = () => {
        setCreateOpen(false);
        setCreateMode("template");
        setSelectedTemplate("");
        setTemplatePerms([]);
        setTemplateVariantName("");
        setCustomName("");
        setCustomPerms([]);
    };

    const handleCreateFromTemplate = async () => {
        if (!selectedTemplate) {
            showToast({ message: "Επιλέξτε έναν ρόλο", type: "warning" });
            return;
        }
        try {
            await createFromTemplate.mutateAsync({
                default_role_key: selectedTemplate,
                permission_keys: templatePerms,
            });
            showToast({ message: "Ο ρόλος δημιουργήθηκε", type: "success" });
            closeCreatePopup();
        } catch (e) {
            showToast({ message: (e as Error).message, type: "error" });
        }
    };

    const handleCreateCustom = async () => {
        const name = customName.trim();
        if (!name) {
            showToast({ message: "Εισάγετε όνομα ρόλου", type: "warning" });
            return;
        }
        try {
            await createCustom.mutateAsync({
                name,
                permission_keys: customPerms,
            });
            showToast({ message: "Ο ρόλος δημιουργήθηκε", type: "success" });
            closeCreatePopup();
        } catch (e) {
            showToast({ message: (e as Error).message, type: "error" });
        }
    };

    const openEdit = (role: Role) => {
        setEditingRole(role);
        setEditName(role.name);
        setEditDescription(role.description || "");
        setEditPerms(role.permission_keys || []);
        setEditOpen(true);
    };

    const handleSaveEdit = async () => {
        if (!editingRole) return;
        try {
            if (editingRole.key !== "admin") {
                await updatePermissions.mutateAsync({
                    id: editingRole.id,
                    permission_keys: editPerms,
                });
            }
            await updateRole.mutateAsync({
                id: editingRole.id,
                name: editName,
                description: editDescription || undefined,
            });
            showToast({ message: "Ο ρόλος ενημερώθηκε", type: "success" });
            setEditOpen(false);
            setEditingRole(null);
        } catch (e) {
            showToast({ message: (e as Error).message, type: "error" });
        }
    };

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        try {
            await deleteRole.mutateAsync(deleteConfirm.id);
            showToast({ message: "Ο ρόλος διαγράφηκε", type: "success" });
            setDeleteConfirm(null);
        } catch (e) {
            showToast({ message: (e as Error).message, type: "error" });
        }
    };

    const PermissionMatrix = ({
        selected,
        onChange,
        disabled,
    }: {
        selected: string[];
        onChange: (keys: string[]) => void;
        disabled?: boolean;
    }) => {
        if (!permissionsByModule || permsLoading) return <div className={styles.loadingPerms}>Φόρτωση...</div>;
        const modules = Object.entries(permissionsByModule);
        return (
            <div className={styles.permissionMatrix}>
                {modules.map(([moduleKey, perms]) => {
                    const keys = perms.map((p) => p.key);
                    const allChecked = keys.every((k) => selected.includes(k));
                    const someChecked = keys.some((k) => selected.includes(k));
                    return (
                        <div key={moduleKey} className={styles.permissionModule}>
                            <label className={styles.moduleHeader}>
                                <input
                                    type="checkbox"
                                    checked={allChecked}
                                    ref={(el) => {
                                        if (el) el.indeterminate = someChecked && !allChecked;
                                    }}
                                    onChange={() => toggleModuleAll(keys, selected, onChange)}
                                    disabled={disabled}
                                />
                                <span className={styles.moduleName}>
                                    {moduleKey.charAt(0).toUpperCase() + moduleKey.slice(1)}
                                </span>
                            </label>
                            <div className={styles.permissionList}>
                                {perms.map((p) => (
                                    <label key={p.key} className={styles.permissionItem}>
                                        <input
                                            type="checkbox"
                                            checked={selected.includes(p.key)}
                                            onChange={() => togglePermission(p.key, selected, onChange)}
                                            disabled={disabled}
                                        />
                                        <span>{p.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
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
                    Διαχειριστείτε τους ρόλους και τα δικαιώματα πρόσβασης της εταιρείας.
                </p>
                <Button variant="primary" onClick={() => setCreateOpen(true)}>
                    <Plus size={18} />
                    Δημιουργία ρόλου
                </Button>
            </div>

            <div className={styles.rolesGrid}>
                {roles.map((role) => {
                    const memberCount = memberCountByRole(role.id);
                    const isAdmin = role.key === "admin";
                    const canDelete = !isAdmin && memberCount === 0;
                    return (
                        <div key={role.id} className={styles.roleCard}>
                            <div className={styles.roleIcon}>
                                <Shield size={22} />
                            </div>
                            <div className={styles.roleInfo}>
                                <h3 className={styles.roleName}>{role.name}</h3>
                                {role.description && (
                                    <p className={styles.roleDesc}>{role.description}</p>
                                )}
                                <div className={styles.roleMeta}>
                                    <span>{role.permission_keys?.length ?? 0} δικαιώματα</span>
                                    <span>{memberCount} μέλη</span>
                                </div>
                            </div>
                            <div className={styles.roleActions}>
                                <button
                                    className={styles.iconBtn}
                                    onClick={() => openEdit(role)}
                                    title="Επεξεργασία"
                                >
                                    <Pencil size={16} />
                                </button>
                                {canDelete && (
                                    <button
                                        className={styles.iconBtnDanger}
                                        onClick={() => setDeleteConfirm(role)}
                                        title="Διαγραφή"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {roles.length === 0 && (
                <div className={styles.emptyState}>
                    <Shield size={48} className={styles.emptyIcon} />
                    <p>Δεν υπάρχουν ρόλοι. Δημιουργήστε νέο ρόλο από πρότυπο ή προσαρμόστε δικαιώματα.</p>
                </div>
            )}

            {/* Create Role Popup */}
            <SidePopup
                isOpen={createOpen}
                onClose={closeCreatePopup}
                title="Δημιουργία ρόλου"
                width="520px"
                footerLeftButton={{ label: "Κλείσιμο", onClick: closeCreatePopup }}
                footerRightButton={
                    createMode === "template"
                        ? {
                              label: "Δημιουργία",
                              onClick: handleCreateFromTemplate,
                              loading: createFromTemplate.isPending,
                              disabled:
                                !selectedTemplate ||
                                (roles.some((r) => r.key === selectedTemplate) && !templateVariantName.trim()),
                          }
                        : {
                              label: "Δημιουργία",
                              onClick: handleCreateCustom,
                              loading: createCustom.isPending,
                              disabled: !customName.trim(),
                          }
                }
            >
                <div className={styles.createContent}>
                    <div className={styles.popupSection}>
                        <span className={styles.popupSectionTitle}>Τύπος ρόλου</span>
                        <div className={styles.modeTabs}>
                            <button
                                className={createMode === "template" ? styles.modeTabActive : styles.modeTab}
                                onClick={() => setCreateMode("template")}
                            >
                                Προεπιλεγμένος
                            </button>
                            <button
                                className={createMode === "custom" ? styles.modeTabActive : styles.modeTab}
                                onClick={() => setCreateMode("custom")}
                            >
                                Προσαρμοσμένος
                            </button>
                        </div>
                    </div>

                    {createMode === "template" && (
                        <>
                            <div className={styles.popupSection}>
                                <span className={styles.popupSectionTitle}>Επιλογή προτύπου</span>
                                <div className={styles.templateList}>
                                    {defaultRoles.map((t) => (
                                        <label key={t.key} className={styles.templateItem}>
                                            <input
                                                type="radio"
                                                name="template"
                                                value={t.key}
                                                checked={selectedTemplate === t.key}
                                                onChange={() => setSelectedTemplate(t.key)}
                                            />
                                            <span>{t.name}</span>
                                            {roles.some((r) => r.key === t.key) && (
                                                <span className={styles.templateUsedBadge}>χρησιμοποιείται</span>
                                            )}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            {selectedTemplate && roles.some((r) => r.key === selectedTemplate) && (
                                <div className={styles.popupSection}>
                                    <span className={styles.popupSectionTitle}>Όνομα παραλλαγής</span>
                                    <p className={styles.variantHint}>
                                        Το πρότυπο υπάρχει ήδη. Δώστε διαφορετικό όνομα για τη νέα παραλλαγή.
                                    </p>
                                    <div className={styles.field}>
                                        <input
                                            type="text"
                                            value={templateVariantName}
                                            onChange={(e) => setTemplateVariantName(e.target.value)}
                                            placeholder="π.χ. Υπεύθυνος Πωλήσεων"
                                        />
                                    </div>
                                </div>
                            )}
                            {selectedTemplate && (
                                <div className={styles.popupSection}>
                                    <span className={styles.popupSectionTitle}>Δικαιώματα</span>
                                    <div className={styles.permSection}>
                                        <PermissionMatrix
                                            selected={templatePerms}
                                            onChange={setTemplatePerms}
                                        />
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {createMode === "custom" && (
                        <>
                            <div className={styles.popupSection}>
                                <span className={styles.popupSectionTitle}>Λεπτομέρειες</span>
                                <div className={styles.field}>
                                    <label>Όνομα ρόλου</label>
                                    <input
                                        type="text"
                                        value={customName}
                                        onChange={(e) => setCustomName(e.target.value)}
                                        placeholder="π.χ. Βοηθός πωλήσεων"
                                    />
                                </div>
                            </div>
                            <div className={styles.popupSection}>
                                <span className={styles.popupSectionTitle}>Δικαιώματα</span>
                                <div className={styles.permSection}>
                                    <PermissionMatrix
                                        selected={customPerms}
                                        onChange={setCustomPerms}
                                    />
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </SidePopup>

            {/* Edit Role Popup */}
            <SidePopup
                isOpen={editOpen}
                onClose={() => {
                    setEditOpen(false);
                    setEditingRole(null);
                }}
                title={editingRole ? `Επεξεργασία: ${editingRole.name}` : ""}
                width="540px"
                footerLeftButton={{ label: "Κλείσιμο", onClick: () => setEditOpen(false) }}
                footerRightButton={{
                    label: "Αποθήκευση",
                    onClick: handleSaveEdit,
                    loading: updateRole.isPending || updatePermissions.isPending,
                }}
            >
                {editingRole && (
                    <div className={styles.editContent}>
                        <div className={styles.popupSection}>
                            <span className={styles.popupSectionTitle}>Πληροφορίες</span>
                            <div className={styles.field}>
                                <label>Όνομα</label>
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                />
                            </div>
                            <div className={styles.field}>
                                <label>Περιγραφή</label>
                                <input
                                    type="text"
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    placeholder="Προαιρετικό"
                                />
                            </div>
                        </div>
                        {editingRole.key !== "admin" && (
                            <div className={styles.popupSection}>
                                <span className={styles.popupSectionTitle}>Δικαιώματα</span>
                                <div className={styles.permSection}>
                                    <PermissionMatrix
                                        selected={editPerms}
                                        onChange={setEditPerms}
                                    />
                                </div>
                            </div>
                        )}
                        {editingRole.key === "admin" && (
                            <p className={styles.adminNote}>
                                Ο ρόλος Admin έχει πλήρη πρόσβαση. Δεν μπορούν να αλλάξουν τα δικαιώματά του.
                            </p>
                        )}
                    </div>
                )}
            </SidePopup>

            {/* Delete Confirmation */}
            {deleteConfirm && (
                <div className={styles.modalOverlay} onClick={() => setDeleteConfirm(null)}>
                    <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
                        <h4>Διαγραφή ρόλου</h4>
                        <p>
                            Θέλετε να διαγράψετε τον ρόλο &quot;{deleteConfirm.name}&quot;;
                        </p>
                        <div className={styles.confirmActions}>
                            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                                Ακύρωση
                            </Button>
                            <Button
                                variant="danger"
                                onClick={handleDelete}
                                loading={deleteRole.isPending}
                            >
                                Διαγραφή
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
