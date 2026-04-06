import React, { useEffect } from "react";
import styles from "./SidePopup.module.css";
import Button from "./Button";
import LoadingSpinner from "@/components/LoadingSpinner";

export interface FooterButton {
    key?: string;
    label: string;
    onClick: () => void;
    show?: boolean;
    variant?: "primary" | "outline" | "secondary" | "dark" | "current" | "danger";
    widthFull?: boolean;
    disabled?: boolean;
    loading?: boolean;
    tooltip?: string | null;
}

interface SidePopupProps {
    isOpen: boolean;
    onClose: () => void;
    width?: string | number;
    title?: string;
    children: React.ReactNode;
    footerLeftButton?: FooterButton;
    footerRightButton?: FooterButton;
    /** Multiple action buttons (e.g. from document spec) - rendered between left and right */
    footerActions?: FooterButton[];
    contentClassName?: string;
    /** When true, shows a loading overlay over the content to prevent flash of wrong state */
    contentLoading?: boolean;
}

export default function SidePopup({
    isOpen,
    onClose,
    width = "480px",
    title = "",
    children,
    footerLeftButton,
    footerRightButton,
    footerActions,
    contentClassName,
    contentLoading = false,
}: SidePopupProps) {

    // ESC close
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        if (isOpen) window.addEventListener("keydown", handleEsc);
        return () => window.removeEventListener("keydown", handleEsc);
    }, [isOpen, onClose]);

    // Lock scroll
    useEffect(() => {
        document.body.style.overflow = isOpen ? "hidden" : "auto";
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div
            className={`${styles.overlay} ${styles.open}`}
            onClick={onClose}
        >
            <div
                className={styles.popup}
                style={{ width }}
                onClick={(e) => e.stopPropagation()}
            >

                {/* HEADER */}
                <div className={styles.header}>
                    <h3>{title}</h3>
                    <button className={styles.closeBtn} onClick={onClose}>✕</button>
                </div>

                {/* CONTENT */}
                <div className={`${styles.content} ${contentClassName || ""}`} style={{ position: "relative" }}>
                    {children}
                    {contentLoading && (
                        <div className={styles.contentOverlay}>
                            <LoadingSpinner />
                        </div>
                    )}
                </div>

                {/* FOOTER - hidden during content loading to prevent flash of wrong buttons */}
                {!contentLoading && (
                <div className={styles.footer}>
                    {footerLeftButton?.show !== false && footerLeftButton && (
                        <Button
                            variant={footerLeftButton.variant || "outline"}
                            onClick={footerLeftButton.onClick}
                            disabled={footerLeftButton.disabled}
                        >
                            {footerLeftButton.label || "Κλείσιμο"}
                        </Button>
                    )}
                    {footerActions?.map((btn, idx) =>
                        btn.show !== false ? (
                            <Button
                                key={btn.key ?? idx}
                                variant={btn.variant ?? "outline"}
                                onClick={btn.onClick}
                                disabled={btn.disabled}
                                loading={btn.loading}
                                title={btn.tooltip ?? undefined}
                            >
                                {btn.label}
                            </Button>
                        ) : null
                    )}
                    {footerRightButton?.show !== false && footerRightButton && (
                        <Button
                            variant={footerRightButton.variant || "primary"}
                            onClick={footerRightButton.onClick}
                            widthFull={footerRightButton.widthFull || false}
                            disabled={footerRightButton.disabled}
                            loading={footerRightButton.loading}
                        >
                            {footerRightButton.label || "Αποθήκευση"}
                        </Button>
                    )}
                </div>
                )}
            </div>
        </div>
    );
}