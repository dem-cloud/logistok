import React from 'react'
import styles from './CheckYourEmail.module.css'
import Link from 'next/link'
import Image from 'next/image'
import EmailIcon from '../../public/email_icon.png'

export default function CheckYourEmail() {
    return (
        <div className={styles.form}>
            <div className={styles.image}>
            <Image
                alt=''
                src={EmailIcon}
                height={120}
                width={120}
            />
            </div>
                
            <span className={styles.title}>Ελέγξτε το Email σας</span>
            <span className={styles.text}>
                Έχουμε στείλει ένα σύνδεσμο επαναφοράς κωδικού στο email σας. Παρακαλούμε ελέγξτε τα εισερχόμενά σας και ακολουθήστε τις οδηγίες.
            </span>
            <Link href='/' className={styles.link}>
                Επιστροφή στην Αρχική
            </Link>
            <span className={styles.smallText}>
                Ο σύνδεσμος επαναφοράς θα λήξει σε 1 ώρα. Αν δεν δείτε το email, παρακαλούμε ελέγξτε τον φάκελο ανεπιθύμητης αλληλογραφίας.
            </span>
            
        </div>
    )
}
