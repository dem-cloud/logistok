import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyProfile from "@/hooks/useCompanyProfile";
import { useIndustries } from "@/hooks/useIndustries";
import type { Industry } from "@/onboarding/types";
import LoadingSpinner from "@/components/LoadingSpinner";
import Button from "@/components/reusable/Button";
import styles from "./CompanyGeneral.module.css";

export default function CompanyGeneral() {
    const { showToast } = useAuth();
    const { company, industries, isLoading, updateGeneral, updateAllowNegativeStock } = useCompanyProfile();
    const { data: industriesList } = useIndustries();

    const [name, setName] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
    const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
    const [isHydrated, setIsHydrated] = useState(false);

    useEffect(() => {
        if (company) {
            setName(company.name || "");
            setDisplayName(company.display_name || "");
            setPhone(company.phone || "");
            setEmail(company.email || "");
        }
    }, [company]);

    useEffect(() => {
        setSelectedIndustries((prev) => {
            const a = [...prev].sort().join(",");
            const b = [...industries].sort().join(",");
            return a === b ? prev : industries;
        });
    }, [industries]);

    useEffect(() => {
        if (company && industries) setIsHydrated(true);
    }, [company, industries]);

    const handleIndustryToggle = (key: string) => {
        setSelectedIndustries((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
        );
    };

    const validate = () => {
        const next: Partial<Record<string, string>> = {};
        if (!name.trim()) next.name = "Το όνομα εταιρείας απαιτείται";
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            next.email = "Μη έγκυρη διεύθυνση email";
        }
        setErrors(next);
        return Object.keys(next).length === 0;
    };

    const hasChanges =
        isHydrated &&
        !!company &&
        (
            (name.trim() !== (company.name || "")) ||
            (displayName.trim() !== (company.display_name || "")) ||
            (phone.trim() !== (company.phone || "")) ||
            (email.trim() !== (company.email || "")) ||
            JSON.stringify([...selectedIndustries].sort()) !== JSON.stringify([...industries].sort())
        );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;
        try {
            await updateGeneral.mutateAsync({
                name: name.trim(),
                display_name: displayName.trim() || undefined,
                phone: phone.trim() || undefined,
                email: email.trim() || undefined,
                industries: selectedIndustries,
            });
            showToast({ message: "Οι γενικές πληροφορίες ενημερώθηκαν", type: "success" });
        } catch (e) {
            showToast({ message: (e as Error).message, type: "error" });
        }
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
                <h3 className={styles.sectionTitle}>Γενικά στοιχεία</h3>
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.formRow}>
                        <div className={styles.field}>
                            <label htmlFor="name">Επωνυμία εταιρείας *</label>
                            <input
                                id="name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Επωνυμία εταιρείας"
                                className={errors.name ? styles.inputError : ""}
                            />
                            {errors.name && <span className={styles.errorText}>{errors.name}</span>}
                        </div>
                        <div className={styles.field}>
                            <label htmlFor="display_name">Φιλική Ονομασία</label>
                            <input
                                id="display_name"
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="Όνομα για εμφάνιση"
                            />
                        </div>
                    </div>
                    <div className={styles.formRow}>
                        <div className={styles.field}>
                            <label htmlFor="phone">Τηλέφωνο</label>
                            <input
                                id="phone"
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="210 1234567"
                            />
                        </div>
                        <div className={styles.field}>
                            <label htmlFor="email">Email εταιρείας</label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="info@company.gr"
                                className={errors.email ? styles.inputError : ""}
                            />
                            {errors.email && <span className={styles.errorText}>{errors.email}</span>}
                        </div>
                    </div>
                    <div className={styles.field}>
                        <label>Κλάδοι δραστηριότητας</label>
                        <p className={styles.fieldHint}>
                            Επιλέξτε τους κλάδους που ταιριάζουν στην επιχείρησή σας (χρήσιμο για προτάσεις plugins στο Marketplace).
                        </p>
                        <div className={styles.industriesGrid}>
                            {industriesList?.map((ind: Industry) => (
                                <label key={ind.key} className={styles.checkboxLabel}>
                                    <input
                                        type="checkbox"
                                        checked={selectedIndustries.includes(ind.key)}
                                        onChange={() => handleIndustryToggle(ind.key)}
                                    />
                                    <span>{ind.name}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className={styles.formActions}>
                        <Button
                            type="submit"
                            variant="primary"
                            loading={updateGeneral.isPending}
                            disabled={!hasChanges || updateGeneral.isPending}
                        >
                            Αποθήκευση
                        </Button>
                    </div>
                </form>
            </div>
            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Ρυθμίσεις αποθέματος</h3>
                <div className={styles.toggleRow}>
                    <div className={styles.toggleLabel}>
                        <span className={styles.toggleTitle}>Επιτρεπή πώληση με μηδενικό απόθεμα</span>
                        <span className={styles.toggleDesc}>
                            Αν ενεργό, οι χρήστες με το δικαίωμα &quot;Πώληση κάτω από διαθέσιμο απόθεμα&quot; μπορούν να πωλούν ακόμα και όταν το απόθεμα είναι μηδενικό.
                        </span>
                    </div>
                    <label className={styles.switch}>
                        <input
                            type="checkbox"
                            checked={!!company?.allow_negative_stock}
                            disabled={updateAllowNegativeStock.isPending}
                            onChange={async (e) => {
                                const next = e.target.checked;
                                try {
                                    await updateAllowNegativeStock.mutateAsync(next);
                                    showToast({ message: "Η ρύθμιση ενημερώθηκε", type: "success" });
                                } catch (err) {
                                    showToast({ message: (err as Error).message, type: "error" });
                                }
                            }}
                        />
                        <span className={styles.slider}></span>
                    </label>
                </div>
            </div>
        </div>
    );
}
