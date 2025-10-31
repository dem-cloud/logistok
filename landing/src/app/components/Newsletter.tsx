"use client"
import React, { useEffect, useState } from 'react'
import styles from './Footer.module.css'
import ThemeButton from './ThemeButton'
import Snackbar from './Snackbar';

export default function Newsletter() {

    const [email, setEmail] = useState('');
    const [error, setError] = useState(false);
    const [snackbar, setSnackbar] = useState<{ message: string, type: string } | null>(null);


    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEmail(e.target.value)
        setError(false)
    }

    const handleFocus = () => {
        setError(false);
    };


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        const newError = email.trim() === "" || !emailRegex.test(email)
        setError(newError)

        if(!newError) {
            console.log("Form submitted successfully", email);
            setSnackbar({ message: "Επιτυχής εγγραφή!", type: "success" });
            
            try {
                const response = await fetch("/api/subscribe", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email }),
                });
    
                const data = await response.json();
                if (response.ok) {
                    setSnackbar({ message: "Επιτυχής εγγραφή!", type: "success" });
                    setEmail("");
                } else {
                    setSnackbar({ message: "Σφάλμα εγγραφής!", type: "error" });
                }
            } catch (error) {
                setSnackbar({ message: "Σφάλμα δικτύου!", type: "error" });
            }
        }
    }

    // Reset errors when clicking
    useEffect(() => {
        const handleClick = () => {
            setError(false);
        };
    
        document.addEventListener("click", handleClick);
        return () => document.removeEventListener("click", handleClick);
    }, []);

    return (
        <>
            <form className={styles.column} onSubmit={handleSubmit}>
                <span className={styles.title}>Newsletter</span>
                <input 
                    className={`${styles.input} ${error ? styles.error : ""}`}
                    type="text" 
                    name="email" 
                    placeholder="Διεύθυνση Email" 
                    value={email}
                    onChange={handleChange}
                    onFocus={handleFocus}
                />
                <ThemeButton 
                    name = "Εγγραφείτε" 
                    variant='success'
                />
            </form>

            <Snackbar 
                snackbar={snackbar} 
                setSnackbar={setSnackbar} 
            />
        </>
    )
}
