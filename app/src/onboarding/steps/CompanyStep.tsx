import { useEffect, useState } from "react";
import countries from "i18n-iso-countries";
import el from "i18n-iso-countries/langs/el.json";
import Input from "../../components/reusable/Input";
import Button from "../../components/reusable/Button";
import styles from '../OnboardingLayout.module.css'
import { useAuth } from "@/contexts/AuthContext";
import { useOnboarding } from "../OnboardingContext";
import { axiosPrivate } from "@/api/axios";

countries.registerLocale(el);

const countryList = Object.entries(countries.getNames("el"))
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "el"));

export function CompanyStep() {

    const { showToast } = useAuth();
    const { onboardingData, nextStep } = useOnboarding();


    const [companyName, setCompanyName] = useState(onboardingData.company.name)
    const [contactPhone, setContactPhone] = useState(onboardingData.company.phone)
    const [country, setCountry] = useState(onboardingData.company.country || "")

    const [companyNameError, setCompanyNameError] = useState("");
    const [contactPhoneError, setContactPhoneError] = useState("");
    const [countryError, setCountryError] = useState("");

    const [isDetectingCountry, setIsDetectingCountry] = useState(false);
    const [loadingSubmitRequest, setLoadingSubmitRequest] = useState(false)

    useEffect(() => {
        setCompanyName(onboardingData.company.name)
        setContactPhone(onboardingData.company.phone)
        setCountry(onboardingData.company.country || "")
    }, [onboardingData])

    useEffect(() => {
        if (onboardingData.company.country) return;

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
    }, [onboardingData.company.country])

    const handleCompanyNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCompanyName(e.target.value);
        
        // Reset μόνο το συγκεκριμένο error
        if (companyNameError) {
            setCompanyNameError("");
        }
    };

    const handleManagersPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setContactPhone(e.target.value);

        // Reset μόνο το συγκεκριμένο error
        if (contactPhoneError) {
            setContactPhoneError("");
        }
    };

    const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setCountry(e.target.value);
        if (countryError) setCountryError("");
    };

    const validateStep1 = () => {
        let hasError = false;

        // Reset previous errors
        setCompanyNameError("");
        setContactPhoneError("");
        setCountryError("");

        // Empty fields
        if (companyName.trim() === "") {
            setCompanyNameError("Το πεδίο είναι υποχρεωτικό");
            hasError = true;
        }

        if (contactPhone.trim() === "") {
            setContactPhoneError("Το πεδίο είναι υποχρεωτικό");
            hasError = true;
        }

        // Company name min length
        if (companyName && companyName.trim().length < 3) {
            setCompanyNameError("Το όνομα πρέπει να έχει τουλάχιστον 3 χαρακτήρες");
            hasError = true;
        }

        // Phone must be 10 digits, numeric only
        const cleanedPhone = contactPhone.replace(/\D/g, "");

        if (contactPhone && cleanedPhone.length !== 10) {
            setContactPhoneError("Το τηλέφωνο πρέπει να αποτελείται από 10 αριθμούς");
            hasError = true;
        }

        if (!country || country.trim() === "") {
            setCountryError("Η χώρα είναι υποχρεωτική");
            hasError = true;
        }

        return hasError;
    };


    const handleNext = async (e: React.FormEvent) => {
        e.preventDefault();

        const hasError = validateStep1();

        if (hasError) return;
        
        try {
            setLoadingSubmitRequest(true);

            const values = {
                name: companyName,
                phone: contactPhone,
                country: country.trim()
            }

            await nextStep({ company: values });

        } catch (error) {
            console.error("error:", error);
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
        } finally {
            setLoadingSubmitRequest(false);
        }

    };

    return (
        <main className={styles.companyStepContent}>
            <div className={styles.title}>Δημιουργία του Εταιρικού σας Προφίλ</div>
            <div className={styles.tagline}>Πληροφορίες Εταιρείας</div>


            <form 
                onSubmit={handleNext}
            >

                <Input
                    label="Όνομα Εταιρείας"
                    name="companyName"
                    type="text"
                    placeholder="Όνομα Εταιρείας"
                    value={companyName}
                    onChange={handleCompanyNameChange}
                    error={companyNameError}
                />

                <Input
                    label="Τηλέφωνο Επικοινωνίας"
                    name="contactPhone"
                    type="text"
                    placeholder="Τηλέφωνο Επικοινωνίας"
                    value={contactPhone}
                    onChange={handleManagersPhoneChange}
                    error={contactPhoneError}
                />

                <div className={styles.formField}>
                    <label htmlFor="country">Χώρα</label>
                    <select
                        id="country"
                        name="country"
                        value={country}
                        onChange={handleCountryChange}
                        disabled={isDetectingCountry}
                        className={countryError ? styles.selectError : ""}
                    >
                        <option value="">{isDetectingCountry ? "Εντοπισμός χώρας…" : "Επιλέξτε χώρα"}</option>
                        {countryList.map(({ code, name }) => (
                            <option key={code} value={code}>
                                {name}
                            </option>
                        ))}
                    </select>
                    {countryError && <span className={styles.errorText}>{countryError}</span>}
                </div>

                <Button
                    type = "submit"
                    loading = {loadingSubmitRequest}
                    disabled = {loadingSubmitRequest}
                    widthFull
                >
                    Συνέχεια
                </Button>
            </form>

        </main>
    );
}
