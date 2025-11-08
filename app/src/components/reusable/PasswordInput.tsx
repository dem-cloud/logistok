import React, { useState } from "react";
import styles from "./PasswordInput.module.css";
import { Eye, EyeOff } from "lucide-react";

interface PasswordInputProps {
    label?: string;
    name: string;
    value: string;
    placeholder?: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    error?: string;
    disabled?: boolean;
    showErrorText?: boolean;
}

const PasswordInput: React.FC<PasswordInputProps> = ({
    label,
    name,
    value,
    placeholder,
    onChange,
    error,
    disabled = false,
    showErrorText = true
}) => {

    const [showPassword, setShowPassword] = useState(false);

    return (
        <div className={styles.container}>
            {label && <label htmlFor={name}>{label}</label>}

            <div className={styles.inputWrapper}>
                <input
                    id={name}
                    name={name}
                    type={showPassword ? "text" : "password"}
                    value={value}
                    placeholder={placeholder}
                    onChange={onChange}
                    disabled={disabled}
                    className={`${styles.input} ${error ? styles.errorInput : ""}`}
                />
                <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className={styles.eyeButton}
                    tabIndex={-1} // ώστε να μην παίρνει focus όταν κάνεις tab
                >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
            </div>

            <span className={`${styles.error} ${(!error || !showErrorText) ? styles.hiddenError : ""}`}>
                {error || "placeholder"}
            </span>
        </div>
    );
};

export default PasswordInput;
