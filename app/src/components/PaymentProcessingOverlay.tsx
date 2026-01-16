import styles from './PaymentProcessingOverlay.module.css'

interface Props {
    isVisible: boolean;
}

const PaymentProcessingOverlay = ({ isVisible }: Props) => {
    if (!isVisible) return null;

    return (
        <div className={styles.overlay}>
            <div className={styles.content}>
                <div className={styles.spinner}>
                    <div className={styles.spinnerRing}></div>
                    <div className={styles.spinnerRing}></div>
                    <div className={styles.spinnerRing}></div>
                </div>
                <h2 className={styles.title}>Επεξεργασία Πληρωμής</h2>
                <p className={styles.message}>
                    Η συναλλαγή σας επεξεργάζεται. Παρακαλούμε μην κλείσετε αυτή τη σελίδα.
                </p>
            </div>
        </div>
    );
};

export default PaymentProcessingOverlay;