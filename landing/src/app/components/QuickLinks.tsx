"use client"
import React from 'react'
import styles from './Footer.module.css'
import { useRouter } from 'next/navigation'

export default function QuickLinks() {

    const router = useRouter()

    const handleClick = (section: string) => { //e: React.MouseEvent<HTMLButtonElement>
        if (window.location.pathname === '/') {
            // const section = e.currentTarget.dataset.name;
            // if (section) {
                window.dispatchEvent(new CustomEvent("scrollToSection", { detail: section }));
            // }
        } else {
            localStorage.setItem('targetSection', section);
            router.push('/');
        }
    }

    return (
        <div className={styles.column}>
            <span className={styles.title}>Γρήγοροι Σύνδεσμοι</span>
            <button data-name="home" onClick={()=>handleClick("home")}>Αρχική</button>
            <button data-name="features" onClick={()=>handleClick("features")}>Χαρακτηριστικά</button>
            <button data-name="industries" onClick={()=>handleClick("industries")}>Κλάδοι</button>
            <button data-name="pricing" onClick={()=>handleClick("pricing")}>Τιμολόγηση</button>
            <button data-name="contact" onClick={()=>handleClick("contact")}>Επικοινωνία</button>
        </div>
    )
}
