import { useState, useEffect } from "react";
import countries from "i18n-iso-countries";
import el from "i18n-iso-countries/langs/el.json";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyProfile from "@/hooks/useCompanyProfile";
import { axiosPrivate } from "@/api/axios";
import LoadingSpinner from "@/components/LoadingSpinner";
import Button from "@/components/reusable/Button";
import styles from "./CompanyLegal.module.css";

countries.registerLocale(el);

const countryList = Object.entries(countries.getNames("el"))
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "el"));

export default function CompanyLegal() {
    const { showToast } = useAuth();
    const { company, isLoading, updateLegal } = useCompanyProfile();

    const [taxId, setTaxId] = useState("");
    const [taxOffice, setTaxOffice] = useState("");
    const [address, setAddress] = useState("");
    const [city, setCity] = useState("");
    const [postalCode, setPostalCode] = useState("");
    const [country, setCountry] = useState("");
    const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
    const [isDetectingCountry, setIsDetectingCountry] = useState(false);
    const [isHydrated, setIsHydrated] = useState(false);

    useEffect(() => {
        if (company) {
            setTaxId(company.tax_id || "");
            setTaxOffice(company.tax_office || "");
            setAddress(company.address || "");
            setCity(company.city || "");
            setPostalCode(company.postal_code || "");
            setCountry(company.country || "");
        }
    }, [company]);

    useEffect(() => {
        if (company) setIsHydrated(true);
    }, [company]);

    useEffect(() => {
        if (!company || company.country) return;

        const detectCountry = async () => {
            setIsDetectingCountry(true);
            try {
                const res = await axiosPrivate.get("/api/billing/detect-country");
                const { success, data } = res.data;
                const detected = success && data?.country ? data.country : "GR";
                setCountry(detected);
            } catch {
                setCountry("GR");
            } finally {
                setIsDetectingCountry(false);
            }
        };

        detectCountry();
    }, [company]);

    const hasChanges =
        isHydrated &&
        !!company &&
        (
            (taxId.trim() !== (company.tax_id || "")) ||
            (taxOffice.trim() !== (company.tax_office || "")) ||
            (address.trim() !== (company.address || "")) ||
            (city.trim() !== (company.city || "")) ||
            (postalCode.trim() !== (company.postal_code || "")) ||
            (country !== (company.country || ""))
        );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrors({});
        try {
            await updateLegal.mutateAsync({
                tax_id: taxId.trim() || undefined,
                tax_office: taxOffice.trim() || undefined,
                address: address.trim() || undefined,
                city: city.trim() || undefined,
                postal_code: postalCode.trim() || undefined,
                country: country.trim() || undefined,
            });
            showToast({ message: "Τα νομικά στοιχεία ενημερώθηκαν", type: "success" });
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
                <h3 className={styles.sectionTitle}>Νομικά στοιχεία</h3>
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.formRow}>
                        <div className={styles.field}>
                            <label htmlFor="tax_id">ΑΦΜ</label>
                            <input
                                id="tax_id"
                                type="text"
                                value={taxId}
                                onChange={(e) => setTaxId(e.target.value.replace(/\s/g, ""))}
                                placeholder="π.χ. EL123456789"
                                className={errors.tax_id ? styles.inputError : ""}
                            />
                            {errors.tax_id && (
                                <span className={styles.errorText}>{errors.tax_id}</span>
                            )}
                        </div>
                        <div className={styles.field}>
                            <label htmlFor="tax_office">ΔΟΥ</label>
                            <input
                                id="tax_office"
                                type="text"
                                value={taxOffice}
                                onChange={(e) => setTaxOffice(e.target.value)}
                                placeholder="π.χ. Α' Αθηνών"
                            />
                        </div>
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="address">Διεύθυνση</label>
                        <input
                            id="address"
                            type="text"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder="π.χ. Ερμού 25"
                        />
                    </div>
                    <div className={styles.formRow}>
                        <div className={styles.field}>
                            <label htmlFor="city">Πόλη</label>
                            <input
                                id="city"
                                type="text"
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                                placeholder="π.χ. Αθήνα"
                            />
                        </div>
                        <div className={styles.field}>
                            <label htmlFor="postal_code">Ταχυδρομικός κώδικας</label>
                            <input
                                id="postal_code"
                                type="text"
                                value={postalCode}
                                onChange={(e) => setPostalCode(e.target.value)}
                                placeholder="π.χ. 10563"
                            />
                        </div>
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="country">Χώρα</label>
                        <select
                            id="country"
                            value={country}
                            onChange={(e) => setCountry(e.target.value)}
                            className={errors.country ? styles.inputError : ""}
                            disabled={isDetectingCountry}
                        >
                            <option value="">{isDetectingCountry ? "Εντοπισμός χώρας…" : "Επιλέξτε χώρα"}</option>
                            {countryList.map(({ code, name }) => (
                                <option key={code} value={code}>
                                    {name}
                                </option>
                            ))}
                        </select>
                        {errors.country && (
                            <span className={styles.errorText}>{errors.country}</span>
                        )}
                    </div>
                    <div className={styles.formActions}>
                        <Button
                            type="submit"
                            variant="primary"
                            loading={updateLegal.isPending}
                            disabled={!hasChanges || updateLegal.isPending}
                        >
                            Αποθήκευση
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
