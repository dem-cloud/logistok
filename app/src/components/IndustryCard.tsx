import styles from "./IndustryCard.module.css";

interface Industry {
    id: number;
    display_name: string;
    description: string;
    photo_url: string;
}

interface Props {
    item: Industry;
    selected: boolean;
    onSelect: () => void;
    hasError: boolean;
}

export default function IndustryCard({ item, selected, onSelect, hasError }: Props) {
    const { display_name, description, photo_url } = item;

    return (
        <div
            className={`${styles.card} 
                ${selected ? styles.selected : ""} 
                ${hasError && !selected ? styles.errorBorder : ""}`}
            onClick={onSelect}
        >
            <img src={photo_url} alt={display_name} className={styles.image} />

            <div>
                <h3 className={styles.title}>{display_name}</h3>
                <p className={styles.desc}>{description}</p>
            </div>
        </div>
    );
}
