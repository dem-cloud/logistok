"use client"
import React, { useState } from 'react'
import styles from './AuthForm.module.css'
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import { axiosPrivate } from '../api/axios';
import { useNavigate } from 'react-router-dom';
import Button from './reusable/Button';
import Input from './reusable/Input';
import LoginForm from './LoginForm';
import SignupForm from './SignupForm';

export default function AuthForm() {

    const navigate = useNavigate();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [verificationCode, setVerificationCode] = useState('');

    // Error Variables
    const [emailError, setEmailError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [confirmPasswordError, setConfirmPasswordError] = useState('');
    const [codeError, setCodeError] = useState('');


    // const [responseMessage, setResponseMessage] = useState('')
    const [isUserChecked, setIsUserChecked] = useState(false)
    const [isExistedUser, setIsExistedUser] = useState(false)

    const [resendKey, setResendKey] = useState(0);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const handleChangeEmail = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { value } = e.target;
        setEmail(value);
        setEmailError("");

        setIsUserChecked(false);

        // Όταν σταλεί νέο email, αλλάζουμε το key
        setResendKey((k) => k + 1);

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

    const handleCheckUser = async () => {

        // Email validation
        if(email.trim() === "" || !emailRegex.test(email)) {
            setEmailError("Μη έγκυρο email");
            return;
        }

        console.log("User Checked", email)

        // Call api/shared/check-user
        // Check existed User
            /* 
            Existed {
                return existed = true, 200 OK
            }
                
            Not existed {
                create verification code
                store it in db
                send verification code on email
                return existed = false, 200 OK
            }
            */

        setIsUserChecked(true)
        setIsExistedUser(false)

    }

    const handleLogin = async () => {

        // Password validation
        if(!password) {
            setPasswordError("Το πεδίο είναι υποχρεωτικό");
            return;
        }
    
        console.log("Log In", email, password)

        // Στο login θα καλέσω setToken()
        // const res = await axiosPrivate.post("/api/auth/login", { username, password })
        // login(res.data.accessToken, res.data.user)

        // Call api/auth/login
        // Check Existed User
        // Create Session
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
    
        console.log("Sign Up", email, password, confirmPassword, verificationCode)

        // Call api/shared/signup
        // Check Existed User
        // Check Verification Code
        // Create User
        // Create Session
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
    

    async function getFingerprint() {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        return result.visitorId; // Unique fingerprint
    }

    // const handleSubmit = async (e: React.FormEvent) => {
    //     e.preventDefault();

    //     let newErrors = { email: "", password: "", verificationCode: "" };
    //     if(formData.email.trim() === "" || !emailRegex.test(formData.email)) newErrors.email = "Invalid email";
    //     if(formData.password.trim() === "") newErrors.password = "Password is required";

    //     setErrors(newErrors);

    //     // Αν δεν υπάρχουν errors → προχωράς
    //     const hasErrors = Object.values(newErrors).some((err) => err);

    //     if (!hasErrors) {
    //         // console.log("Form submitted successfully", formData);

    //         try {
    //             const fingerprint = await getFingerprint();

    //             const response = await axiosPrivate.post('/api/auth/login', {...formData, fingerprint});
    //             const data = response.data;
                
    //             console.log(data)
    
    //             if (data.success) {
    //                 console.log(data.responseMessage)
    //                 navigate('/')
    //                 // setResponseMessage(data.responseMessage);
    //             } else if (data.invalid_credentials) {
    //                 setResponseMessage(data.responseMessage);
    //                 // setErrors({
    //                 //     email: "Λανθασμένα Διαπιστευτήρια",
    //                 //     password: "Λανθασμένα Διαπιστευτήρια"
    //                 // })
    //             } else if (!data.email_verified) {
    //                 setResponseMessage(data.responseMessage);
    //                 // setIsPopupOpen(true)
    //             } else {
    //                 // console.log(data.responseMessage)
    //                 alert(data.responseMessage);
    //             }
    //         } catch (error) {
    //             // console.error('Error:', error);
    //             alert('Something went wrong. Please try again.')
    //         }
    //     }
    // }

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

                            onResend = {handleCheckUser}
                            resendKey = {resendKey}
                        />
                    )
                    }


                </div>
                
                {/* Conditional button rendering */}
                { !isUserChecked && (
                    <Button type='submit'>
                        Συνέχεια
                    </Button>
                )}
                
                { isUserChecked && isExistedUser && (
                    <Button type='submit'>
                        Σύνδεση
                    </Button>
                )}
                
                { isUserChecked && !isExistedUser && (
                    <Button 
                        type='submit'
                        // disabled={!isCodeComplete}
                    >
                        Δημιουργία Λογαριασμού
                    </Button>
                )}
            </form>

        </>
    )
}
