import { useEffect, useState } from "react";
import PlanCard from "./PlanCard";
import styles from "./PlanList.module.css";
import SidePopup from "./reusable/SidePopup";
import StripeCheckoutForm from "./StripeCheckoutForm";
import { useNavigate } from "react-router-dom";

import { Elements } from "@stripe/react-stripe-js";
import { loadStripe, PaymentIntent } from "@stripe/stripe-js";
import { axiosPrivate } from "../api/axios";
import { useAuth } from "@/context/AuthContext";
import { Plan, OnboardingData } from "@/onboarding/types";
import { useOnboarding } from "@/onboarding/OnboardingContext";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);


interface PreviewDetails {
    vatPercentage: number;
    vatAmount: number;
    subTotal: number;
    total: number;
    originalAnnualPrice: number;
    discount: number;
}

interface PlanListProps {
    mode: "onboarding" | "admin";
}

export default function PlanList({ mode }: PlanListProps) {

    const { activeCompany, showToast } = useAuth();
    const { plans, nextStep } = useOnboarding();
    const navigate = useNavigate();

    const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("yearly");
    const [popupOpen, setPopupOpen] = useState(false);
    const [downgradePopupOpen, setDowngradePopupOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
    const [changeType, setChangeType] = useState<string>("");

    const [clientSecret, setClientSecret] = useState("");
    const [paymentIntentId, setPaymentIntentId] = useState("");
    const [stripeCustomerId, setStripeCustomerId] = useState("");
    const [previewDetails, setPreviewDetails] = useState<PreviewDetails | null>(null);

    const [companyNameDB, setCompanyNameDB] = useState("");
    const [companyName, setCompanyName] = useState("");
    const [companyNameError, setCompanyNameError] = useState("");
    const [vatNumber, setVatNumber] = useState("");

    const [loading, setLoading] = useState(false);

    const [confirmPaymentFn, setConfirmPaymentFn] = useState<(() => Promise<PaymentIntent | undefined>) | null>(null);

    const handleClosePopup = () => {
        setPopupOpen(false);
        setClientSecret("");
        setPaymentIntentId("");
        setStripeCustomerId("");
        setPreviewDetails(null);
        setCompanyNameError("");
    };


    // Δημιουργεί νέο PaymentIntent όταν ανοίγει το popup
    useEffect(() => {
        if (!popupOpen || !selectedPlan) return;

        // Reset states για νέο popup
        setClientSecret("");
        setPaymentIntentId("");
        setPreviewDetails(null);

        // Initialize company name input
        setCompanyName(companyNameDB);
        // TODO: set afm

        const createNewPaymentIntent = async () => {
            try {
                setLoading(true);

                const response = await axiosPrivate.post("/api/stripe/create-payment-intent", {
                    planId: selectedPlan.id,
                    billingPeriod,
                    companyName,
                    vatNumber
                });

                const { success, data = {} } = response.data;
                const { clientSecret, paymentIntentId, stripeCustomerId, priceInfo } = data;

                if(!success){
                    showToast({ message: "Κάτι πήγε στραβά", type: "error" });
                    return;
                }

                setClientSecret(clientSecret);
                setPaymentIntentId(paymentIntentId); 
                setStripeCustomerId(stripeCustomerId);
                setPreviewDetails(priceInfo);

            } catch (error) {
                console.error("error:", error);
                showToast({ message: "Κάτι πήγε στραβά", type: "error" });
            } finally {
                setLoading(false);
            }
        }

        createNewPaymentIntent();

    }, [popupOpen, selectedPlan]); 

    // Update PaymentIntent όταν αλλάζει billing period
    useEffect(() => {

        if (!popupOpen || !paymentIntentId || !selectedPlan) return;

        const updatePaymentIntent = async () => {
            try {
                // setLoading(true);

                const response = await axiosPrivate.post("/api/stripe/update-payment-intent", {
                    planId: selectedPlan.id,
                    billingPeriod,
                    companyName,
                    vatNumber,
                    paymentIntentId // Στέλνουμε το existing ID για update
                });

                const { success, data = {} } = response.data;
                const { priceInfo } = data;

                if(!success){
                    showToast({ message: "Κάτι πήγε στραβά", type: "error" });
                    return;
                }

                // Ενημέρωσε ΜΟΝΟ το priceInfo
                setPreviewDetails(priceInfo);

            } catch (error) {
                console.error("error:", error);
                showToast({ message: "Κάτι πήγε στραβά", type: "error" });
            } finally {
                // setLoading(false);
            }
        }

        updatePaymentIntent();

    }, [billingPeriod]);
    

    const handlePlanClick = async (plan: Plan) => {

        try {
            const values = {
                id: plan.id,
                billing: billingPeriod
            }

            await nextStep({ plan: values });

            // // Ρώτα backend τι είδους αλλαγή είναι
            // const response = await axiosPrivate.post("/api/stripe/check-plan-change", {
            //     newPlanId: plan.id
            // });

            // const { success, data = {} } = response.data;

            // const { type } = data;

            // if(!success) {
            //     showToast({ message: "Κάτι πήγε στραβά", type: "error" });
            //     return;
            // }

            // setChangeType(type);
            // setSelectedPlan(plan);

            // // ---------------------------------------------------------
            // // SAME PLAN -> ignore
            // // ---------------------------------------------------------
            // if (type === "same-plan") return;

            // // ---------------------------------------------------------
            // // FREE ONBOARDING (Basic στο onboarding)
            // // ---------------------------------------------------------
            // if (type === "free-onboarding") {

            //     const response = await axiosPrivate.post('/api/shared/submit-step-three', {})
            //     const { success } = response.data;

            //     if(!success) {
            //         showToast({ message: "Κάτι πήγε στραβά", type: "error" });
            //         return;
            //     }
                
            //     // setOnboarding({
            //     //     is_completed: true,
            //     //     step: null
            //     // });

            //     navigate('/');
            //     return;
            // }

            // // ---------------------------------------------------------
            // // FIRST PAYMENT (onboarding paid plan) ή UPGRADE (settings)
            // // ---------------------------------------------------------
            // if (type === "first-payment" || type === "upgrade") {
            //     setPopupOpen(true);  // Stripe popup
            //     return;
            // }

            // // ---------------------------------------------------------
            // // DOWNGRADE ή CANCEL
            // // ---------------------------------------------------------
            // if (type === "downgrade" || type === "cancel") {
            //     setDowngradePopupOpen(true); // custom δικό σου confirm popup
            //     return;
            // }

        } catch (error) {
            console.error("error:", error);
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
        }
    }

    // first-payment or upgrade
    const handleFinalPayment = async () => {
        if (!confirmPaymentFn || !paymentIntentId || !selectedPlan) return;

        if(!companyName) {
            setCompanyNameError("Το πεδίο είναι υποχρεωτικό");
            return;
        }

        try {

            // 1. Confirm payment με Stripe
            const paymentIntent = await confirmPaymentFn(); // 👈 Περιμένει το result

            if (!paymentIntent) {
                showToast({ message: "Η πληρωμή απέτυχε", type: "error" });
                return;
            }

            console.log("✅ Payment confirmed, creating subscription...");

            // 2. Δημιούργησε subscription στο backend
            const response = await axiosPrivate.post("/api/stripe/confirm-and-subscribe", {
                paymentIntentId: paymentIntent.id,
                stripeCustomerId,
                planId: selectedPlan.id,
                billingPeriod,
                companyName,
                vatNumber
            });

            const { success, message } = response.data;

            if(!success){
                showToast({ message: message || "Κάτι πήγε στραβά", type: "error" });
                return;
            }

            // 3. Success!
            // setOnboarding({
            //     is_completed: true,
            //     step: null
            // });

            if(changeType === "first-payment"){
                navigate("/");
            } else {
                // popup success upgrade
            }

        } catch (error: any) {
            console.error("Payment error:", error);
            showToast({  message: error.message || "Κάτι πήγε στραβά. Προσπαθήστε ξανά.", type: "error" });
        } finally {
        }
    };

    // downgrade or cancel
    const handleConfirmDowngrade = async () => {

        if(!selectedPlan) return;

        try {
            const response = await axiosPrivate.post("/api/stripe/downgrade-cancel", {
                planId: selectedPlan.id,
                billingPeriod
            });

            const { success, message, code } = response.data;

            if(!success){
                showToast({ message: "Κάτι πήγε στραβά", type: "error" });
                return;
            }

            setDowngradePopupOpen(false);

        } catch (error) {
            console.error("error:", error);
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
        }
        
    }


    return (
        <div>
            {/* Toggle */}
            <div className={styles.toggleWrapper}>
                <div
                    className={`${styles.toggleBtn} ${
                        billingPeriod === "monthly" ? styles.toggleActive : ""
                    }`}
                    onClick={() => setBillingPeriod("monthly")}
                >
                    Μηνιαία
                </div>

                <div
                    className={`${styles.toggleBtn} ${
                        billingPeriod === "yearly" ? styles.toggleActive : ""
                    }`}
                    onClick={() => setBillingPeriod("yearly")}
                >
                    Ετήσια
                </div>
            </div>

            {/* Cards */}
            <div className={styles.cards}>
                {plans.map((plan) => (
                    <PlanCard
                        key={plan.id}
                        plan={plan}
                        billingPeriod={billingPeriod}
                        isPopular={plan.name === "Pro"}
                        onboarding={!activeCompany?.onboarding.is_completed}
                        currentPlan={null}
                        onSelectPlan={handlePlanClick}
                    />
                ))}
            </div>


            {/* <SidePopup
                isOpen={popupOpen}
                onClose={handleClosePopup}
                title="Ολοκλήρωση Πληρωμής"
                width="520px"
                footerLeftButton={{
                    label: "Ακύρωση",
                    variant: "outline",
                    onClick: handleClosePopup,
                    show: false
                }}
                footerRightButton={{
                    label: "Πληρωμή",
                    variant: "primary",
                    onClick: handleFinalPayment,
                    show: true,
                    widthFull: true
                }}
            >
                {clientSecret && (
                    <Elements
                        key={clientSecret}
                        stripe={stripePromise}
                        options={{ 
                            clientSecret,
                            locale: 'el',
                            appearance: {
                                theme: 'stripe',   // ξεκινάμε από το default theme
                                variables: {
                                    colorPrimary: '#3F72E7',
                                    colorBackground: '#ffffff',
                                    colorText: '#1a1a1a',
                                    colorDanger: '#e74c3c',
                                    fontFamily: 'Inter, system-ui, sans-serif',
                                    borderRadius: '10px',
                                    spacingUnit: '6px'
                                },
                                rules: {
                                    '.Input': {
                                        border: '1px solid #d1d5db',
                                        padding: '12px',
                                        borderRadius: '10px',
                                        fontSize: '15px',
                                        color: '#1a1a1a',
                                        backgroundColor: '#fff'
                                    },
                                    '.Input:focus': {
                                        borderColor: '#3F72E7',
                                        boxShadow: '0 0 0 1.5px #3F72E7'
                                    },
                                    '.Error': {
                                        fontSize: "0.8rem"
                                    },
                                    '.Label': {
                                        color: '#374151',
                                        fontWeight: '500',
                                        marginBottom: '4px'
                                    },
                                    '.Block': {
                                        backgroundColor: '#fff',
                                        borderRadius: '10px',
                                        padding: '10px'
                                    },
                                    '.Tab': {
                                        borderRadius: '8px'
                                    }
                                }
                            }
                        }}
                    >
                        <StripeCheckoutForm
                            selectedPlan={selectedPlan}
                            billingPeriod={billingPeriod}
                            setBillingPeriod={setBillingPeriod}
                            previewDetails={previewDetails}

                            companyName={companyName}
                            setCompanyName={setCompanyName}
                            companyNameError={companyNameError}
                            setCompanyNameError={setCompanyNameError}
                            vatNumber={vatNumber}
                            setVatNumber={setVatNumber}

                            loading = {loading}
                            onReady={(fn) => setConfirmPaymentFn(() => fn)}
                        />
                        
                    </Elements>
                )}
            </SidePopup>

            <SidePopup
                isOpen={downgradePopupOpen}
                onClose={() => setDowngradePopupOpen(false)}
                title={changeType === "downgrade" ? "Επιβεβαίωση υποβιβασμού πλάνου" : "Ακύρωση συνδρομής"}
                footerLeftButton={{
                    label: "Ακύρωση",
                    variant: "outline",
                    onClick: () => setDowngradePopupOpen(false),
                    show: true
                }}
                footerRightButton={{
                    label: "Συνέχεια",
                    variant: "primary",
                    onClick: handleConfirmDowngrade,
                    show: true,
                }}
            >
                {
                changeType === "downgrade" ?
                    <p>Είστε σίγουροι ότι θέλετε να κάνετε downgrade στο {selectedPlan?.name};</p>
                : // changeType === "cancel"
                    <p>Είστε σίγουροι ότι θέλετε να ακυρώσετε την συνδρομή σας;</p>
                }
            </SidePopup> */}
        </div>
    );
};
