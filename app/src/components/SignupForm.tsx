import styles from './SignupForm.module.css'
import PasswordInput from './reusable/PasswordInput';
import VerificationCodeInput from "./reusable/VerificationCodeInput";

const WEBSITE_URL = import.meta.env.VITE_WEBSITE_URL;


interface SignupFormProps {
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
    isResending: boolean;
}

export default function SignupForm({code, codeError, onChange, onResend, remainingSec, password, passwordError, onChangeP, confirmPassword, confirmPasswordError, onChangeCP, isResending }: SignupFormProps) {

    return (
        <div className={styles.signupForm}>
            <PasswordInput
                label="Κωδικός Πρόσβασης"
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
                isResending = {isResending}
            />
           
           <div className={styles.terms}>
                Με την εγγραφή σας αποδέχεστε τους
                <span 
                    className={styles.link}
                    onClick={()=> window.location.href = `${WEBSITE_URL}/terms`}
                >
                    Όρους Χρήσης
                </span> 
                και την
                <span 
                    className={styles.link} 
                    style={{marginLeft:"0"}}
                    onClick={()=> window.location.href = `${WEBSITE_URL}/privacy-policy`}
                >
                    Πολιτική Απορρήτου
                </span>
                μας. 
            </div>

        </div>
    )
}
