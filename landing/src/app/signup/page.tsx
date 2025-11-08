import React, { useEffect, useState } from 'react'
import styles from './Signup.module.css'
import Image from 'next/image'
import WhiteLogo from '../../../public/white_logo.png'
import SignUpForm from '@/components/SignUpForm'
import GoogleButton from '@/components/GoogleButton'
import Link from 'next/link'

export default function Signup() {
    
    return (
        <div className={styles.signup}>
            <Link href="/" className={styles.logo}>
                <Image 
                    alt="Logo" 
                    src={WhiteLogo} 
                    width={200}
                    height={0}
                />
            </Link>
            
            <div className={styles.form}>
                <span className={styles.title}>Ας ξεκινήσουμε</span>

                <div className={styles.container}>
                    <SignUpForm />

                    <div className={styles.lines}>
                        <div className={styles.line}></div>
                        <span className={styles.or}> ή σύνεχεια με </span>
                        <div className={styles.line}></div>
                    </div>

                    {/* Google Button */}
                    <GoogleButton />

                    <div className='flex justify-between items-center text-sm mt-8'>
                        <Link href='/'>
                        <span className={styles.color}>Πίσω στη σελίδα</span>
                        </Link>
                        <div>
                            Έχετε ήδη λογαριασμό; 
                            <Link href='/login'>
                            <span className={`${styles.color} ml-2`}>Σύνδεση</span>
                            </Link>
                        </div>
                </div>

                </div>
            </div>
        </div>
    )
}
