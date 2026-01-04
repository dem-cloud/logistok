import StripeCheckoutForm from '@/components/StripeCheckoutForm'
import styles from './PaymentCheckout.module.css'
import { useOnboarding } from '../OnboardingContext'
import { useEffect, useState } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useNavigate } from 'react-router-dom'
import { BillingPeriod } from '@/types/billing.types'
import { axiosPrivate } from '@/api/axios'

export default function PaymentCheckout() {

    const navigate = useNavigate();
    
    const { onboardingData, updateDraft } = useOnboarding()
    
    const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(onboardingData.plan?.billing || "yearly");
    const [totalBranches, setTotalBranches] = useState(onboardingData.branches ?? 0);
    const [selectedPlugins, setSelectedPlugins] = useState(onboardingData.plugins ?? []);

    const [pricePreview, setPricePreview] = useState(null);

    useEffect(() => {
        const fetchPricePreview = async () => {

            if (!onboardingData.plan?.id) return;
            
            const params = {
                planId: onboardingData.plan.id,
                billingPeriod,
                totalBranches,
                plugins: selectedPlugins
            }

            try {
                const response = await axiosPrivate.post('/api/billing/price-preview', params);

                const { success, data } = response.data;

                if (!success) {
                    // showToast({ message: "Κάτι πήγε στραβά", type: "error" });
                    return;
                }

                setPricePreview(data);

            } catch (err) {
                console.log(err);
            }
        };

        fetchPricePreview();
    }, [onboardingData.plan?.id, billingPeriod, totalBranches, selectedPlugins]);

    const handleBillingChange = async (period: BillingPeriod) => {
        if (!onboardingData.plan?.id) return;
        
        setBillingPeriod(period);

        await updateDraft({ plan: { id: onboardingData.plan.id, billing: period } });
    }

    const handleIncreaseTotalBranches = async () => {
        setTotalBranches(prev => {
            const newVal = prev + 1;
            updateDraft({ branches: newVal }); 
            return newVal;
        })
    }

    const handleDecreaseTotalBranches = async () => {
        setTotalBranches(prev => {
            const newVal = Math.max(0, prev - 1);
            updateDraft({ branches: newVal });
            return newVal;
        })
    }


    const handleRemovePlugin = async (pluginKey: string) => {
        if (!onboardingData.plugins?.includes(pluginKey)) return;

        setSelectedPlugins(prev => prev.filter(k => k !== pluginKey))

        await updateDraft({ plugins: onboardingData.plugins.filter(k => k !== pluginKey) })
    }


    if (!onboardingData.plan?.id)
        return <LoadingSpinner />

    return (
        <div className={styles.content}>
            <div className={styles.title}>Ενεργοποίηση Συνδρομής</div>
            <div className={styles.tagline}>Ασφαλής πληρωμή και άμεση πρόσβαση σε όλες τις λειτουργίες</div>
            {pricePreview &&
                <StripeCheckoutForm 
                    planId = {onboardingData.plan.id}

                    billingPeriod = {billingPeriod}
                    onBillingPeriodChange = {handleBillingChange}
                    totalBranches={totalBranches}
                    handleIncreaseTotalBranches={handleIncreaseTotalBranches}
                    handleDecreaseTotalBranches={handleDecreaseTotalBranches}
                    selectedPlugins={selectedPlugins}
                    onRemovePlugin={handleRemovePlugin}

                    mode = "onboarding"
                    pricePreview={pricePreview} 
                    onSuccess = {() => {
                        navigate("/");
                    }}
                />
            }
        </div>
    )
}
