import React, { useState } from 'react'
import styles from './CreateNewPasswordForm.module.css';
import ThemeButton from './ThemeButton';
import { axiosPublic } from '@/lib/axios';

interface ServerResponse {
    success: boolean;
    message: string;
}

interface CreateNewPasswordFormProps {
    onNextStep: ()=>void;
    setServerResponse: (response: ServerResponse)=>void;
    token: string;
}

export default function CreateNewPasswordForm(props: CreateNewPasswordFormProps) {

    const {
        onNextStep,
        setServerResponse,
        token
    } = props;
    
    const [formData, setFormData] = useState({
        password: "",
        confirmPassword: ""
    });

    const [errors, setErrors] = useState({
        password: false,
        confirmPassword: false
    });

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
            password: formData.password.trim() === "",
            confirmPassword: formData.confirmPassword.trim() === ""
        };

        setErrors(newErrors);

        // If no errors, proceed with form submission logic
        if (!newErrors.password && !newErrors.confirmPassword) {
            console.log("Form submitted successfully", formData);

            try {
                const response = await axiosPublic.post(
                    '/api/shared/create-new-password',
                    formData,
                    {
                        params: { token }
                    }
                );
                const data = response.data;

                if (data.success) {
                    // console.log(data.message)
                    setServerResponse({
                        success: true,
                        message: data.message
                    })
                    onNextStep();
                } else if (data.password_not_match) {
                    setErrors({
                        password: true,
                        confirmPassword: true
                    })
                } else {
                    setServerResponse({
                        success: false,
                        message: data.message
                    })
                    onNextStep();
                }
            } catch (error) {
                // console.error('Error:', error);
                setServerResponse({
                    success: false,
                    message: "Something went wrong. Please try again."
                })
                onNextStep();
            }

        }
    }

    return (
        <form 
            className={styles.form}
            onSubmit={handleSubmit}
        >
            <div className={styles.header}>
                <span className={styles.title}>Πληκτρολογήστε Νέο Κωδικό Πρόσβασης</span>
                <span className={styles.subtitle}>Δημιουργήστε έναν ισχυρό και ασφαλή κωδικό.</span>
            </div>


            <div className={`${styles.labelsAndInputs}`}>
                <label className={styles.label}>Νέος Κωδικός Πρόσβασης</label>
                <input
                    className={`${styles.input} ${errors.password ? styles.error : ""}`}
                    type="text"
                    name="password"
                    placeholder = "Νέος Κωδικός Πρόσβασης"
                    value={formData.password}
                    onChange={handleChange}
                    onFocus={handleFocus}
                />
            </div>

            <div className={`${styles.labelsAndInputs}`}>
                <label className={styles.label}>Επιβεβαίωση Κωδικού Πρόσβασης</label>
                <input
                    className={`${styles.input} ${errors.confirmPassword ? styles.error : ""}`}
                    type="text"
                    name="confirmPassword"
                    placeholder = "Επιβεβαίωση Κωδικού Πρόσβασης"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    onFocus={handleFocus}
                />
            </div>

            <ThemeButton 
                name='Δημιουργία Νέου Κωδικού Πρόσβασης'
                variant='primary'
                customStyle='h-12 mt-2 w-full'
            />
        </form>
    )
}
