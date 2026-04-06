import { useState, useEffect, useRef } from "react";
import { Building2, Upload, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyProfile from "@/hooks/useCompanyProfile";
import LoadingSpinner from "@/components/LoadingSpinner";
import Button from "@/components/reusable/Button";
import styles from "./CompanyBranding.module.css";

export default function CompanyBranding() {
    const { showToast } = useAuth();
    const { company, isLoading, updateBranding, uploadLogo } = useCompanyProfile();
    const [logoUrl, setLogoUrl] = useState("");
    const [isUploading, setIsUploading] = useState(false);
    const [isHydrated, setIsHydrated] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setLogoUrl(company?.logo_url || "");
    }, [company?.logo_url]);

    useEffect(() => {
        if (company) setIsHydrated(true);
    }, [company]);

    const hasChanges = isHydrated && !!company && (logoUrl.trim() !== (company.logo_url || ""));

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
            const url = await uploadLogo.mutateAsync(file);
            setLogoUrl(url);
            // showToast({ message: "Η εικόνα προστέθηκε. Πατήστε Αποθήκευση για να την εφαρμόσετε.", type: "success" });
        } catch (e) {
            showToast({ message: (e as Error).message, type: "error" });
        } finally {
            setIsUploading(false);
            e.target.value = "";
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await updateBranding.mutateAsync({
                logo_url: logoUrl.trim() || null,
            });
            showToast({ message: "Το branding ενημερώθηκε", type: "success" });
        } catch (e) {
            showToast({ message: (e as Error).message, type: "error" });
        }
    };

    const handleRemoveLogo = () => {
        setLogoUrl("");
    };

    if (isLoading || !company) {
        return (
            <div className={styles.wrapper}>
                <LoadingSpinner />
            </div>
        );
    }

    return (
        <div className={styles.wrapper}>
            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Λογότυπο</h3>
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.logoPreview}>
                        {logoUrl.trim() ? (
                            <img
                                src={logoUrl.trim()}
                                alt="Company logo"
                                className={styles.logoImg}
                            />
                        ) : (
                            <div className={styles.logoPlaceholder}>
                                <Building2 size={48} />
                                <span>Δεν υπάρχει λογότυπο</span>
                            </div>
                        )}
                    </div>
                    <div className={styles.field}>
                        <label className={styles.uploadLabel}>Μεταφόρτωση από συσκευή</label>
                        <div className={styles.uploadRow}>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/gif,image/webp"
                                onChange={handleFileSelect}
                                className={styles.fileInput}
                            />
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => fileInputRef.current?.click()}
                                loading={isUploading}
                                disabled={isUploading}
                            >
                                <><Upload size={16} /> Επιλογή αρχείου</>
                            </Button>
                            {logoUrl.trim() && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleRemoveLogo}
                                >
                                    <><Trash2 size={16} /> Αφαίρεση</>
                                </Button>
                            )}
                        </div>
                        <p className={styles.fieldHint}>
                            Επιτρέπονται εικόνες JPEG, PNG, GIF, WebP (μέγ. 2MB).
                        </p>
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="logo_url">Ή URL λογότυπου</label>
                        <input
                            id="logo_url"
                            type="url"
                            value={logoUrl}
                            onChange={(e) => setLogoUrl(e.target.value)}
                            placeholder="https://example.com/logo.png"
                        />
                    </div>
                    <div className={styles.formActions}>
                        <Button
                            type="submit"
                            variant="primary"
                            loading={updateBranding.isPending}
                            disabled={!hasChanges || updateBranding.isPending}
                        >
                            Αποθήκευση
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
