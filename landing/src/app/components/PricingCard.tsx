import React from 'react'
import styles from './PricingCard.module.css'
import Link from 'next/link';
import ThemeButton from './ThemeButton';
import Image from 'next/image';
import TickIcon from '../../../public/tick_icon.png'

interface Pricing {
    title?: string;
    subtitle?: string;
    priceText: string;
    secondaryPriceText?: string;
    features?: string[];
    suggested?: boolean;
}

export default function PricingCard(props: Pricing) {

    const {
        title = "Plan Title",
        subtitle = "Subtitle",
        priceText,
        secondaryPriceText = "",
        features = [],
        suggested = false
    } = props;

    return (
        <div 
            className={`${styles.card} ${suggested ? styles.suggested : ''}`}
        >
            <span className={styles.title}>
                {title}
            </span>
            <span className={styles.subtitle}>
                {subtitle}
            </span>
            <div className={styles.priceTextContainer}>
                <span className={styles.priceText}>{priceText}</span>
                <span className={styles.secondaryPriceText}>{secondaryPriceText}</span>
            </div>

            <Link className='flex mt-4' href="/signup">
                <ThemeButton 
                    name="Ξεκινήστε" 
                    variant="primary" 
                />
            </Link>

            <div className={styles.features}>
            {
                features.map((feature,index) => (
                    <div 
                        key={index} 
                        className='flex items-center mb-1'
                    >
                        <Image
                            alt=''
                            src={TickIcon}
                            width={27}
                            height={27}
                        />
                        <span className='ml-2'>{feature}</span>
                    </div>
                ))
            }
            </div>
        </div>
    )
}
