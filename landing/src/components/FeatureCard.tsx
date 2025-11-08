import React from 'react'
import styles from './FeatureCard.module.css'
import Image, { StaticImageData } from 'next/image';
import DefaultIcon from '../../public/default_icon.png'

interface Feature {
    labelColor?: string;
    title?: string;
    subtitle?: string;
    image?: StaticImageData | string;
}

export default function FeatureCard(props:Feature) {

    const {
        labelColor = "#3F72E7",
        title = "Card Title",
        subtitle = "Subtitle",
        image = DefaultIcon
    } = props;

    return (
        <div className={styles.card}>
            <div 
                className={styles.labelColor}
                style={{backgroundColor:labelColor}}
            >
            </div>
            <div className={styles.container}>

                <span className={styles.title}>
                    {title}
                </span>
                <span className={styles.subtitle}>
                    {subtitle}
                </span>
            
                <div className={styles.image}>
                    <Image
                        alt=''
                        src={image}
                        width={70}
                        height={70}
                    />
                </div>
            </div>
        </div>
    )
}
