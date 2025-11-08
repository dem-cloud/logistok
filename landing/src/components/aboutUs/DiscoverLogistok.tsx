import React from 'react'
import styles from './DiscoverLogistok.module.css'
import Image from 'next/image'
import PieIcon from '../../../public/pie_icon.png'
import TableIcon from '../../../public/table_icon.png'
import ChartIcon from '../../../public/chart_icon.png'

export default function DiscoverLogistok() {
    return (
        <section className={styles.aboutWhyLogistok}>
            <div className={styles.cards}>
                <div className={styles.card}>
                    <span className={styles.cardTitle}>Ολοκληρωμένη λύση</span>
                    <span className={styles.cardSubtitle}>Εύκολη και αποτελεσματική διαχείριση</span>
                    <Image
                        alt=''
                        src={PieIcon}
                        height={77}
                        width={77}
                        style={{alignSelf:"flex-end"}}
                    />
                </div>
                <div className={styles.card}>
                    <span className={styles.cardTitle}>Έλεγχος σε πραγματικό χρόνο</span>
                    <span className={styles.cardSubtitle}>Πάντα ενημερωμένοι, πάντα μπροστά</span>
                    <Image
                        alt=''
                        src={TableIcon}
                        height={64}
                        width={64}
                        style={{alignSelf:"flex-end"}}
                    />
                </div>
                <div className={styles.card}>
                    <span className={styles.cardTitle}>Απλοποιημένη διαχείριση</span>
                    <span className={styles.cardSubtitle}>Όλα όσα χρειάζεστε σε μία πλατφόρμα</span>
                    <Image
                        alt=''
                        src={ChartIcon}
                        height={50}
                        width={50}
                        style={{alignSelf:"flex-end"}}
                    />
                </div>
            </div>
            <div className={styles.whyLogistokText}>
                <span className={styles.title}>Ανακαλύψτε το Logistok</span>
                <span className={styles.subtitle}>Το Logistok προσφέρει μια ολοκληρωμένη πλατφόρμα που συγκεντρώνει όλα όσα χρειάζεστε για τη διαχείριση της επιχείρησής σας, με μέγιστο έλεγχο και ευκολία χρήσης.</span>
            </div>
        </section>
    )
}
