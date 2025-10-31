"use client"
import React, { useEffect, useRef, useState } from 'react'
import styles from './ResendVerificationLink.module.css'
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import ThemeButton from '../components/ThemeButton';
import ServerMessageContentOnly from '../components/ServerMessageContentOnly';
import WhiteLogo from '../../../public/white_logo.png'
import Link from 'next/link';

interface ServerResponse {
    success: boolean;
    message: string;
}

export default function ResendVerificationLink() {

    const [email, setEmail] = useState<string>('');
    const [error, setError] = useState<boolean>(false);

    const [activeStep, setActiveStep] = useState('resendLink');
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerHeight, setContainerHeight] = useState('fit-content');
    const [serverResponse, setServerResponse] = useState<ServerResponse>({
        success: false,
        message: ""
    });
    const router = useRouter();
    const [loading, setLoading] = useState(true)

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const newError = email.trim() === "" || !emailRegex.test(email);

        setError(newError)

        if(!newError) {
            console.log("Form submitted successfully", email);

            try {
                const res = await fetch('/api/resendVerificationLink', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({email}),
                });
    
                const data = await res.json();
    
                console.log(data.message)
                if (data.success) {
                    setServerResponse({
                        success: true,
                        message: data.message
                    })
                    window.location.hash = "sent";
                } else {
                    setServerResponse({
                        success: false,
                        message: data.message
                    })
                }
            } catch (error) {
                // console.error('Error:', error);
                setServerResponse({
                    success: false,
                    message: "Something went wrong. Please try again."
                })
            }
            finally {
                setActiveStep('responseMessage')
            }
        }
    }

    useEffect(() => {
        if (window.location.hash === "#sent") {
            setActiveStep('responseMessage');
            setServerResponse({
                success: true,
                message: "Ο σύνδεσμος επαλήθευσης email στάλθηκε με επιτυχία. Παρακαλώ ελέγξτε το email σας."
            })
        }
        setLoading(false)
    }, []);

    useEffect(() => {
        const updateHeight = () => {
            if (containerRef.current) {
                const activeSlide = containerRef.current.querySelector(`[data-active="true"]`);
                if (activeSlide) {
                    setContainerHeight(`${activeSlide.scrollHeight}px`);
                }
            }
        };
    
        updateHeight(); // Initial calculation
    
        window.addEventListener('resize', updateHeight);
        return () => window.removeEventListener('resize', updateHeight);
    }, [activeStep,loading]);

    return (
        <div className={styles.resendVerificationLink}>
            <Link href="/" className={styles.logo}>
                <Image 
                    alt="Logo" 
                    src={WhiteLogo} 
                    width={200}
                    height={0}
                />
            </Link>
            { !loading &&
            <div 
                ref={containerRef}
                className={styles.container}
                style={{ height: containerHeight }}
            >
                <div className={styles.slidesWrapper}>
                    <div 
                        data-active={activeStep === 'resendLink'}
                        className={`${styles.slide} ${activeStep === 'resendLink' ? styles.activeSlide : styles.leftSlide}`}
                    >
                        <div className={styles.title}>
                            Επαναποστολή Συνδέσμου Επαλήθεσης Email
                        </div>
                        <div className={styles.subtitle}>
                            Συμπληρώστε το Email σας για να λάβετε τον σύνδεσμο επαλήθεσης.
                        </div>
                        <form className={styles.form} onSubmit={handleSubmit}>
                            <input 
                                className={`${styles.input} ${error ? styles.error : ""}`}
                                type='text'
                                name='email'
                                placeholder='Email'
                                value={email}
                                onChange={(e) => {setEmail(e.target.value); setError(false)}}
                                onFocus={()=>setError(false)}
                            />
                            <ThemeButton
                                name='Επαναποστολή Συνδέσμου'
                                variant='primary'
                            />
                        </form>
                    </div>

                    <div 
                        data-active={activeStep === 'responseMessage'}
                        className={`${styles.slide} ${activeStep === 'responseMessage' ? styles.activeSlide : styles.rightSlide}`}
                    >
                        { serverResponse.success ? // Success
                            <ServerMessageContentOnly
                                message = {serverResponse.message}
                                variant="sent"
                                buttonText="Επιστροφή Στην Αρχική"
                                handleButtonClick={()=>router.push("/")}
                            />
                            : // Failure
                            <ServerMessageContentOnly
                                message = {serverResponse.message}
                                variant="failure"
                                buttonText="Επιστροφή Στην Αρχική"
                                handleButtonClick={()=>router.push("/")}
                            />
                        }
                    </div>

                </div>
                
            </div>
            }
        </div>
    )
}
