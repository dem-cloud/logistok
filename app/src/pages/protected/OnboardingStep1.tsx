import { useEffect, useState } from "react";
import Button from "../../components/reusable/Button";
import Input from "../../components/reusable/Input";
import styles from './Onboarding.module.css'
import { useAuth } from "../../context/AuthContext";
import { axiosPrivate } from "../../api/axios";

interface StepOneProps {
    stepData?: {
        companyName: string;
        managersPhone: string;
    };
    goNext: () => Promise<void>;
}

export default function OnboardingStep1({ stepData, goNext }: StepOneProps) {

    const { showToast } = useAuth();

    const [companyName, setCompanyName] = useState(stepData?.companyName ?? '')
    const [managersPhone, setManagersPhone] = useState(stepData?.managersPhone ?? '')

    const [companyNameError, setCompanyNameError] = useState("");
    const [managersPhoneError, setManagersPhoneError] = useState("");

    const [loadingSubmitRequest, setLoadingSubmitRequest] = useState(false)

    useEffect(() => {
        setCompanyName(stepData?.companyName ?? "");
        setManagersPhone(stepData?.managersPhone ?? "");
    }, [stepData]);


    const handleCompanyNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCompanyName(e.target.value);
        
        // Reset μόνο το συγκεκριμένο error
        if (companyNameError) {
            setCompanyNameError("");
        }
    };

    const handleManagersPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setManagersPhone(e.target.value);

        // Reset μόνο το συγκεκριμένο error
        if (managersPhoneError) {
            setManagersPhoneError("");
        }
    };


    const validateStep1 = () => {
        let hasError = false;

        // Reset previous errors
        setCompanyNameError("");
        setManagersPhoneError("");

        // Empty fields
        if (companyName.trim() === "") {
            setCompanyNameError("Το πεδίο είναι υποχρεωτικό");
            hasError = true;
        }

        if (managersPhone.trim() === "") {
            setManagersPhoneError("Το πεδίο είναι υποχρεωτικό");
            hasError = true;
        }

        // Company name min length
        if (companyName && companyName.trim().length < 3) {
            setCompanyNameError("Το όνομα πρέπει να έχει τουλάχιστον 3 χαρακτήρες");
            hasError = true;
        }

        // Phone must be 10 digits, numeric only
        const cleanedPhone = managersPhone.replace(/\D/g, "");

        if (managersPhone && cleanedPhone.length !== 10) {
            setManagersPhoneError("Το τηλέφωνο πρέπει να αποτελείται από 10 αριθμούς");
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

            const response = await axiosPrivate.post("/api/shared/submit-step-one", { companyName, managersPhone })
            const { success, message, code } = response.data;

            if(!success){
                // MISSING_COMPANY_NAME
                // MISSING_MANAGERS_PHONE
                // INVALID_COMPANY_NAME
                // INVALID_PHONE
                // INVALID_PHONE_FORMAT
                // SUB_NOT_FOUND

                switch (code) {
                    case "MISSING_COMPANY_NAME":
                    case "INVALID_COMPANY_NAME":
                        setCompanyNameError(message);
                        return;
                    case "MISSING_MANAGERS_PHONE":
                    case "INVALID_PHONE":
                    case "INVALID_PHONE_FORMAT":
                        setManagersPhoneError(message);
                        return;
                    default:
                        showToast({ message: "Κάτι πήγε στραβά", type: "error" });
                        return;
                }
            }

            await goNext();

        } catch (error) {
            console.error("error:", error);
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
        } finally {
            setLoadingSubmitRequest(false);
        }

    };

    return (
        <div className={styles.onboarding}>

            <div className={styles.onboardingContent}>
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
                        label="Τηλέφωνο Υπεύθυνου"
                        name="managersPhone"
                        type="text"
                        placeholder="Τηλέφωνο Υπεύθυνου"
                        value={managersPhone}
                        onChange={handleManagersPhoneChange}
                        error={managersPhoneError}
                    />

                    <Button
                        type = "submit"
                        loading = {loadingSubmitRequest}
                        disabled = {loadingSubmitRequest}
                    >
                        Συνέχεια
                    </Button>
                </form>

            </div>
        </div>
    )
}
