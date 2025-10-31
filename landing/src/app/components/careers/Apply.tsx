import React from 'react'
import styles from './Apply.module.css'

export default function Apply() {
    return (
        <section className={styles.apply}>
            <div className={styles.text}>
                <span className={styles.title}>
                    Πώς να Κάνεις Αίτηση
                </span>
                <span className={styles.subtitle}>
                    Στείλε μας το βιογραφικό σου στο 📧 info@logistok.com.
                    <br/>
                    Ανυπομονούμε να σε γνωρίσουμε! 🚀
                </span>
            </div>
        </section>
    )
}
