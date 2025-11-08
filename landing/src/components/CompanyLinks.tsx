"use client"
import React from 'react'
import styles from './Footer.module.css'
import { useRouter } from 'next/navigation'

export default function CompanyLinks() {

    const router = useRouter()
    
    const handleClick = (section: string) => {
        
        if (window.location.pathname === `/${section}`) {
            window.dispatchEvent(new CustomEvent("scrollToSection", { detail: section }));
        } else {
            localStorage.setItem('targetSection', section);
            router.push(`/${section}`);
        }
    }

    return (
        <div className={styles.column}>
            <span className={styles.title}>Η Εταιρεία</span>
            <button onClick={()=>handleClick("about-us")}>
                <span>Σχετικά με εμάς</span>
            </button>
            <button onClick={()=>handleClick("careers")}>
                <span>Καριέρες</span>
            </button>
            <button onClick={()=>handleClick("terms")}>
                <span>Όροι Χρήσης</span>
            </button>
            <button onClick={()=>handleClick("privacy-policy")}>
                <span>Πολιτική Απορρήτου</span>
            </button>
        </div>
    )
}
