import StripeCheckoutForm from '@/components/StripeCheckoutForm'
import styles from './PaymentCheckout.module.css'
import { useOnboarding } from '../OnboardingContext'
import { useEffect, useState } from 'react'
import { BillingPeriod } from '@/types/billing.types'
import { axiosPrivate } from '@/api/axios'

export default function PaymentCheckout() {
    
    const { onboardingData, updateDraft, completeOnboarding } = useOnboarding()

    const [companyName, setCompanyName] = useState(onboardingData.company.name || "");
    const [companyNameError, setCompanyNameError] = useState<string | undefined>(undefined);
    const [vatNumber, setVatNumber] = useState("");

    const validate = () => {
        if (!companyName.trim()) {
            setCompanyNameError("Το όνομα εταιρείας είναι υποχρεωτικό");
            return false;
        }

        setCompanyNameError(undefined);
        return true;
    };
    
    const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(onboardingData.plan?.billing || "yearly");
    const [totalBranches, setTotalBranches] = useState(onboardingData.branches ?? 0);
    const [selectedPlugins, setSelectedPlugins] = useState(onboardingData.plugins ?? []);

    const [pricePreview, setPricePreview] = useState(null);
    const [priceLoading, setPriceLoading] = useState(false);

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

                setPriceLoading(true)

                const response = await axiosPrivate.post('/api/billing/price-preview', params);

                const { success, data } = response.data;

                if (!success) {
                    // showToast({ message: "Κάτι πήγε στραβά", type: "error" });
                    return;
                }

                setPricePreview(data);

            } catch (err) {
                console.log(err);
            } finally {
                setPriceLoading(false);
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


    return (
        <div className={styles.content}>
            <div className={styles.title}>Ενεργοποίηση Συνδρομής</div>
            <div className={styles.tagline}>Ασφαλής πληρωμή και άμεση πρόσβαση σε όλες τις λειτουργίες</div>
            {pricePreview &&
                <StripeCheckoutForm 
                    billingPeriod = {billingPeriod}
                    onBillingPeriodChange = {handleBillingChange}
                    totalBranches={totalBranches}
                    handleIncreaseTotalBranches={handleIncreaseTotalBranches}
                    handleDecreaseTotalBranches={handleDecreaseTotalBranches}
                    selectedPlugins={selectedPlugins}
                    onRemovePlugin={handleRemovePlugin}

                    mode = "onboarding"
                    pricePreview={pricePreview} 
                    loading={priceLoading}

                    companyName={companyName}
                    companyNameError={companyNameError}
                    onCompanyNameChange={(v) => {
                        setCompanyName(v);
                        setCompanyNameError(undefined);
                    }}
                    vatNumber = {vatNumber}
                    onVatNumberChange={setVatNumber}
                    validate={validate}

                    completeOnboarding={completeOnboarding}
                    onSuccess = {() => {}}
                />
            }
        </div>
    )
}
