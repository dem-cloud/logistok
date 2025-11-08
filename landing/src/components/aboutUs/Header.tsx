import React from 'react'
import styles from './Header.module.css'

export default function Header() {
    return (
        <section className={styles.aboutHeader}>
            <div className={styles.headerText}>
                <span className={styles.title}>
                    Logistok - Η ολοκληρωμένη λύση ERP για μικρές και μεσαίες επιχειρήσεις.
                </span>
                <span className={styles.subtitle}>
                    {`Το Logistok βελτιώνει την οργάνωση, παρακολουθεί αποθέματα και χρηματοοικονομικά, και ενισχύει σχέσεις με πελάτες και προμηθευτές.\nΜια εύχρηστη πλατφόρμα για αποδοτική διαχείριση και έξυπνες αποφάσεις, ανεξαρτήτως κλάδου.`}
                </span>
            </div>
        </section>
    )
}
