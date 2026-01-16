import { forwardRef } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import InnerCheckoutForm from "./InnerCheckoutForm";
import { PricePreviewResponse } from "@/types/billing.types";
import LoadingSpinner from "./LoadingSpinner";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

export interface StripeCheckoutFormHandle {
    submit: () => void;
}

interface Props {
    billingPeriod: "monthly" | "yearly";
    onBillingPeriodChange: (period: "monthly" | "yearly") => void;
    totalBranches?: number;
    handleIncreaseTotalBranches?: () => void;
    handleDecreaseTotalBranches?: () => void;
    selectedPlugins?: string[];
    onRemovePlugin?: (pluginKey: string) => void;

    mode: "onboarding" | "admin";
    pricePreview?: PricePreviewResponse;
    loading: boolean;

    companyName: string;
    companyNameError: string | undefined;
    onCompanyNameChange: (v: string) => void;
    vatNumber: string;
    onVatNumberChange: (v: string) => void;

    validate: () => boolean;

    completeOnboarding?: (isPaidPlan: boolean, setupIntentId?: string) => Promise<void>;
    changePlan?: () => Promise<void>;
    onSuccess: () => void;
}

const StripeCheckoutForm = forwardRef<StripeCheckoutFormHandle, Props>(({
    
    billingPeriod,
    onBillingPeriodChange,
    totalBranches,
    handleIncreaseTotalBranches,
    handleDecreaseTotalBranches,
    selectedPlugins,
    onRemovePlugin,
    mode,
    pricePreview,
    loading: priceLoading,

    companyName,
    companyNameError,
    onCompanyNameChange,
    vatNumber,
    onVatNumberChange,
    validate,

    completeOnboarding,
    changePlan,
    onSuccess
}, ref) => {
    
    if (!pricePreview) return <LoadingSpinner />;

    return (
        <Elements
            stripe={stripePromise}
            options={{ 
                mode: 'subscription',
                amount: pricePreview.summary.total * 100,
                currency: 'eur',
                setup_future_usage: 'off_session',
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
                billingPeriod={billingPeriod}
                onBillingPeriodChange={onBillingPeriodChange}
                totalBranches={totalBranches}
                handleIncreaseTotalBranches={handleIncreaseTotalBranches}
                handleDecreaseTotalBranches={handleDecreaseTotalBranches}
                selectedPlugins={selectedPlugins}
                onRemovePlugin={onRemovePlugin}

                mode={mode}
                pricePreview={pricePreview}
                priceLoading={priceLoading}

                companyName={companyName}
                companyNameError={companyNameError}
                onCompanyNameChange={onCompanyNameChange}
                vatNumber = {vatNumber}
                onVatNumberChange={onVatNumberChange}
                validate={validate}

                completeOnboarding={completeOnboarding}
                changePlan={changePlan}
                onSuccess={onSuccess}
            />
        </Elements>
    );
});

export default StripeCheckoutForm;