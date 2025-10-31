"use client"
import React, { useState } from 'react'
import styles from './LogInForm.module.css'
import ThemeButton from './ThemeButton'
import Link from 'next/link';
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import ResponsePopup from './ResponsePopup';
import { useRouter } from 'next/navigation';

export default function LogInForm() {

    const [formData, setFormData] = useState({
        email: "",
        password: ""
    });

    const [errors, setErrors] = useState({
        email: false,
        password: false
    });

    const [message, setMessage] = useState('')
    const [isPopupOpen, setIsPopupOpen] = useState(false)
    const router = useRouter();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));

        // Reset error when user starts typing
        setErrors((prev) => ({
            ...prev,
            [name]: false,
        }));
        setMessage('')
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name } = e.target;
        setErrors((prev) => ({
            ...prev,
            [name]: false,
        }));
        setMessage('')
    };

    async function getFingerprint() {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        return result.visitorId; // Unique fingerprint
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const newErrors = {
            email: formData.email.trim() === "" || !emailRegex.test(formData.email),
            password: formData.password.trim() === ""
        };

        setErrors(newErrors);

        if (!newErrors.email && !newErrors.password) {
            console.log("Form submitted successfully", formData);

            try {
                const fingerprint = await getFingerprint();

                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({...formData, fingerprint}),
                    credentials: 'include',
                });
    
                const data = await res.json();
                console.log(data)
    
                if (data.success) {
                    console.log(data.message)
                    window.location.href = "http://localhost:5173";
                    // setMessage(data.message);
                } else if (data.invalid_credentials) {
                    setMessage(data.message);
                    setErrors({
                        email: true,
                        password: true
                    })
                } else if (!data.email_verified) {
                    // setMessage(data.message);
                    setIsPopupOpen(true)
                } else {
                    // console.log(data.message)
                    alert(data.message);
                }
            } catch (error) {
                // console.error('Error:', error);
                alert('Something went wrong. Please try again.')
            }
        }
    }

    return (
        <>
            <form 
                className={styles.login}
                onSubmit={handleSubmit}
            >
                <div className={`${styles.labelsAndInputs} mb-4`}>
                    <label className={styles.label}>Email</label>
                    <input
                        className={`${styles.input} ${errors.email ? styles.error : ""}`}
                        type="text"
                        name="email"
                        placeholder = "Email"
                        value={formData.email}
                        onChange={handleChange}
                        onFocus={handleFocus}
                    />
                </div>
                <div className={styles.labelsAndInputs}>
                    <label className={styles.label}>Κωδικός Πρόσβασης</label>
                    <input
                        className={`${styles.input} ${errors.password ? styles.error : ""}`}
                        type="text"
                        name="password"
                        placeholder = "Κωδικός"
                        value={formData.password}
                        onChange={handleChange}
                        onFocus={handleFocus}
                    />
                </div>
                <div className='flex justify-between items-center'>
                    <div className={styles.message}>{message}</div>
                    <Link 
                        href='/reset-password' 
                        className={styles.forgot}
                    >
                        <span>Ξεχάσατε τον Κωδικό;</span>
                    </Link>
                </div>
                <ThemeButton 
                    name='Σύνδεση'
                    variant='primary'
                    customStyle='h-12 w-full'
                />

            </form>


            <ResponsePopup
                show = {isPopupOpen}
                onHide = {()=>setIsPopupOpen(false)}
                title='Αναμένεται Επαλήθευση Λογαριαμού'
                subtitle='Για την σύνδεσή σας στην πλατφόρμα είναι απαραίτητη η επαλήθευση του email σας. Ανατρέξτε στο email σας ώστε να βρείτε το σύνδεσμο επαλήθευσης.'
                button1 = 'Επαναποστολή Συνδέσμου'
                handleClick1={()=>router.push("/resend-verification-link")}
                button2="Κλείσιμο"
                handleClick2={()=>setIsPopupOpen(false)}
            />
        </>
    )
}
