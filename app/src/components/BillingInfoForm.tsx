import { forwardRef, useEffect, useImperativeHandle, useState, useRef } from "react";
import styles from "./BillingInfoForm.module.css";
import { BillingInfo } from "@/hooks/useSubscription";
import countries from 'i18n-iso-countries';
import el from 'i18n-iso-countries/langs/el.json';
import { axiosPrivate } from "@/api/axios";
import { Check, AlertCircle, Loader2 } from "lucide-react";
import LoadingSpinner from "./LoadingSpinner";
// import LoadingSpinner from "./LoadingSpinner";

export interface BillingInfoFormRef {
    getData: () => { data: BillingInfo | null; error: string | null };
    validate: () => boolean;
}

interface BillingInfoFormProps {
    initialData?: Partial<BillingInfo> | null;
    onCountryChange?: (country: string) => void;
    onTaxIdChange?: (vatId: string) => void;
    onTaxInfoIsValidChange?: (taxInfoIsValid: boolean) => void;
}

// Register Greek locale
countries.registerLocale(el);

// Country list
const countryList = Object.entries(countries.getNames('el'))
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'el'));

const BillingInfoForm = forwardRef<BillingInfoFormRef, BillingInfoFormProps>(
    ({ initialData, onCountryChange, onTaxIdChange, onTaxInfoIsValidChange }, ref) => {

        const [formData, setFormData] = useState<BillingInfo>({
            name: initialData?.name || "",
            taxId: initialData?.taxId || "",
            taxOffice: initialData?.taxOffice || null,
            address: initialData?.address || "",
            city: initialData?.city || "",
            postalCode: initialData?.postalCode || "",
            country: initialData?.country || "",
        });
        
        const [errors, setErrors] = useState<Partial<Record<keyof BillingInfo, string>>>({});
        
        // Tax ID validation state
        const [taxIdStatus, setTaxIdStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid' | 'unavailable'>('idle');
        const [taxStatusMessage, setTaxStatusMessage] = useState("");
        const [taxErrorMessage, setTaxErrorMessage] = useState("");
        const prevTaxIdRef = useRef<string>(formData.taxId || '');

        // Loading state
        const [isDetectingCountry, setIsDetectingCountry] = useState(!initialData?.country);

        // =============================================
        // DETECT COUNTRY ON MOUNT
        // =============================================
        useEffect(() => {
            if (initialData?.country) return;

            const detectCountry = async () => {
                setIsDetectingCountry(true);
                try {
                    const response = await axiosPrivate.get('/api/billing/detect-country');

                    const { success, data } = response.data;

                    if (!success) {
                        setFormData(prev => ({ ...prev, country: 'GR' }));
                        onCountryChange && onCountryChange('GR');
                    }
                    const { country } = data;

                    setFormData(prev => ({ ...prev, country: country }));
                    onCountryChange && onCountryChange(country);

                } catch {
                    setFormData(prev => ({ ...prev, country: 'GR' }));
                    onCountryChange && onCountryChange('GR');
                } finally {
                    setIsDetectingCountry(false);
                }
            };

            detectCountry();
        }, [initialData?.country]);

        
        // =============================================
        // VALIDATE TAX ID
        // =============================================
        const validateTaxId = async (taxId: string, country: string) => {
            // Clear previous messages
            setTaxErrorMessage("");
            setTaxStatusMessage("");

            if (!taxId.trim()) {
                setTaxIdStatus('idle');

                onTaxInfoIsValidChange && onTaxInfoIsValidChange(true);
                return;
            }

            setTaxIdStatus('validating');

            try {
                const response = await axiosPrivate.post('/api/billing/validate-tax-info', { taxId, country });
                const { success, message, code, data = {} } = response.data;

                if (!success) {

                    if(code === "PREFIX_COUNTRY_MISMATCH" || code === "INVALID_EU_VAT_FORMAT") {
                        setTaxErrorMessage(message)
                    }

                    if(data.status){
                        setTaxIdStatus(data.status);
                        setTaxStatusMessage(message);
                    } else {
                        setTaxIdStatus('idle');
                    }

                    onTaxInfoIsValidChange && onTaxInfoIsValidChange(false);
                    return;
                }
                const { status } = data;

                setTaxIdStatus(status);
                setTaxStatusMessage(message);
                
                onTaxInfoIsValidChange && onTaxInfoIsValidChange(true);

            } catch (error) {
                console.error("Validate tax id error:", error);
                setTaxIdStatus('unavailable');

                onTaxInfoIsValidChange && onTaxInfoIsValidChange(false);
            }
        };

        // =============================================
        // HANDLE TAX ID BLUR
        // =============================================
        const handleTaxIdBlur = () => {
            const currentTaxId = formData.taxId ?? '';
            
            // Only validate if taxId changed
            if (formData.country && currentTaxId !== prevTaxIdRef.current) {
                validateTaxId(currentTaxId, formData.country);
                prevTaxIdRef.current = currentTaxId; // update previous value
            }
        };

        // =============================================
        // RE-VALIDATE WHEN COUNTRY CHANGES
        // =============================================
        useEffect(() => {
            if (formData.taxId && formData.country) {
                validateTaxId(formData.taxId, formData.country);
            }
        }, [formData.country]);

        // =============================================
        // FORM VALIDATION
        // =============================================
        const validate = (): boolean => {
            const newErrors: Partial<Record<keyof BillingInfo, string>> = {};

            if (!formData.name.trim()) {
                newErrors.name = "Υποχρεωτικό πεδίο";
            }
            if (!formData.address?.trim()) {
                newErrors.address = "Υποχρεωτικό πεδίο";
            }
            if (!formData.city?.trim()) {
                newErrors.city = "Υποχρεωτικό πεδίο";
            }
            if (!formData.postalCode?.trim()) {
                newErrors.postalCode = "Υποχρεωτικό πεδίο";
            }
            if (!formData.country) {
                newErrors.country = "Υποχρεωτικό πεδίο";
            }

            // Block if VAT is still validating
            if (taxIdStatus === 'validating') {
                newErrors.taxId = "Περιμένετε την επαλήθευση του ΑΦΜ";
            }

            if(taxErrorMessage) {
                newErrors.taxId = taxErrorMessage;
            }

            setErrors(newErrors);
            return Object.keys(newErrors).length === 0;
        };

        const getData = (): { data: BillingInfo | null; error: string | null } => {
            if (!validate()) {
                return { data: null, error: "Συμπληρώστε τα υποχρεωτικά πεδία" };
            }
            return { data: formData, error: null };
        };

        useImperativeHandle(ref, () => ({
            getData,
            validate,
        }));

        // =============================================
        // HANDLE INPUT CHANGE
        // =============================================
        const handleChange = (field: keyof BillingInfo, value: string) => {
            // Sanitize taxId - remove spaces
            const sanitizedValue = field === "taxId" ? value.replace(/\s/g, '') : value;
            
            setFormData((prev) => ({ ...prev, [field]: sanitizedValue }));

            // Clear error on change
            if (errors[field]) {
                setErrors((prev) => ({ ...prev, [field]: undefined }));
            }

            // Callback for country change
            if (field === "country") {
                onCountryChange && onCountryChange(value);

                // Clear taxId error since it will be re-validated
                setErrors((prev) => ({ ...prev, taxId: undefined }));
                
                // Reset taxId status - will re-validate in useEffect
                setTaxIdStatus('idle');
                setTaxStatusMessage("");
                setTaxErrorMessage("");

                // If there's a taxId, invalidate until re-validation completes
                if (formData.taxId) {
                    onTaxInfoIsValidChange && onTaxInfoIsValidChange(false);
                }
            }

            // Reset tax ID status when taxId changes
            if (field === "taxId") {
                setTaxIdStatus('idle');
                setTaxStatusMessage("");  // reset
                setTaxErrorMessage("");   // reset
                onTaxIdChange && onTaxIdChange(value);
                onTaxInfoIsValidChange && onTaxInfoIsValidChange(false);
                prevTaxIdRef.current = ''; // optional: reset previous value
            }
        };

        // =============================================
        // RENDER TAX ID STATUS ICON
        // =============================================
        const renderTaxIdStatus = () => {
            switch (taxIdStatus) {
                case 'validating':
                    return (
                        <div className={styles.statusIcon}>
                            <Loader2 size={18} className={styles.spinner} />
                        </div>
                    );
                case 'valid':
                    return (
                        <div className={`${styles.statusIcon} ${styles.valid}`}>
                            <Check size={18} />
                        </div>
                    );
                case 'invalid':
                    return (
                        <div 
                            className={`${styles.statusIcon} ${styles.info}`} 
                            title={taxStatusMessage}
                        >
                            <AlertCircle size={18} />
                        </div>
                    );
                case 'unavailable':
                    return (
                        <div 
                            className={`${styles.statusIcon} ${styles.invalid}`} 
                            title="Η υπηρεσία επαλήθευσης είναι προσωρινά μη διαθέσιμη. Η χρέωση ΦΠΑ θα οριστικοποιηθεί κατά την πληρωμή."
                        >
                            <AlertCircle size={18} />
                        </div>
                    );
                default:
                    return null;
            }
        };

        // =============================================
        // RENDER
        // =============================================
        if (isDetectingCountry) {
            return <LoadingSpinner />;
        }

        return (
            <div className={styles.billingForm}>
                {/* Επωνυμία / Ονοματεπώνυμο */}
                <div className={styles.field}>
                    <label className={styles.label}>Επωνυμία / Ονοματεπώνυμο</label>
                    <input
                        type="text"
                        className={`${styles.input} ${errors.name ? styles.inputError : ""}`}
                        value={formData.name}
                        onChange={(e) => handleChange("name", e.target.value)}
                        placeholder="π.χ. Εταιρεία ΑΕ ή Γιάννης Παπαδόπουλος"
                    />
                    {errors.name && <span className={styles.error}>{errors.name}</span>}
                </div>

                {/* ΑΦΜ */}
                <div className={styles.field}>
                    <label className={styles.label}>ΑΦΜ (προαιρετικό)</label>
                    <div className={styles.inputWrapper}>
                        <input
                            type="text"
                            className={`${styles.input} ${errors.taxId ? styles.inputError : ""} ${taxIdStatus === 'valid' ? styles.inputSuccess : ''}`}
                            value={formData.taxId || ""}
                            onChange={(e) => handleChange("taxId", e.target.value)}
                            onBlur={handleTaxIdBlur}
                            placeholder="π.χ. EL123456789"
                        />
                        {renderTaxIdStatus()}
                    </div>
                    {errors.taxId && <span className={styles.error}>{errors.taxId}</span>}
                    {/* <span className={styles.hint}>Συμπληρώστε για έκδοση τιμολογίου</span> */}
                </div>

                {/* Διεύθυνση */}
                <div className={styles.field}>
                    <label className={styles.label}>Διεύθυνση</label>
                    <input
                        type="text"
                        className={`${styles.input} ${errors.address ? styles.inputError : ""}`}
                        value={formData.address || ""}
                        onChange={(e) => handleChange("address", e.target.value)}
                        placeholder="π.χ. Ερμού 25"
                    />
                    {errors.address && <span className={styles.error}>{errors.address}</span>}
                </div>

                {/* Πόλη & ΤΚ */}
                <div className={styles.row}>
                    <div className={styles.field}>
                        <label className={styles.label}>Πόλη</label>
                        <input
                            type="text"
                            className={`${styles.input} ${errors.city ? styles.inputError : ""}`}
                            value={formData.city || ""}
                            onChange={(e) => handleChange("city", e.target.value)}
                            placeholder="π.χ. Αθήνα"
                        />
                        {errors.city && <span className={styles.error}>{errors.city}</span>}
                    </div>

                    <div className={styles.fieldSmall}>
                        <label className={styles.label}>Τ.Κ.</label>
                        <input
                            type="text"
                            className={`${styles.input} ${errors.postalCode ? styles.inputError : ""}`}
                            value={formData.postalCode || ""}
                            onChange={(e) => handleChange("postalCode", e.target.value)}
                            placeholder="π.χ. 10563"
                        />
                        {errors.postalCode && <span className={styles.error}>{errors.postalCode}</span>}
                    </div>
                </div>

                {/* Χώρα */}
                <div className={styles.field}>
                    <label className={styles.label}>Χώρα</label>
                    <select
                        className={`${styles.select} ${(errors.country || errors.taxId) ? styles.inputError : ""}`}
                        value={formData.country || ""}
                        onChange={(e) => handleChange("country", e.target.value)}
                    >
                        <option value="">Επιλέξτε χώρα</option>
                        {countryList.map(({ code, name }) => (
                            <option key={code} value={code}>{name}</option>
                        ))}
                    </select>
                    {errors.country && <span className={styles.error}>{errors.country}</span>}
                </div>
            </div>
        );
    }
);

export default BillingInfoForm;