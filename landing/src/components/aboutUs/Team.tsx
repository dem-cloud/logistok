import React from 'react'
import styles from './Team.module.css'
import Image from 'next/image';
import Me from '../../../public/me.png'

export default function Team() {
    return (
        <section className={styles.aboutTeam}>
            <div className={styles.teamText}>
                <span className={styles.title}>Η Ομάδα μας</span>
                <span className={styles.subtitle}>Το Logistok υποστηρίζεται από μια αφοσιωμένη ομάδα επαγγελματιών που είναι παθιασμένοι με τη δημιουργία λύσεων που βοηθούν τις επιχειρήσεις να πετύχουν. Είμαστε δεσμευμένοι στην κατασκευή εργαλείων που διευκολύνουν τη διαχείριση της επιχείρησής σας με αποδοτικότητα και αποτελεσματικότητα.</span>
            </div>
            <div className={styles.imagePanel}>
                <Image
                    alt=''
                    src={Me}
                    width={235}
                    height={0}
                    className={styles.image}
                />
            </div>
        </section>
    );
}
