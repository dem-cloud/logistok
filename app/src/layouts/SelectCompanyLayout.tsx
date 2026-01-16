import { useAuth } from "@/contexts/AuthContext";
import styles from './SelectCompanyLayout.module.css'

type SelectCompanyLayoutProps = {
    children?: React.ReactNode;
};

export const SelectCompanyLayout: React.FC<SelectCompanyLayoutProps> = ({ children }) => {
    const { logout } = useAuth();
    
    return (
        <div className={styles.selectCompanyContainer}>
            <header className={styles.simpleTopbar}>
                <div className={styles.brand}>
                    <span className={styles.brandIcon}>L</span>
                    <span className={styles.brandName}>Logistok</span>
                </div>
                <button className={styles.logoutButton} onClick={logout}>
                    Αποσύνδεση
                </button>
            </header>
            <main className={styles.selectCompanyMain}>
                {children}
            </main>
        </div>
    );
};