import React from 'react';
import styles from './Topbar.module.css';

type TopbarProps = {
    breadcrumb?: string[];
    title?: string;
};

export const Topbar: React.FC<TopbarProps> = ({
    breadcrumb,
    title,
}) => {

    return (
        <header className={styles.topbar}>
            <div className={styles.left}>
                {breadcrumb && breadcrumb.length > 0 && (
                    <div className={styles.breadcrumb}>
                        {breadcrumb.map((crumb, idx) => (
                            <React.Fragment key={idx}>
                                <span
                                    className={
                                        idx === breadcrumb.length - 1
                                            ? styles.crumbMuted
                                            : styles.crumb
                                    }
                                >
                                    {crumb}
                                </span>
                                {idx < breadcrumb.length - 1 && (
                                    <span className={styles.chevron} />
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                )}
                {title && <h2 className={styles.title}>{title}</h2>}
            </div>

            <div className={styles.actions}>
                <div className={styles.search}>
                    <span className={styles.searchIcon} />
                    <input placeholder="Αναζήτηση" />
                </div>

                <button className={styles.iconButton} aria-label="Ειδοποιήσεις">
                    <span className={`${styles.icon} ${styles.bell}`} />
                </button>
            </div>
        </header>
    );
};

export default Topbar;

