"use client"
import React, { useEffect, useState } from 'react'
import styles from './ContactForm.module.css'
import ThemeButton from './ThemeButton';
import Snackbar from './Snackbar';

export default function ContactForm() {
    const [formData, setFormData] = useState({
        fullName: '',
        companyName: '',
        email: '',
        phone: '',
        message: '',
    });

    const [errors, setErrors] = useState({
        fullName: false,
        email: false,
        invalidEmail: false,
        message: false
    });
    const [snackbar, setSnackbar] = useState<{ message: string, type: string } | null>(null);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));

        // Reset error when user starts typing
        setErrors((prev) => ({
            ...prev,
            [name]: false,
            // invalidEmail: name === "email" ? !emailRegex.test(value) : prev.invalidEmail
        }));
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name } = e.target;
        setErrors((prev) => ({
            ...prev,
            [name]: false,
            invalidEmail: name === "email" ? false : prev.invalidEmail
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

         // Check required fields
         const newErrors = {
            fullName: formData.fullName.trim() === "",
            email: formData.email.trim() === "",
            invalidEmail: formData.email.trim() !== "" && !emailRegex.test(formData.email),
            message: formData.message.trim() === ""
        };

        setErrors(newErrors);

        // If no errors, proceed with form submission logic
        if (!newErrors.fullName && !newErrors.email && !newErrors.invalidEmail && !newErrors.message) {
            console.log("Form submitted successfully", formData);
            
            try {
                // Submit form or API call logic here
                const response = await fetch('/api/sendEmail', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData),
                });
        
                const data = await response.json();
        
                if (response.ok) {
                    setSnackbar({ message: 'Επιτυχής αποστολή μηνύματος!', type: 'success' });
                    setFormData({
                        fullName: '',
                        companyName: '',
                        email: '',
                        phone: '',
                        message: '',
                    })
                } else {
                    setSnackbar({ message: 'Αποτυχία αποστολής μηνύματος', type: 'error' });
                }
            } catch (error) {
                setSnackbar({ message: "Σφάλμα δικτύου!", type: "error" });
            }
        }
    };

    // Reset errors when clicking outside the form
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (!(event.target as HTMLElement).closest(`.${styles.form}`)) {
                setErrors({ fullName: false, email: false, invalidEmail: false, message: false });
            }
        };

        document.addEventListener("click", handleClickOutside);
        return () => document.removeEventListener("click", handleClickOutside);
    }, []);

    return (
        <div className={styles.formContainer}>
            <form className={styles.form} onSubmit={handleSubmit}>
                
                <div className={styles.labelsAndInputs}>
                    <label className={styles.label}>Ονοματεπώνυμο *</label>
                    <input
                        className={`${styles.input} ${errors.fullName ? styles.error : ""}`}
                        type="text"
                        name="fullName"
                        placeholder = "Ονοματεπώνυμο"
                        value={formData.fullName}
                        onChange={handleChange}
                        onFocus={handleFocus}
                        // required
                    />
                </div>

                <div className={styles.labelsAndInputs}>
                    <label className={styles.label}>Επωνυμία Εταιρείας</label>
                    <input
                        className={styles.input}
                        type="text"
                        name="companyName"
                        placeholder = "Επωνυμία Εταιρείας"
                        value={formData.companyName}
                        onChange={handleChange}
                    />
                </div>

                <div className={styles.labelsAndInputs}>
                    <label className={styles.label}>Διεύθυνση Email *</label>
                    <input
                        className={`${styles.input} ${errors.email || errors.invalidEmail ? styles.error : ""}`}
                        type="text"
                        name="email"
                        placeholder = "Διεύθυνση Email"
                        value={formData.email}
                        onChange={handleChange}
                        onFocus={handleFocus}
                        // required
                    />
                </div>
                
                <div className={styles.labelsAndInputs}>
                    <label className={styles.label}>Αριθμός Τηλεφώνου</label>
                    <input
                        className={styles.input}
                        type="tel"
                        name="phone"
                        placeholder = "Αριθμός Τηλεφώνου"
                        value={formData.phone}
                        onChange={handleChange}
                    />
                </div>

                <div className={`${styles.rowTwoCol} ${styles.labelsAndInputs}`}>
                    <label className={styles.label}>Μήνυμα *</label>
                    <textarea
                        className={`${styles.textarea} ${errors.message ? styles.error : ""}`}
                        name="message"
                        placeholder="Εισαγάγετε το μήνυμά σας"
                        value={formData.message}
                        onChange={handleChange}
                        onFocus={handleFocus}
                        // required
                    />
                </div>

                <div className={`${styles.rowTwoCol} ${styles.sendButton}`}>
                    <ThemeButton
                        name='Αποστολή Μηνύματος'
                        variant='primary'
                    />
                </div>
            </form>

            <Snackbar 
                snackbar={snackbar} 
                setSnackbar={setSnackbar} 
            />
        </div>
    );
}