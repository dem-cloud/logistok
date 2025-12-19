import { Plugin } from '@/onboarding/types';
import styles from './PluginCard.module.css';
import { Lock } from 'lucide-react';


type PluginCardProps = {
    item: Plugin;
    selected: boolean;
    onSelect: () => void;
    locked: boolean;
};

export function PluginCard({ item, selected, onSelect, locked = true }: PluginCardProps) {

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('el-GR', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(price);
    };

    return (
        <button
            type="button"
            className={`
                ${styles.card}
                ${selected ? styles.selected : ""}
                ${locked ? styles.locked : ""}
            `}
            onClick={!locked ? onSelect : undefined}
            disabled={locked}
            aria-disabled={locked}
            aria-pressed={selected}
        >
            {item.photo_url && (
                <div className={styles.imageWrapper}>
                    <img 
                        src={item.photo_url} 
                        alt={item.name}
                        className={styles.image}
                    />
                </div>
            )}
            
            <div className={styles.content}>
                <div className={styles.header}>
                    <h3 className={styles.name}>{item.name}</h3>
                    {item.current_version && (
                        <span className={styles.version}>v{item.current_version}</span>
                    )}
                </div>
                
                {item.description && (
                    <p className={styles.description}>{item.description}</p>
                )}

                <div className={styles.priceContainer}>
                    <span className={styles.price}>{formatPrice(item.base_price_per_month)}</span>
                    <span className={styles.priceLabel}>/μήνα</span>
                </div>
            </div>

            <div className={styles.checkbox}>
                {locked ? (
                    <div
                        className={styles.lockIcon}
                        title="Τα premium plugins είναι διαθέσιμα μόνο σε πλάνο επί πληρωμή"
                    >
                        <Lock size={14} />
                    </div>
                ) : (
                    selected && (
                        <svg
                            width="20"
                            height="20"
                            viewBox="0 0 20 20"
                            fill="none"
                            className={styles.checkIcon}
                        >
                            <path
                                d="M16.6667 5L7.50004 14.1667L3.33337 10"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    )
                )}
            </div>
        </button>
    );
}

