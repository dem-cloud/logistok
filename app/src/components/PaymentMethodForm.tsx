import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { forwardRef, useImperativeHandle } from "react";

export interface PaymentMethodFormRef {
    submit: () => Promise<{ paymentMethodId: string | null; error: string | null }>;
}

interface PaymentMethodFormProps {
    onReady?: (ready: boolean) => void; // Optional: για να ξέρει το parent αν η φόρμα είναι valid
}

const PaymentMethodForm = forwardRef<PaymentMethodFormRef, PaymentMethodFormProps>(
    ({ onReady }, ref) => {
        const stripe = useStripe();
        const elements = useElements();

        const handleSubmit = async (): Promise<{ paymentMethodId: string | null; error: string | null }> => {
            if (!stripe || !elements) {
                return { paymentMethodId: null, error: "Stripe δεν είναι έτοιμο" };
            }

            const { error, setupIntent } = await stripe.confirmSetup({
                elements,
                redirect: "if_required",
            });

            if (error) {
                return { paymentMethodId: null, error: error.message || "Σφάλμα κατά την επεξεργασία κάρτας" };
            }

            return { 
                paymentMethodId: setupIntent?.payment_method as string || null, 
                error: null 
            };
        };

        useImperativeHandle(ref, () => ({
            submit: handleSubmit
        }));

        return (
            <PaymentElement 
                onChange={(e) => onReady?.(e.complete)}
            />
        );
    }
);

export default PaymentMethodForm;
