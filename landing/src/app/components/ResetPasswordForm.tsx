"use client"
import React, { useEffect, useState } from 'react'
import styles from './ResetPasswordForm.module.css'
import ThemeButton from './ThemeButton'

interface ResetPasswordFormProps {
    onNextStep: ()=>void;
}

export default function ResetPasswordForm(props: ResetPasswordFormProps) {

    const {
        onNextStep
    } = props;

    const [email, setEmail] = useState('');
    const [error, setError] = useState(false);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        
        setEmail(e.target.value);
        // Reset error when user starts typing
        setError(false);
    };

    const handleFocus = () => {
        setError(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const isInvalid = email.trim() === "" || !emailRegex.test(email);
        setError(isInvalid);

        if(!isInvalid) {
            console.log("Form submitted successfully", email);

            try {
                const res = await fetch('/api/forgotPassword', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({email: email}),
                });
    
                const data = await res.json();
    
                if (data.success) {
                    console.log(data.message)
                    // setMessage(data.message);

                    onNextStep();
                    window.location.hash = "submitted";
                    setEmail('')
                    
                } else {
                    console.log(data.message)
                    // setMessage(data.message || 'An error occurred');
                }
            } catch (error) {
                console.error('Error:', error);
                // setMessage('An error occurred during reset');
            }

        }
    }

    return (
        <form 
            className={styles.form}
            onSubmit={handleSubmit}
        >
            <span className={styles.title}>Ξεχάσατε τον κωδικό σας;</span>
            <span className={styles.subtitle}>Συμπληρώστε το Email που σχετίζεται με τον λογαριασμό σας.</span>

            <input
                className={`${styles.input} ${error ? styles.error : ""}`}
                type="text"
                name="email"
                placeholder = "Email"
                value={email}
                onChange={handleChange}
                onFocus={handleFocus}
            />
            <div 
                className={styles.errorText}
                style={{ opacity: error ? "1" : "0", transition: "opacity 0.2s ease-in-out" }}
            >
                Παρακαλώ εισάγετε ένα έγκυρο email.
            </div>

            <ThemeButton 
                name='Ανάκτηση Κωδικού Πρόσβασης'
                variant='primary'
                customStyle='h-12 mt-2 w-full'
            />
        </form>
    )
}
