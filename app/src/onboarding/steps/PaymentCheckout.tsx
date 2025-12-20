import StripeCheckoutForm from '@/components/StripeCheckoutForm'
import styles from './PaymentCheckout.module.css'
import { useOnboarding } from '../OnboardingContext'
import { useState } from 'react'
import { usePlans } from '@/hooks/usePlans'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useNavigate } from 'react-router-dom'

type BillingPeriod = "monthly" | "yearly";

export default function PaymentCheckout() {

    const navigate = useNavigate();
    
    const { data: plans = [] } = usePlans();
    const { onboardingData } = useOnboarding()
    
    const selectedPlan = plans.find( p => p.id === onboardingData.plan?.id ) ?? null;
    const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(onboardingData.plan?.billing || "yearly");

    const handleBillingChange = async (period: BillingPeriod) => {
        setBillingPeriod(period);

        // ενημέρωση draft (σωστό!)
        // await updateDraft({
        //     plan: {
        //         ...onboardingData.plan,
        //         billing_period: period
        //     }
        // });
    };

    if (!selectedPlan)
        return <LoadingSpinner />

    return (
        <div className={styles.content}>
            <div className={styles.contentWidth}>
                <StripeCheckoutForm 
                    plan = {selectedPlan}
                    billingPeriod = {billingPeriod}
                    onBillingPeriodChange = {handleBillingChange}
                    mode = "onboarding"
                    onSuccess = {() => {
                        navigate("/");
                    }}
                />
            </div>
        </div>
    )
}
