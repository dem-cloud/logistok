import StripeCheckoutForm from '@/components/StripeCheckoutForm'
import styles from './PaymentCheckout.module.css'
import { useOnboarding } from '../OnboardingContext'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BillingPeriod } from '@/types/billing.types'
import { axiosPrivate } from '@/api/axios'
import { BillingInfoFormRef } from '@/components/BillingInfoForm'

export default function PaymentCheckout() {
    
    const { onboardingData, updateDraft, completeOnboarding } = useOnboarding()
    
    const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(onboardingData.plan?.billing || "yearly");
    const [totalBranches, setTotalBranches] = useState(onboardingData.branches ?? 0);
    const [selectedPlugins, setSelectedPlugins] = useState(onboardingData.plugins ?? []);

    const [pricePreview, setPricePreview] = useState(null);
    const [priceLoading, setPriceLoading] = useState(false);

    // Billing info state for price preview
    const billingFormRef = useRef<BillingInfoFormRef>(null);
    const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
    const [taxId, setTaxId] = useState<string | null>(null);
    const [taxInfoIsValid, setTaxInfoIsValid] = useState(true);


    const fetchPricePreview = useCallback(async () => {
        if (!onboardingData.plan?.id) return;
        
        const params = {
            planId: onboardingData.plan.id,
            billingPeriod,
            totalBranches,
            plugins: selectedPlugins,
            billingInfo: selectedCountry ? {
                country: selectedCountry,
                taxId: taxId
            } : null
        }

        try {
            setPriceLoading(true);

            const response = await axiosPrivate.post('/api/billing/price-preview', params);

            const { success, data } = response.data;

            if (!success) {
                return;
            }

            setPricePreview(data);

        } catch (err) {
            console.log(err);
        } finally {
            setPriceLoading(false);
        }
    }, [onboardingData.plan?.id, billingPeriod, totalBranches, selectedPlugins, selectedCountry, taxId]);

    useEffect(() => {
        // Don't fetch if taxId exists but isn't validated
        if (taxId && !taxInfoIsValid) return;
        fetchPricePreview();
    }, [fetchPricePreview, taxInfoIsValid]);

    
    const handleCountryChange = (country: string) => {
        setSelectedCountry(country);
    };

    const handleTaxIdChange = (taxId: string) => {
        setTaxId(taxId);
    };

    const handleTaxInfoIsValidChange = (isValid: boolean) => {
        setTaxInfoIsValid(isValid);
    };
    

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
                    billingPeriod={billingPeriod}
                    onBillingPeriodChange={handleBillingChange}
                    totalBranches={totalBranches}
                    handleIncreaseTotalBranches={handleIncreaseTotalBranches}
                    handleDecreaseTotalBranches={handleDecreaseTotalBranches}
                    selectedPlugins={selectedPlugins}
                    onRemovePlugin={handleRemovePlugin}

                    pricePreview={pricePreview} 
                    loading={priceLoading}

                    billingFormRef={billingFormRef}
                    onCountryChange={handleCountryChange}
                    onTaxIdChange={handleTaxIdChange}
                    onTaxInfoIsValidChange={handleTaxInfoIsValidChange}

                    completeOnboarding={completeOnboarding}
                    onSuccess={() => {}}
                />
            }
        </div>
    )
}