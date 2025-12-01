import React, { useEffect } from "react";
import styles from "./SidePopup.module.css";
import Button from "./Button";

interface FooterButton {
    label: string;
    onClick: () => void;
    show?: boolean;
    variant?: "primary" | "outline" | "secondary" | "dark"; // Your variants
    widthFull?: boolean;
}

interface SidePopupProps {
    isOpen: boolean;
    onClose: () => void;
    width?: string | number;
    title?: string;
    children: React.ReactNode;
    footerLeftButton?: FooterButton;
    footerRightButton?: FooterButton;
}

export default function SidePopup({
    isOpen,
    onClose,
    width = "480px",
    title = "",
    children,
    footerLeftButton,
    footerRightButton,
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

    return (
        <div
            className={`${styles.overlay} ${isOpen ? styles.open : ""}`}
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
                <div className={styles.content}>
                    {children}
                </div>

                {/* FOOTER */}
                <div className={styles.footer}>

                    {footerLeftButton?.show !== false && footerLeftButton && (
                        <Button
                            variant={footerLeftButton.variant || "outline"}
                            onClick={footerLeftButton.onClick}
                        >
                            {footerLeftButton.label || "Ακύρωση"}
                        </Button>
                    )}

                    {footerRightButton?.show !== false && footerRightButton && (
                        <Button
                            variant={footerRightButton.variant || "primary"}
                            onClick={footerRightButton.onClick}
                            widthFull={footerRightButton.widthFull || false}
                        >
                            {footerRightButton.label || "Αποθήκευση"}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
