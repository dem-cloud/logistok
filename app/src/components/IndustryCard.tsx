import { Industry } from "../onboarding/types";
import styles from "./IndustryCard.module.css";

interface Props {
    item: Industry;
    selected: boolean;
    onSelect: () => void;
}

export default function IndustryCard({ item, selected, onSelect }: Props) {
    const { name, description, photo_url } = item;

    return (
        <button
            type="button"
            className={`${styles.card} ${selected ? styles.selected : ''}`}
            onClick={onSelect}
            aria-pressed={selected}
        >
            {photo_url && (
                <div className={styles.imageWrapper}>
                    <img 
                        src={photo_url} 
                        alt={name}
                        className={styles.image}
                    />
                </div>
            )}
            
            <div className={styles.content}>
                <h3 className={styles.name}>{name}</h3>
                {description && (
                    <p className={styles.description}>{description}</p>
                )}
            </div>

            <div className={styles.checkbox}>
                {selected && (
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
                )}
            </div>
        </button>
    );
}
