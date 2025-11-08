import React from 'react'
import styles from './Header.module.css'

export default function Header() {
    return (
        <section className={styles.header}>
            <div className={styles.headerText}>
                <span className={styles.title}>
                    Ενδιαφέρεσαι να γίνεις μέλος της ομάδας Logistok;
                </span>
                <span className={styles.subtitle}>
                    Αν είσαι δημιουργικός, έχεις κίνητρο και θέλεις κάτι περισσότερο από μια απλή δουλειά, ρίξε μια ματιά στις παρακάτω θέσεις. Θα θέλαμε να σε γνωρίσουμε!
                </span>
            </div>
        </section>
    )
}
