import {
    getSalesDocTypeConfig,
    getPurchaseDocTypeLabel,
    PURCHASE_DOC_TYPES,
} from "@/config/documentTypes";
import styles from "./DocTypeBadge.module.css";

type DocTypeBadgeProps = {
    value: string;
    variant: "sales" | "purchase";
};

export default function DocTypeBadge({ value, variant }: DocTypeBadgeProps) {
    const normalized = (value || "").toString().toUpperCase();
    const entry =
        variant === "sales"
            ? getSalesDocTypeConfig(value)
            : PURCHASE_DOC_TYPES.find((t) => t.value === normalized) ?? null;
    const label =
        variant === "sales"
            ? (entry?.label ?? value)
            : (entry?.label ?? getPurchaseDocTypeLabel(value) ?? value);
    const color = entry?.badgeColor ?? "#6b7280";

    return (
        <span
            className={styles.badge}
            style={{
                backgroundColor: `${color}20`,
                color: color,
                borderColor: `${color}40`,
            }}
        >
            {label}
        </span>
    );
}
