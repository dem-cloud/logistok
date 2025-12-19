import { useEffect, useState } from "react";
import Input from "../../components/reusable/Input";
import Button from "../../components/reusable/Button";
import styles from '../OnboardingLayout.module.css'
import { useAuth } from "@/context/AuthContext";
import { useOnboarding } from "../OnboardingContext";


export function CompanyStep() {

    const { showToast } = useAuth();
    const { onboardingData, nextStep } = useOnboarding();


    const [companyName, setCompanyName] = useState(onboardingData.company.name)
    const [contactPhone, setContactPhone] = useState(onboardingData.company.phone)

    const [companyNameError, setCompanyNameError] = useState("");
    const [contactPhoneError, setContactPhoneError] = useState("");

    const [loadingSubmitRequest, setLoadingSubmitRequest] = useState(false)

    useEffect(() => {
        setCompanyName(onboardingData.company.name)
        setContactPhone(onboardingData.company.phone)
    }, [onboardingData])

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

    const validateStep1 = () => {
        let hasError = false;

        // Reset previous errors
        setCompanyNameError("");
        setContactPhoneError("");

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
                phone: contactPhone
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
        <main className={styles.content}>
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
