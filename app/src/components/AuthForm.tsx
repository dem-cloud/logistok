"use client"
import React, { useEffect, useState } from 'react'
import styles from './AuthForm.module.css'
import { axiosPublic } from '../api/axios';
import { useNavigate } from 'react-router-dom';
import Button from './reusable/Button';
import Input from './reusable/Input';
import LoginForm from './LoginForm';
import SignupForm from './SignupForm';
import { getFingerprint } from '../auth/getFingerprint';
import { useAuth } from '../context/AuthContext';

type VerificationType = 'email_verify' | 'password_reset';

export default function AuthForm() {

    const navigate = useNavigate();
    const { login } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [verificationCode, setVerificationCode] = useState('');

    // Error Variables
    const [emailError, setEmailError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [confirmPasswordError, setConfirmPasswordError] = useState('');
    const [codeError, setCodeError] = useState('');

    const [loadingSubmitRequest, setLoadingSubmitRequest] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(0);

    const [responseMessage, setResponseMessage] = useState('') // Αυτο πρεπει να ειναι στο Context
    const [isUserChecked, setIsUserChecked] = useState(false)
    const [isExistedUser, setIsExistedUser] = useState<boolean | null>(null)

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // console.log(responseMessage);

    useEffect(() => {
        if (secondsLeft === null) return; // Αν δεν έχουμε countdown, μην κάνεις τίποτα
        if (secondsLeft === 0) return;

        const timer = setInterval(() => {
            setSecondsLeft(prev => prev > 0 ? prev - 1 : 0);
        }, 1000);

        return () => clearInterval(timer);
    }, [secondsLeft]);

    const handleChangeEmail = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { value } = e.target;
        setEmail(value);
        setEmailError("");

        setIsUserChecked(false);
        setIsExistedUser(null);

        setPassword("");
        setConfirmPassword("");
        setVerificationCode("");
        setPasswordError("");
        setConfirmPasswordError("");
        setCodeError("");
    }

    const handleChangePassword = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { value } = e.target;
        setPassword(value);
        setPasswordError("");
        setConfirmPasswordError("");
    }

    const handleChangeConfirmPassword = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { value } = e.target;
        setConfirmPassword(value);
        setPasswordError("");
        setConfirmPasswordError("");
    }

    const handleChangeVerificationCode = (value: string) => {
        setVerificationCode(value);
        setCodeError("");
    }

    
    const handleResend = async (email: string, type: VerificationType) => {
        const response = await axiosPublic.post("/api/auth/send-code", { email, type })
        const { success, message, code, data = {} } = response.data;
        const { remaining = 0 } = data;

        const COOLDOWNS = {
            email_verify: 59 * 1000,    // 59 δευτερόλεπτα
            password_reset: 59 * 1000   // 59 δευτερόλεπτα
        };

        const COOLDOWN_MS = COOLDOWNS[type] || 59 * 1000;

        if(!success)
            throw new Error(message);

        if (code === "ACTIVE_VERIFICATION_CODE") {
            setSecondsLeft(remaining); // πρακτικα εδω δεν θα μπει γιατι το κουμπι ειναι disabled μεχρι να τελειωσει το countdown
        }else if (code === "VERIFICATION_CODE_SENT") {
            setSecondsLeft(COOLDOWN_MS / 1000);
        }

        // setResponseMessage(message);
    }

    const handleCheckUser = async () => {

        // Email validation
        if(email.trim() === "" || !emailRegex.test(email)) {
            setEmailError("Μη έγκυρο email");
            return;
        }

        try {
            setLoadingSubmitRequest(true);
             // 1) Check user
            const type = "email_verify";
            const response = await axiosPublic.post("/api/auth/check-user", { email, type })
            const { success, message, code, data = {} } = response.data;
            const { isCoolingDown, remaining } = data;

            if(!success)
                throw new Error(message); // SERVER_ERROR

            switch (code) {
                case "USER_FOUND":
                    setIsExistedUser(true);
                    break;
                case "USER_NOT_FOUND":
                    setIsExistedUser(false);
                    isCoolingDown && setSecondsLeft(remaining);
                    break;
            }

            // 2) Προχωράμε στις φόρμες (Login | Signup):
            setIsUserChecked(true);

            if(code === "USER_NOT_FOUND"){
                // 3) Send code
                !isCoolingDown && await handleResend(email, type);
            }

        } catch (error) {
            console.error("error:", error);
            // setResponseMessage(error);
        } finally {
            setLoadingSubmitRequest(false);
        }
    }

    const handleLogin = async () => {

        // Password validation
        if(!password) {
            setPasswordError("Το πεδίο είναι υποχρεωτικό");
            return;
        }

        try {
            const fingerprint = await getFingerprint();
    
            console.log("Log In", email, password, fingerprint)

            const response = await axiosPublic.post("/api/auth/login", { email, password, fingerprint }, { withCredentials: true })
            const { success, message, data = {}, code } = response.data;
            const { access_token, user } = data;
            
            if(!success){
                if(code === "USER_NOT_FOUND") setEmailError(message)
                else if (code === "WRONG_PASSWORD") setPasswordError(message)
                else setResponseMessage("Ανεπιτυχής Σύνδεση")
                return;
            }

            login(access_token, user)
            // navigate('/')

        } catch {
            setResponseMessage("Κάτι πήγε λάθος. Προσπαθήστε ξανά.")
        } finally {
            // optional ?
            setIsUserChecked(false)
            setIsExistedUser(null)
        }

    }

    const handleSignup = async () => {

        // Password & Verification code validation
        if(verificationCode.length !== 6 || password !== confirmPassword || password.length < 6){

            if(password.trim() === "" || confirmPassword.trim() === "") {
                setPasswordError("Το πεδίο είναι υποχρεωτικό")
                setConfirmPasswordError("Το πεδίο είναι υποχρεωτικό")
            }
            else if(password.trim().length < 6 || confirmPassword.trim().length < 6) {
                setPasswordError("Ο κωδικός πρέπει να αποτελείται πάνω απο 6 χαρακτήρες")
                setConfirmPasswordError("Ο κωδικός πρέπει να αποτελείται πάνω απο 6 χαρακτήρες")
            }
            else if(password.trim() !== confirmPassword.trim()){
                setPasswordError("Οι κωδικοί δεν ταιριάζουν")
                setConfirmPasswordError("Οι κωδικοί δεν ταιριάζουν")
            }
            
            // Validate verification code
            if(verificationCode.length !== 6)
                setCodeError("Συμπληρώστε τον κωδικό επαλήθευσης");
                
            return;
        }

        try {
            const fingerprint = await getFingerprint();

            console.log("Sign Up", email, password, confirmPassword, verificationCode, fingerprint)

            const response = await axiosPublic.post("/api/auth/signup", { email, password, confirmPassword, verificationCode, fingerprint }, { withCredentials: true })
            const { success, message, data = {}, code } = response.data;
            const { access_token, user } = data;

            if(!success){
                console.log(message, " dsdfs")

                switch (code) {
                    case "MISSING_VALUES":
                        // setResponseMessage(message);
                        return;
                    case "INVALID_PASSWORD":
                    case "PASSWORD_MISMATCH":
                        setPasswordError(message);
                        setConfirmPasswordError(message);
                        return;
                    case "OTP_NOT_FOUND":
                    case "INVALID_OTP":
                    case "OTP_EXPIRED":
                        setCodeError(message)
                        return;
                    default:
                        setResponseMessage(message);
                        return;
                }
            }

            login(access_token, user);
            navigate('/');

        } catch (error) {
            console.log('poutsaaaaaaaaaaaaaa')
            setResponseMessage("Κάτι πήγε λάθος. Προσπαθήστε ξανά.")
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
    
        if(isUserChecked) {
            if(isExistedUser)
                handleLogin()
            else
                handleSignup()
        } else {
            handleCheckUser();
        }
    }

    return (
        <>
            <form 
                className={styles.authForm}
                onSubmit={handleSubmit}
            >
                <div className={styles.inputs}>
                    <Input
                        label="Email"
                        name="email"
                        type="text"
                        placeholder="Email"
                        value={email}
                        onChange={handleChangeEmail}
                        error={emailError}
                    />
                    
                    { isUserChecked && (
                    isExistedUser ? 
                        <LoginForm 
                            password = {password}
                            passwordError = {passwordError}
                            onChange = {handleChangePassword}
                        />
                    :
                        <SignupForm
                            password = {password}
                            passwordError = {passwordError}
                            onChangeP = {handleChangePassword}

                            confirmPassword = {confirmPassword}
                            confirmPasswordError = {confirmPasswordError}
                            onChangeCP = {handleChangeConfirmPassword}

                            code = {verificationCode}
                            codeError = {codeError}
                            onChange = {handleChangeVerificationCode}

                            onResend = {()=>handleResend(email, "email_verify")}
                            remainingSec = {secondsLeft}
                        />
                    )
                    }


                </div>
                
                {/* Conditional button rendering */}
                { !isUserChecked && (
                    <Button 
                        type='submit'
                        loading={loadingSubmitRequest}
                        disabled={loadingSubmitRequest}
                    >
                        Συνέχεια
                    </Button>
                )}
                
                { isUserChecked && isExistedUser && (
                    <Button 
                        type='submit'
                        loading={loadingSubmitRequest}
                        disabled={loadingSubmitRequest}
                    >
                        Σύνδεση
                    </Button>
                )}
                
                { isUserChecked && !isExistedUser && (
                    <Button 
                        type='submit'
                        loading={loadingSubmitRequest}
                        disabled={loadingSubmitRequest}
                    >
                        Δημιουργία Λογαριασμού
                    </Button>
                )}
            </form>

        </>
    )
}
