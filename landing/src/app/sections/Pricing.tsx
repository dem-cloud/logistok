"use client"
import React, { useState } from 'react'
import styles from './Pricing.module.css'
import pricingData from '@/data/pricingData.json';
import PricingCard from '../components/PricingCard';
import ToggleSwitch from '../components/ToggleSwitch';

interface Pricing {
    id: number;
    title?: string;
    subtitle?: string;
    priceText: {
        monthly: string;
        yearly: string;
    };
    secondaryPriceText?: string;
    features?: string[];
    suggested?: boolean;
}

const plans: Pricing[] = pricingData;

export default function Pricing() {

    const [isYearly, setIsYearly] = useState(false);

    return (
        <div className={styles.section}>
            <span className={styles.title}>Επιλέξτε το πλάνο που ταιριάζει στις ανάγκες σας.</span>

            <div className={styles.switch}>
                <ToggleSwitch 
                    isYearly = {isYearly}
                    setIsYearly = {setIsYearly}
                />
            </div>
            <div className={styles.cards}>
                {plans.map(plan => (
                    <PricingCard 
                        key={plan.id}
                        title = {plan.title}
                        subtitle = {plan.subtitle}
                        priceText = {isYearly ? plan.priceText.yearly : plan.priceText.monthly}
                        secondaryPriceText = {plan.secondaryPriceText}
                        features = {plan.features}
                        suggested = {plan.suggested}
                    />
                ))}
            </div>
        </div>
    )
}
