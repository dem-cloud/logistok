import React, { ReactNode } from "react";
import styles from "./Button.module.css";
import Spinner from "../Spinner";

interface ButtonProps {
    children: ReactNode;
    onClick?: (() => void) | ((e: React.MouseEvent<HTMLButtonElement>) => void);
    type?: "button" | "submit" | "reset";
    variant?: "primary" | "secondary" | "outline";
    disabled?: boolean;
    loading?: boolean;
}

const Button: React.FC<ButtonProps> = ({
    children,
    onClick,
    type = "button",
    variant = "primary",
    disabled = false,
    loading = false
}) => {
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            className={`${styles.button} ${styles[variant]} ${
              disabled ? styles.disabled : ""
            }`}
        >
            {loading && <Spinner />}
            {children}
        </button>
    );
};

export default Button;
