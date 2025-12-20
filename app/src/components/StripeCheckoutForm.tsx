import { forwardRef, useEffect, useState } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useAuth } from "@/context/AuthContext";
import { Plan } from "@/onboarding/types";
import { axiosPrivate } from "@/api/axios";
import InnerCheckoutForm from "./InnerCheckoutForm";
import LoadingSpinner from "./LoadingSpinner";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

export interface StripeCheckoutFormHandle {
    submit: () => void;
}

export interface PreviewDetails {
    vatPercentage: number,
    vatAmount: number;
    subTotal: number;
    total: number;
    originalAnnualPrice: number;
    discount: number;
}

interface Props {
    plan: Plan;
    billingPeriod: "monthly" | "yearly";

    onBillingPeriodChange: (period: "monthly" | "yearly") => void;

    mode: "onboarding" | "admin";
    onSuccess: () => void;
}

const StripeCheckoutForm = forwardRef<StripeCheckoutFormHandle, Props>(({
    plan,
    billingPeriod,
    onBillingPeriodChange,
    mode,
    onSuccess
}, ref) => {

    const { activeCompany, showToast } = useAuth();
    
    const [clientSecret, setClientSecret] = useState("");
    const [loading, setLoading] = useState(false);
    const [previewDetails, setPreviewDetails] = useState<PreviewDetails | null>(null);
    
    const [companyName, setCompanyName] = useState(activeCompany?.name || "");
    const [companyNameError, setCompanyNameError] = useState<string | undefined>(undefined);
    const [vatNumber, setVatNumber] = useState(""); // TODO: initiate vatNumber

    const validate = () => {
        if (!companyName.trim()) {
            setCompanyNameError("Το όνομα εταιρείας είναι υποχρεωτικό");
            return false;
        }

        setCompanyNameError(undefined);
        return true;
    };

    useEffect(() => {
        if (!plan) return;

        const createIntent  = async () => {
            try {
                setLoading(true);

                const response = await axiosPrivate.post("/api/stripe/create-payment-intent", {
                    mode: mode,
                    planId: plan.id,
                    billingPeriod,
                    companyName,
                    vatNumber
                });

                const { success, data = {} } = response.data;
                const { clientSecret, priceInfo } = data;

                if(!success){
                    showToast({ message: "Κάτι πήγε στραβά", type: "error" });
                    return;
                }

                setClientSecret(clientSecret);
                setPreviewDetails(priceInfo);

            } catch (error) {
                console.error("error:", error);
                showToast({ message: "Κάτι πήγε στραβά", type: "error" });
            } finally {
                setLoading(false);
            }
        }

        createIntent ();

    }, [plan.id, billingPeriod]);

    if (!clientSecret) 
        return <LoadingSpinner />

    return (
        <Elements
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
            <InnerCheckoutForm
                ref={ref}
                plan={plan}
                billingPeriod={billingPeriod}
                onBillingPeriodChange={onBillingPeriodChange}
                mode={mode}
                previewDetails={previewDetails}
                loading={loading}

                companyName={companyName}
                companyNameError={companyNameError}
                onCompanyNameChange={(v) => {
                    setCompanyName(v);
                    setCompanyNameError(undefined);
                }}
                vatNumber = {vatNumber}
                onVatNumberChange={setVatNumber}
                validate={validate}

                onSuccess={onSuccess}
            />
        </Elements>
    );
});

export default StripeCheckoutForm;