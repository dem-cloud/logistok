"use client"
import React from 'react'
import styles from './ContactSection.module.css'
import ThemeButton from '../ThemeButton'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function ContactSection() {

    const router = useRouter()
    
    const handleClick = (section: string) => { //e: React.MouseEvent<HTMLButtonElement>
        
        localStorage.setItem('targetSection', section);
        router.push('/');
    }

    return (
        <div className={styles.aboutContact}>
            <span className={styles.title}>Ας Ξεκινήσουμε</span>
            <span className={styles.subtitle}>Ανακαλύψτε πώς το Logistok μπορεί να βοηθήσει την επιχείρησή σας να λειτουργήσει πιο αποδοτικά και να επιτύχει καλύτερα αποτελέσματα. Επικοινωνήστε μαζί μας για να μάθετε περισσότερα!</span>
            <div className={styles.buttons}>
                <Link href="/signup">
                    <ThemeButton 
                        variant='primary'
                        name='Ξεκινήστε'
                        customStyle='w-[270px] h-12'
                    />
                </Link>
                <ThemeButton 
                    variant='secondary'
                    name='Επικοινωνήστε Μαζί μας'
                    customStyle='w-[270px] h-12'
                    handleClick={()=>handleClick("contact")}
                />
            </div>
        </div>
    )
}
