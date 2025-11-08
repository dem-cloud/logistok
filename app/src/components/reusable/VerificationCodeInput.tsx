import { useState, useRef, useEffect } from "react";
import styles from "./VerificationCodeInput.module.css";

interface VerificationCodeInputProps {
    label?: string;
    value?: string; // Optional - αν δεν υπάρχει, χρησιμοποιεί internal state
    onChange?: (code: string) => void;
    error?: string;
    onResend?: () => void;
    resendDelay?: number; // σε δευτερόλεπτα, π.χ. 30
    resetTrigger?: any;
}

export default function VerificationCodeInput({ label, value, onChange, error, onResend, resendDelay = 30, resetTrigger }: VerificationCodeInputProps) {
    const [internalValue, setInternalValue] = useState<string>('');
    const inputsRef = useRef<HTMLInputElement[]>([]);
    const [timer, setTimer] = useState(0);
    // console.log(values)

    // Αν έχει value από parent, χρησιμοποίησε αυτό, αλλιώς το internal
    const isControlled = value !== undefined;
    const currentValue = isControlled ? value : internalValue;

    // Πάντα 6 inputs - ακόμα και αν είναι όλα άδεια
    const values = Array.from({ length: 6 }, (_, i) => currentValue[i] || '');

    // Countdown logic
    useEffect(() => {
        if (timer > 0) {
            const interval = setInterval(() => setTimer((t) => t - 1), 1000);
            return () => clearInterval(interval);
        }
    }, [timer]);

    // Restart timer όταν αλλάξει το resetTrigger
    useEffect(() => {
        if (resetTrigger !== undefined) {
            setTimer(resendDelay);
        }
    }, [resetTrigger, resendDelay]);

    const handleInput = (index: number, inputValue: string) => {
        if (!/^\d?$/.test(inputValue)) return; // μόνο 1 αριθμό

        const newValues = [...values];
        newValues[index] = inputValue;
        const newCode = newValues.join('').replace(/\s/g, ''); // Remove spaces

        // Update internal state αν δεν είναι controlled
        if (!isControlled) {
            setInternalValue(newCode);
        }

        // Πάντα καλούμε το onChange αν υπάρχει
        onChange?.(newCode);

        // auto-focus στο επόμενο
        if (inputValue && index < 5) {
            inputsRef.current[index + 1]?.focus();
        }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        
        if (e.key === "Backspace" && !values[index] && index > 0) {
            inputsRef.current[index - 1]?.focus();
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        
        if (!isControlled) {
            setInternalValue(pastedData);
        }
        onChange?.(pastedData);
        
        const focusIndex = Math.min(pastedData.length, 5);
        inputsRef.current[focusIndex]?.focus();
    };

    const handleInputClick = (index: number) => {
        // Όταν κάνεις click, πήγαινε στην πρώτη άδεια θέση
        const firstEmptyIndex = values.findIndex(v => !v.trim());
        if (firstEmptyIndex !== -1 && firstEmptyIndex !== index) {
            inputsRef.current[firstEmptyIndex]?.focus();
        }
    };

    const handleResend = () => {
        if (timer === 0 && onResend) {
            onResend();
            setTimer(resendDelay);
        }
    };

    return (
        <div className={styles.container}>
            {(label || onResend) && (
                <div className={styles.header}>
                    {label && <label>{label}</label>}
                    {
                        onResend && (
                            <button
                                type="button"
                                onClick={handleResend}
                                className={styles.resendBtn}
                                disabled={timer > 0}
                            >
                                {timer > 0 ? `Resend in ${timer}s` : "Resend code"}
                            </button>
                        )
                    }
                </div>
            )}
            <div className={styles.boxContainer}>
            {values.map((val, i) => (
                <input
                    key={i}
                    ref={(el) => {
                        inputsRef.current[i] = el!;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={val.trim()}
                    onChange={(e) => handleInput(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onClick={() => handleInputClick(i)}  // ← Πρόσθεσε αυτό
                    onPaste={handlePaste}
                    className={`${styles.box} ${error ? styles.errorInput : ""}`}
                />
            ))}
            </div>
            <span className={`${styles.error} ${!error ? styles.hiddenError : ""}`}>
                {error || "placeholder"}
            </span>
        </div>
    );
}
