import React from 'react'
import styles from './Contact.module.css'
import ContactForm from '../components/ContactForm'

export default function Contact() {
    return (
        <div className={styles.section}>
            <span className={styles.title}>Επικοινωνήστε Μαζί Μας – Ας Βελτιστοποιήσουμε τα Logistics σας!</span>
            <span className={styles.subtitle}>Επικοινωνήστε μαζί μας για demo, πληροφορίες τιμολόγησης ή υποστήριξη. Η ομάδα μας είναι έτοιμη να σας βοηθήσει!</span>

            <div className={styles.form}>
                <ContactForm />
            </div>
        </div>
    )
}
