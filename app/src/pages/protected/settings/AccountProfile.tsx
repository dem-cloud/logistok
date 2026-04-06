import { useState, useEffect, useRef } from "react";
import { User, Upload, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import LoadingSpinner from "@/components/LoadingSpinner";
import Button from "@/components/reusable/Button";
import styles from "./AccountProfile.module.css";

export default function AccountProfile() {
    const { showToast } = useAuth();
    const { user, updateProfile, uploadAvatar } = useUserProfile();
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [phone, setPhone] = useState("");
    const [avatarUrl, setAvatarUrl] = useState("");
    const [isUploading, setIsUploading] = useState(false);
    const [isHydrated, setIsHydrated] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (user) {
            setFirstName(user.first_name || "");
            setLastName(user.last_name || "");
            setPhone(user.phone || "");
            setAvatarUrl(user.avatar_url || "");
        }
    }, [user]);

    useEffect(() => {
        if (user) setIsHydrated(true);
    }, [user]);

    const hasChanges =
        isHydrated &&
        !!user &&
        (
            (firstName.trim() !== (user.first_name || "")) ||
            (lastName.trim() !== (user.last_name || "")) ||
            (phone.trim() !== (user.phone || "")) ||
            (avatarUrl !== (user.avatar_url || ""))
        );

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            showToast({ message: "Επιλέξτε μόνο αρχεία εικόνας (JPEG, PNG, GIF, WebP)", type: "error" });
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            showToast({ message: "Μέγιστο μέγεθος αρχείου: 2MB", type: "error" });
            return;
        }
        setIsUploading(true);
        try {
            const url = await uploadAvatar.mutateAsync(file);
            setAvatarUrl(url);
            // showToast({ message: "Η εικόνα προστέθηκε. Πατήστε Αποθήκευση για να την εφαρμόσετε.", type: "success" });
        } catch (e) {
            showToast({ message: (e as Error).message, type: "error" });
        } finally {
            setIsUploading(false);
            e.target.value = "";
        }
    };

    const handleRemoveAvatar = () => {
        setAvatarUrl("");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await updateProfile.mutateAsync({
                first_name: firstName.trim() || null,
                last_name: lastName.trim() || null,
                phone: phone.trim() || null,
                avatar_url: avatarUrl.trim() || null,
            });
            showToast({ message: "Το προφίλ ενημερώθηκε", type: "success" });
        } catch (e) {
            showToast({ message: (e as Error).message, type: "error" });
        }
    };

    if (!user) {
        return (
            <div className={styles.wrapper}>
                <LoadingSpinner />
            </div>
        );
    }

    const displayAvatar = avatarUrl;

    return (
        <div className={styles.wrapper}>
            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Προφίλ</h3>
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.avatarSection}>
                        <div className={styles.avatarPreview}>
                            {displayAvatar ? (
                                <img src={displayAvatar} alt="Avatar" className={styles.avatarImg} />
                            ) : (
                                <div className={styles.avatarPlaceholder}>
                                    <User size={48} />
                                    <span>Δεν υπάρχει φωτογραφία</span>
                                </div>
                            )}
                        </div>
                        <div className={styles.avatarActions}>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/gif,image/webp"
                                onChange={handleFileSelect}
                                className={styles.fileInput}
                            />
                            <div className={styles.avatarButtons}>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => fileInputRef.current?.click()}
                                    loading={isUploading}
                                    disabled={isUploading}
                                >
                                    <><Upload size={16} /> Επιλογή αρχείου</>
                                </Button>
                                {avatarUrl && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={handleRemoveAvatar}
                                    >
                                        <><Trash2 size={16} /> Αφαίρεση</>
                                    </Button>
                                )}
                            </div>
                            <p className={styles.fieldHint}>JPEG, PNG, GIF, WebP (μέγ. 2MB)</p>
                        </div>
                    </div>
                    <div className={styles.formRow}>
                        <div className={styles.field}>
                            <label htmlFor="first_name">Όνομα</label>
                            <input
                                id="first_name"
                                type="text"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                placeholder="Όνομα"
                            />
                        </div>
                        <div className={styles.field}>
                            <label htmlFor="last_name">Επώνυμο</label>
                            <input
                                id="last_name"
                                type="text"
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                placeholder="Επώνυμο"
                            />
                        </div>
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="phone">Τηλέφωνο</label>
                        <input
                            id="phone"
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="+30 210 1234567"
                        />
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            value={user.email || ""}
                            readOnly
                            className={styles.readOnly}
                        />
                        {/* <p className={styles.fieldHint}>Το email δεν μπορεί να αλλάξει από εδώ.</p> */}
                    </div>
                    <div className={styles.formActions}>
                        <Button
                            type="submit"
                            variant="primary"
                            loading={updateProfile.isPending}
                            disabled={!hasChanges || updateProfile.isPending}
                        >
                            Αποθήκευση
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
