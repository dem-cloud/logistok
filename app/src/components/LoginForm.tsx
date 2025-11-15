import { Link } from "react-router-dom";
import styles from './LoginForm.module.css'
import PasswordInput from "./reusable/PasswordInput";

interface LoginFormProps {
    password: string;
    passwordError: string;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void; 
}

export default function LoginForm({password, passwordError, onChange}: LoginFormProps) {

    return (
        <div className={styles.loginForm}>
            <PasswordInput
                label="Κωδικός Πρόσβασης"
                name="password"
                value={password}
                placeholder="Πληκτρολογήστε τον κωδικό"
                onChange={onChange}
                error={passwordError}
            />

            <Link 
                to='/auth/reset-password' 
                className={styles.forgot}
            >
                <span>Ξεχάσατε τον Κωδικό;</span>
            </Link>

        </div>
    )
}
