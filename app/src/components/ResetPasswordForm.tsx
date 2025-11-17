import styles from './ResetPasswordForm.module.css'
import PasswordInput from "./reusable/PasswordInput";
import VerificationCodeInput from "./reusable/VerificationCodeInput";


interface ResetPasswordFormProps {
    password: string;
    passwordError: string;
    onChangeP: (event: React.ChangeEvent<HTMLInputElement>) => void; 
    confirmPassword: string;
    confirmPasswordError: string;
    onChangeCP: (event: React.ChangeEvent<HTMLInputElement>) => void; 

    code: string;
    codeError: string;
    onChange: (code: string) => void;
    onResend: () => Promise<void>;
    remainingSec: number;
}

export default function ResetPasswordForm({code, codeError, onChange, onResend, remainingSec, password, passwordError, onChangeP, confirmPassword, confirmPasswordError, onChangeCP }: ResetPasswordFormProps) {

    return (
        <div className={styles.resetPasswordForm}>
             <PasswordInput
                label="Νέος Κωδικός Πρόσβασης"
                name="password"
                value={password}
                placeholder="Πληκτρολογήστε τον κωδικό"
                onChange={onChangeP}
                error={passwordError}
                showErrorText={false}
            />

            <PasswordInput
                label="Επιβεβαίωση Κωδικού"
                name="confirmPassword"
                value={confirmPassword}
                placeholder="Πληκτρολογήστε ξανά τον κωδικό"
                onChange={onChangeCP}
                error={confirmPasswordError}
            />

            <VerificationCodeInput 
                label = "Κωδικός Επαλήθευσης"
                value={code}
                onChange = {onChange}
                error = {codeError}
                remainingSec = {remainingSec}
                onResend = {onResend}
            />
        </div>
    )
}
