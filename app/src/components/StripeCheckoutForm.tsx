import { forwardRef, useEffect, useState } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useAuth } from "@/context/AuthContext";
import { axiosPrivate } from "@/api/axios";
import InnerCheckoutForm from "./InnerCheckoutForm";
import LoadingSpinner from "./LoadingSpinner";
import { PricePreviewResponse } from "@/types/billing.types";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

export interface StripeCheckoutFormHandle {
    submit: () => void;
}

interface Props {
    planId: string;

    billingPeriod: "monthly" | "yearly";
    onBillingPeriodChange: (period: "monthly" | "yearly") => void;
    totalBranches?: number;
    handleIncreaseTotalBranches?: () => void;
    handleDecreaseTotalBranches?: () => void;
    selectedPlugins?: string[];
    onRemovePlugin?: (pluginKey: string) => void;

    mode: "onboarding" | "admin";
    pricePreview?: PricePreviewResponse;

    onSuccess: () => void;
}

const StripeCheckoutForm = forwardRef<StripeCheckoutFormHandle, Props>(({
    // planId,
    billingPeriod,
    onBillingPeriodChange,
    totalBranches,
    handleIncreaseTotalBranches,
    handleDecreaseTotalBranches,
    selectedPlugins,
    onRemovePlugin,
    mode,
    pricePreview,
    onSuccess
}, ref) => {

    const { activeCompany, showToast } = useAuth();
    
    const [clientSecret, setClientSecret] = useState("");
    const [loading, setLoading] = useState(false);
    
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
        const fetchSetupIntent = async () => {
            try {
                setLoading(true);

                const response = await axiosPrivate.post('/api/billing/create-setup-intent');

                const { success, data } = response.data;

                if (!success) {
                    showToast({ message: "Κάτι πήγε στραβά", type: "error" });
                    return;
                }
                const { clientSecret } = data;

                setClientSecret(clientSecret);

            } catch (error) {
                console.error("error:", error);
                showToast({ message: "Κάτι πήγε στραβά", type: "error" });
            } finally {
                setLoading(false);
            }
        };

        fetchSetupIntent();
    }, []);

    if (!clientSecret) 
        return <LoadingSpinner />

    return (
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
        {   
            pricePreview &&
                <InnerCheckoutForm
                    ref={ref}
                    billingPeriod={billingPeriod}
                    onBillingPeriodChange={onBillingPeriodChange}
                    totalBranches={totalBranches}
                    handleIncreaseTotalBranches={handleIncreaseTotalBranches}
                    handleDecreaseTotalBranches={handleDecreaseTotalBranches}
                    selectedPlugins={selectedPlugins}
                    onRemovePlugin={onRemovePlugin}

                    mode={mode}
                    pricePreview={pricePreview}
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
        }
        </Elements>
    );
});

export default StripeCheckoutForm;