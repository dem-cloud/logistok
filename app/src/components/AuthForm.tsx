"use client"
import React, { useEffect, useState } from 'react'
import styles from './AuthForm.module.css'
import { axiosPublic } from '../api/axios';
import Button from './reusable/Button';
import Input from './reusable/Input';
import LoginForm from './LoginForm';
import SignupForm from './SignupForm';
import { getFingerprint } from '../auth/getFingerprint';
import ResetPasswordForm from './ResetPasswordForm';
import { useAuth } from '@/contexts/AuthContext';

type VerificationType = 'signup' | 'password_reset';
type VerificationDeliveryMethod = 'email' | 'sms';

interface AuthFormProps {
    verificationType: VerificationType;
    setTagline?: React.Dispatch<React.SetStateAction<string>>;
}

export default function AuthForm({ verificationType, setTagline }: AuthFormProps) {

    const { login, showToast } = useAuth();

    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [verificationCode, setVerificationCode] = useState('');

    // Error Variables
    const [emailError, setEmailError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [confirmPasswordError, setConfirmPasswordError] = useState('');
    const [codeError, setCodeError] = useState('');

    const [loadingCheckUser, setLoadingCheckUser] = useState(false);
    const [loadingSubmitRequest, setLoadingSubmitRequest] = useState(false); // login/signup

    const [secondsLeft, setSecondsLeft] = useState(0);
    const [isResending, setIsResending] = useState(false);

    const [isUserChecked, setIsUserChecked] = useState(false)
    const [showLoginForm, setShowLoginForm] = useState(false)
    const [showSignupForm, setShowSignupForm] = useState(false)
    const [showResetPasswordForm, setShowResetPasswordForm] = useState(false)

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;

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
        
        setShowLoginForm(false);
        setShowSignupForm(false);
        setShowResetPasswordForm(false);

        setPassword("");
        setConfirmPassword("");
        setVerificationCode("");
        setPasswordError("");
        setConfirmPasswordError("");
        setCodeError("");

        setTagline?.("Πες μας το email σου για να σου στείλουμε τον κωδικό επαλήθευσης.");
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

    
    const handleResend = async (delivery_method: VerificationDeliveryMethod, email: string, phone: string, type: VerificationType) => {
        try {
            setIsResending(true);

            const response = await axiosPublic.post("/api/auth/send-code", { delivery_method, email, phone, type })
            const { success, message, code, data = {} } = response.data;
            const { remaining = 0 } = data;

            if(!success){
                throw new Error(message);
                // if(code === "MISSING_VALUES" || code === "INVALID_TYPE")
                //     showToast({ message: message, type: "error" });
                // else
                //     showToast({ message: "Κάτι πήγε στραβά", type: "error" });
            } 
            
            setSecondsLeft(remaining);

        } catch (error) {
            console.error("error:", error);
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
        } finally {
            setIsResending(false);
        }
    }

    const handleCheckUser = async () => {

        // Email validation
        if(email.trim() === "" || !emailRegex.test(email)) {
            setEmailError("Μη έγκυρο email");
            return;
        }
        
        try {
            setLoadingCheckUser(true);
             // 1) Check user
            const response = await axiosPublic.post("/api/auth/check-user", { email, type: verificationType })
            const { success, message, code, data = {} } = response.data;
            const { isCoolingDown, remaining } = data;

            if(!success){
                if(code === "MISSING_VALUES")
                    showToast({ message: message, type: "error" });
                else if(code === "PR_USER_NOT_FOUND")
                    setEmailError(message)
                else // INVALID_TYPES
                    showToast({ message: "Κάτι πήγε στραβά", type: "error" });

                return;
            }

            // 2) Ορίζουμε τις κατάστασης ανάλογα με το code
            let shouldSendCode = false;

            switch (code) {
                case "USER_FOUND":
                    setShowSignupForm(false);
                    setShowResetPasswordForm(false);

                    setShowLoginForm(true);
                    break;
                case "USER_NOT_FOUND":
                    setShowLoginForm(false);
                    setShowResetPasswordForm(false);

                    setShowSignupForm(true);
                    shouldSendCode = true;
                    isCoolingDown && setSecondsLeft(remaining);
                    break;
                case "PR_USER_FOUND":
                    setShowLoginForm(false);
                    setShowSignupForm(false);

                    setTagline?.("Διάλεξε τον νέο σου κωδικό πρόσβασης και συμπλήρωσε τον 6ψήφιο κωδικό επαλήθευσης.");
                    setShowResetPasswordForm(true);
                    shouldSendCode = true;
                    isCoolingDown && setSecondsLeft(remaining);
                    break;
            }

            // 3) Send code ΠΡΙΝ το setIsUserChecked αν χρειάζεται
            if(shouldSendCode && !isCoolingDown) {
                await handleResend("email", email, phone, verificationType);
            }

            // 4) Τώρα προχωράμε στις φόρμες (Login | Signup) αφού έχει ήδη γίνει το send-code
            setIsUserChecked(true);

        } catch (error) {
            console.error("error:", error);
            // const message = error.response?.data?.message || 'Κάτι πήγε στραβά';
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
        } finally {
            setLoadingCheckUser(false);
        }
    }

    const handleLogin = async () => {

        // Password validation
        if(!password) {
            setPasswordError("Το πεδίο είναι υποχρεωτικό");
            return;
        }

        try {
            setLoadingSubmitRequest(true);
            
            const fingerprint = await getFingerprint();
    
            console.log("Log In", email, phone, password, fingerprint)

            const response = await axiosPublic.post("/api/auth/login", { email, phone, password, fingerprint }, { withCredentials: true })
            const { success, message, data = {}, code } = response.data;
            
            if(!success){
                // MISSING_VALUES
                // USER_NOT_FOUND
                // EMAIL_NOT_VERIFIED
                // WRONG_PASSWORD

                if (code === "EMAIL_NOT_VERIFIED") setEmailError(message)
                else if (code === "WRONG_PASSWORD") setPasswordError(message)
                else showToast({ message: "Κάτι πήγε στραβά", type: "error" });
                return;
            }

            // showToast({ message: "Επιτυχής σύνδεση!", type: "success" });

            login(data);

        } catch (error) {
            console.error("error:", error);
            // const message = error.response?.data?.message || 'Κάτι πήγε στραβά';
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
        } finally {
            setLoadingSubmitRequest(false);
        }

    }

    const validationSigninReset = () => {
        let hasError = false;

        // Empty fields
        if (password.trim() === "" || confirmPassword.trim() === "") {
            setPasswordError("Το πεδίο είναι υποχρεωτικό");
            setConfirmPasswordError("Το πεδίο είναι υποχρεωτικό");
            hasError = true;
        }

        // Password strength validation
        if (!passwordRegex.test(password)) {
            setPasswordError("Ο κωδικός πρέπει να περιέχει τουλάχιστον 6 χαρακτήρες, 1 κεφαλαίο, 1 μικρό και 1 αριθμό");
            setConfirmPasswordError("Ο κωδικός πρέπει να περιέχει τουλάχιστον 6 χαρακτήρες, 1 κεφαλαίο, 1 μικρό και 1 αριθμό");
            hasError = true;
        }

        // Passwords mismatch
        if (password !== confirmPassword) {
            setPasswordError("Οι κωδικοί δεν ταιριάζουν");
            setConfirmPasswordError("Οι κωδικοί δεν ταιριάζουν");
            hasError = true;
        }

        // Verification Code
        if (verificationCode.length !== 6) {
            setCodeError("Συμπληρώστε τον κωδικό επαλήθευσης");
            hasError = true;
        }

        return hasError;
    }

    const handleSignup = async () => {

        const hasError = validationSigninReset();
        if (hasError) return;

        try {
            setLoadingSubmitRequest(true);
            
            const fingerprint = await getFingerprint();

            console.log("Sign Up", email, phone, password, confirmPassword, verificationCode, fingerprint)

            const response = await axiosPublic.post("/api/auth/signup", { email, phone: null, password, confirmPassword, verificationCode, fingerprint }, { withCredentials: true })
            const { success, message, data = {}, code } = response.data;

            if(!success){
                // INVALID_PASSWORD
                // PASSWORD_MISMATCH
                // OTP_NOT_FOUND
                // INVALID_OTP
                // OTP_EXPIRED

                switch (code) {
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
                        showToast({ message: "Κάτι πήγε στραβά", type: "error" });
                        return;
                }
            }

            // showToast({ message, type: "success" });

            login(data);

        } catch (error) {
            console.error("error:", error);
            // const message = error.response?.data?.message || 'Κάτι πήγε στραβά';
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
        } finally {
            setLoadingSubmitRequest(false);
        }
    }

    const handleResetPassword = async () => {

        const hasError = validationSigninReset();
        if (hasError) return;

        try {
            setLoadingSubmitRequest(true);
            
            const fingerprint = await getFingerprint();

            console.log("Reset Password", email, phone, password, confirmPassword, verificationCode, fingerprint)

            const response = await axiosPublic.post("/api/auth/password-reset", { email, phone: null, password, confirmPassword, verificationCode, fingerprint }, { withCredentials: true })
            const { success, message, data = {}, code } = response.data;

            if(!success){
                // MISSING_VALUES
                // USER_NOT_FOUND
                // INVALID_PASSWORD
                // PASSWORD_MISMATCH
                // OTP_NOT_FOUND
                // OTP_TOO_MANY_ATTEMPTS
                // INVALID_OTP
                // OTP_EXPIRED

                switch (code) {
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
                        showToast({ message: "Κάτι πήγε στραβά", type: "error" });
                        return;
                }
            }

            // showToast({ message, type: "success" });

            login(data);

        } catch (error) {
            console.error("error:", error);
            // const message = error.response?.data?.message || 'Κάτι πήγε στραβά';
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
        } finally {
            setLoadingSubmitRequest(false);
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
    
        if(isUserChecked) {
            if(showLoginForm)
                handleLogin()
            else if(showSignupForm)
                handleSignup()
            else if(showResetPasswordForm)
                handleResetPassword()
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
                    
                    { isUserChecked && showLoginForm && (
                        <LoginForm 
                            password = {password}
                            passwordError = {passwordError}
                            onChange = {handleChangePassword}
                        />
                    )}

                    {isUserChecked && showSignupForm && (
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

                            onResend = {()=>handleResend("email", email, phone, verificationType)}
                            remainingSec = {secondsLeft}
                            isResending = {isResending}
                        />
                    )}
                    
                    { isUserChecked && showResetPasswordForm && (
                        <ResetPasswordForm 
                            password = {password}
                            passwordError = {passwordError}
                            onChangeP = {handleChangePassword}

                            confirmPassword = {confirmPassword}
                            confirmPasswordError = {confirmPasswordError}
                            onChangeCP = {handleChangeConfirmPassword}

                            code = {verificationCode}
                            codeError = {codeError}
                            onChange = {handleChangeVerificationCode}

                            onResend = {()=>handleResend("email", email, phone, verificationType)}
                            remainingSec = {secondsLeft}
                            isResending = {isResending}
                        />
                    )}

                </div>
                
                {/* Conditional button rendering */}
                { !isUserChecked && (
                    <Button 
                        type='submit'
                        loading={loadingCheckUser}
                        disabled={loadingCheckUser}
                    >
                        Συνέχεια
                    </Button>
                )}
                
                { isUserChecked && showLoginForm && (
                    <Button 
                        type='submit'
                        loading={loadingSubmitRequest}
                        disabled={loadingSubmitRequest}
                    >
                        Σύνδεση
                    </Button>
                )}
                
                { isUserChecked && showSignupForm && (
                    <Button 
                        type='submit'
                        loading={loadingSubmitRequest}
                        disabled={loadingSubmitRequest}
                    >
                        Δημιουργία Λογαριασμού
                    </Button>
                )}

                { isUserChecked && showResetPasswordForm && (
                    <Button 
                        type='submit'
                        loading={loadingSubmitRequest}
                        disabled={loadingSubmitRequest}
                    >
                        Αλλαγή Κωδικού
                    </Button>
                )}
            </form>

        </>
    )
}
