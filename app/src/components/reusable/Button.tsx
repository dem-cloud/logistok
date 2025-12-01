import React, { ReactNode } from "react";
import styles from "./Button.module.css";
import Spinner from "../Spinner";

interface ButtonProps {
    children: ReactNode;
    onClick?: (() => void) | ((e: React.MouseEvent<HTMLButtonElement>) => void);
    type?: "button" | "submit" | "reset";
    variant?: "primary" | "secondary" | "dark" | "outline" | "current";
    disabled?: boolean;
    loading?: boolean;
    widthFull?: boolean;
}

const Button: React.FC<ButtonProps> = ({
    children,
    onClick,
    type = "button",
    variant = "primary",
    disabled = false,
    loading = false,
    widthFull = false
}) => {
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            className={`${styles.button} ${styles[variant]} ${
              disabled ? styles.disabled : ""
            }`}
            style={{width: widthFull ? "100%" : ""}}
        >
            {loading && <Spinner />}
            {children}
        </button>
    );
};

export default Button;
