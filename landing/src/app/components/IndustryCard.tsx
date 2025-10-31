import React from 'react'
import styles from './IndustryCard.module.css'
import DefaultIcon from '../../../public/default_icon.png'
import Image, { StaticImageData } from 'next/image';

interface Industry {
    image?: StaticImageData | string;
    title?: string;
    subtitle?: string;
    available?: boolean;
}

export default function IndustryCard(props:Industry) {

    const {
        title = "Card Title",
        subtitle = "Subtitle",
        image = DefaultIcon,
        available = true
    } = props;

    return (
        <div className={`${styles.card} ${available ? styles.hoverable : ''}`}>
            <Image
                alt=''
                src={image}
                width={70}
                height={70}
            />
            <span className={styles.title}>
                {title}
            </span>
            <span className={styles.subtitle}>
            {subtitle}
            </span>
            {!available && <div className={styles.notAvailable}></div>}
            {!available &&<span className={styles.ribbon}>ΕΡΧΕΤΑΙ ΣΥΝΤΟΜΑ</span>}
        </div>
    )
}
