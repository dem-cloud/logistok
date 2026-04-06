import {
    SALES_STATUS_CONFIG,
    PURCHASE_STATUS_CONFIG,
    getSalesStatusLabel,
    getPurchaseStatusLabel,
} from "@/config/documentTypes";
import styles from "./StatusBadge.module.css";

type StatusBadgeProps = {
    status: string;
    variant: "sales" | "purchase";
};

export default function StatusBadge({ status, variant }: StatusBadgeProps) {
    const config =
        variant === "sales"
            ? SALES_STATUS_CONFIG[status]
            : PURCHASE_STATUS_CONFIG[status];
    const label =
        variant === "sales"
            ? getSalesStatusLabel(status)
            : getPurchaseStatusLabel(status);
    const color = config?.color ?? "#6b7280";

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
