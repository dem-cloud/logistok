import React from "react";
import styles from "./Input.module.css";

interface InputProps {
    label?: string;
    name: string;
    type?: string;
    value: string;
    placeholder?: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    disabled?: boolean;
    error?: string;
}

const Input: React.FC<InputProps> = ({
    label,
    name,
    type = "text",
    value,
    placeholder,
    onChange,
    disabled = false,
    error,
}) => {
    return (
        <div className={styles.container}>
            {label && <label htmlFor={name}>{label}</label>}
            <input
                id={name}
                name={name}
                type={type}
                value={value}
                placeholder={placeholder}
                onChange={onChange}
                disabled={disabled}
                className={`${styles.input} ${error ? styles.errorInput : ""}`}
            />
            <span className={`${styles.error} ${!error ? styles.hiddenError : ""}`}>
                {error || "placeholder"}
            </span>
        </div>
    );
};

export default Input;
