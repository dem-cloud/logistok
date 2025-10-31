"use client"
import React, { useState } from 'react'
import styles from './SignUpForm.module.css'
import ThemeButton from './ThemeButton'
import { useRouter } from 'next/navigation';

export default function SignUpForm() {

    const [formData, setFormData] = useState({
        email: "",
        first_name: "",
        last_name: "",
        password: ""
    });

    const [errors, setErrors] = useState({
        email: false,
        first_name: false,
        last_name: false,
        password: false
    });

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
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name } = e.target;
        setErrors((prev) => ({
            ...prev,
            [name]: false,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Check required fields
        const newErrors = {
            email: formData.email.trim() === "" || !emailRegex.test(formData.email),
            first_name: formData.first_name.trim() === "",
            last_name: formData.last_name.trim() === "",
            password: formData.password.trim() === ""
        };

        setErrors(newErrors);

        // If no errors, proceed with form submission logic
        if (!newErrors.email && !newErrors.first_name && !newErrors.last_name && !newErrors.password) {
            console.log("Form submitted successfully", formData);

            try {
                const res = await fetch('/api/createAccount', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(formData),
                });
    
                const data = await res.json();
    
                if (data.success) {
                    console.log(data.message)

                    router.push('/resend-verification-link#sent')
                    // setMessage(data.message);
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
        <form 
            className={styles.signup} 
            onSubmit={handleSubmit}
        >

            <div className={`${styles.labelsAndInputs}`}>
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

            <div className='flex items-center justify-between my-4 gap-x-8'>
                <div className={styles.labelsAndInputs}>
                    <label className={styles.label}>Όνομα</label>
                    <input
                        className={`${styles.input} ${errors.first_name ? styles.error : ""}`}
                        type="text"
                        name="first_name"
                        placeholder = "Όνομα"
                        value={formData.first_name}
                        onChange={handleChange}
                        onFocus={handleFocus}
                    />
                </div>
                <div className={styles.labelsAndInputs}>
                    <label className={styles.label}>Επώνυμο</label>
                    <input
                        className={`${styles.input} ${errors.last_name ? styles.error : ""}`}
                        type="text"
                        name="last_name"
                        placeholder = "Επώνυμο"
                        value={formData.last_name}
                        onChange={handleChange}
                        onFocus={handleFocus}
                    />
                </div>
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

            <div className={styles.termsPolicy}>Με την εγγραφή σας, αποδέχεστε τους <span className={styles.color}>Όρους Χρήσης</span> και την <span className={styles.color}>Πολιτική Απορρήτου</span> μας.</div>
            <ThemeButton 
                name='Δημιουργία Λογαριασμού'
                variant='primary'
                customStyle='h-12'
            />
            
        </form>
    )
}
