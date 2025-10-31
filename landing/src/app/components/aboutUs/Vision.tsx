import React from 'react'
import styles from './Vision.module.css'

export default function Vision() {
    return (
        <section className={styles.aboutVision}>
            <span className={styles.title}>Το Οραμά μας</span>
            <div className={styles.cards}>
                <div className={styles.card}>
                    <span className={styles.cardTitle}>Βελτιώστε την αποδοτικότητα σας</span>
                    <span className={styles.cardSubtitle}>Στόχος μας είναι να βοηθήσουμε τις επιχειρήσεις να εργάζονται πιο αποδοτικά, μειώνοντας τον χρόνο και την προσπάθεια που απαιτείται για τη διαχείριση των διαδικασιών τους.</span>
                </div>
                <div className={styles.separator}></div>
                <div className={styles.card}>
                    <span className={styles.cardTitle}>Οργανωθείτε και αναπτυχθείτε</span>
                    <span className={styles.cardSubtitle}>Με το Logistok, οι επιχειρήσεις μπορούν να παραμείνουν οργανωμένες, διατηρώντας πλήρη έλεγχο των λειτουργιών τους σε κάθε στάδιο.</span>
                </div>
                <div className={styles.separator}></div>
                <div className={styles.card}>
                    <span className={styles.cardTitle}>Όλα σε μία πλατφόρμα</span>
                    <span className={styles.cardSubtitle}>Συγκεντρώνουμε όλα τα απαραίτητα εργαλεία σε ένα μέρος, ώστε να μπορείτε να επικεντρωθείτε σε αυτά που έχουν πραγματικά σημασία για την ανάπτυξη της επιχείρησής σας.</span>
                </div>
            </div>
        </section>
    )
}
