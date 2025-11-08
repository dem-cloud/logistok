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
    resendKey?: any;
}

export default function SignupForm({code, codeError, onChange, onResend, resendKey, password, passwordError, onChangeP, confirmPassword, confirmPasswordError, onChangeCP }: SignupFormProps) {

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
                name="password"
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
                onResend = {() => {
                    console.log("Resend verification email");
                    onResend();
                }}
                resendDelay = {30}
                resetTrigger = {resendKey}
            />
           
           <div className={styles.terms}>
                By signing up, you agree to our 
                <span 
                    className={styles.link}
                    onClick={()=> window.location.href = `${WEBSITE_URL}/terms`}
                >
                    Terms of Use
                </span> 
                and 
                <span 
                    className={styles.link} 
                    style={{marginRight:"0"}}
                    onClick={()=> window.location.href = `${WEBSITE_URL}/privacy-policy`}
                >
                    Privacy Policy
                </span>
                . 
            </div>

        </div>
    )
}
