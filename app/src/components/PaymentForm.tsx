import { forwardRef, useEffect, useState } from "react"
import PaymentMethodForm, { PaymentMethodFormRef } from "./PaymentMethodForm";
import { Elements } from "@stripe/react-stripe-js";
import { axiosPrivate } from "@/api/axios";
import { loadStripe } from "@stripe/stripe-js";
import LoadingSpinner from "./LoadingSpinner";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

interface PaymentFormProps {
    onReady?: (ready: boolean) => void;
    onSetupError?: (error: string) => void; // Error κατά το fetch του setup intent
}

const PaymentForm = forwardRef<PaymentMethodFormRef, PaymentFormProps>(
    ({ onReady, onSetupError }, ref) => {
        const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);
        const [setupError, setSetupError] = useState<string | null>(null);

        const fetchSetupIntent = async () => {
            setSetupError(null);
            try {
                const response = await axiosPrivate.post("/api/billing/setup-intent");
                const { success, data } = response.data;

                if (!success) {
                    const msg = "Αποτυχία δημιουργίας setup intent";
                    setSetupError(msg);
                    onSetupError?.(msg);
                    return;
                }

                setSetupClientSecret(data.clientSecret);
            } catch (err: unknown) {
                const e = err as { response?: { data?: { message?: string } } };
                const msg = e.response?.data?.message || "Σφάλμα σύνδεσης. Δοκιμάστε ξανά.";
                setSetupError(msg);
                onSetupError?.(msg);
            }
        };

        useEffect(() => {
            fetchSetupIntent();
        }, []);

        if (setupError && !setupClientSecret) {
            return (
                <div style={{ padding: "24px", textAlign: "center" }}>
                    <p style={{ marginBottom: "16px", color: "#6b7280" }}>{setupError}</p>
                    <button
                        type="button"
                        onClick={fetchSetupIntent}
                        style={{
                            padding: "10px 20px",
                            backgroundColor: "#3F72E7",
                            color: "white",
                            border: "none",
                            borderRadius: "8px",
                            cursor: "pointer",
                            fontSize: "14px"
                        }}
                    >
                        Δοκιμάστε ξανά
                    </button>
                </div>
            );
        }

        if (!setupClientSecret) return <LoadingSpinner />;

        return (
            <Elements
                stripe={stripePromise}
                options={{
                    clientSecret: setupClientSecret,
                    locale: 'el',
                    appearance: {
                        theme: 'stripe',
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
                <PaymentMethodForm
                    ref={ref}
                    onReady={onReady}
                />
            </Elements>
        );
    }
);

export default PaymentForm;