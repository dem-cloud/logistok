import React from 'react'
import styles from './OpenPositions.module.css'
import Image from 'next/image'
import LocationIcon from '../../../../public/location_icon.png'
import openPositionsData from '@/data/openPositionsData.json';

interface OpenPositions {
    id: number;
    position?: string;
    location?: string;
}

const openPositions: OpenPositions[] = openPositionsData;

export default function OpenPositions() {

    return (
        <section className={styles.openPositions}>
            { openPositions.length > 0 ?
                openPositions.map((pos,index) => {
                    const {position, location} = pos;
                    return  <div 
                                key={index}
                                className={styles.card}
                            >
                                <span className={styles.cardTitle}>{position}</span>
                                <div className={styles.cardSubtitle}>
                                    <Image 
                                        alt=''
                                        src={LocationIcon}
                                        width={16}
                                        height={16}
                                    />
                                    <span>{location}</span>
                                </div>
                            </div>
                })
            :
                <div className={styles.card}>
                    <span className={styles.notAvailablePositions}>Δεν υπάρχουν ανοιχτές θέσεις.</span>
                </div>
            }
        </section>
    )
}
