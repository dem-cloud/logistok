"use client"
import React, { useEffect, useRef, useState } from 'react'
import styles from './ResetPassword.module.css'
import ResetPasswordForm from '@/components/ResetPasswordForm'
import CheckYourEmail from '@/components/CheckYourEmail';
import Image from 'next/image';
import WhiteLogo from '../../../public/white_logo.png'
import Link from 'next/link';

export default function ResetPassword() {
    const [loading, setLoading] = useState(true)
    const [activeStep, setActiveStep] = useState('resetPassword');
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerHeight, setContainerHeight] = useState('fit-content');

    useEffect(() => {
        if (window.location.hash === "#submitted") {
            setActiveStep('checkYourEmail');
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
        <div className={styles.forgot}>
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
                        data-active={activeStep === 'resetPassword'}
                        className={`${styles.slide} ${activeStep === 'resetPassword' ? styles.activeSlide : styles.leftSlide}`}
                    >
                        <ResetPasswordForm onNextStep={() => setActiveStep('checkYourEmail')} />
                    </div>
        
                    <div 
                        data-active={activeStep === 'checkYourEmail'}
                        className={`${styles.slide} ${activeStep === 'checkYourEmail' ? styles.activeSlide : styles.rightSlide}`}
                    >
                        <CheckYourEmail />
                    </div>
                </div>
            </div>
            }
        </div>
    )
}