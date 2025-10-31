import React from 'react'
import Image from 'next/image'
import LogoIcon from '../../../public/logo_icon.png'
import styles from './Login.module.css'
import Link from 'next/link'
import GoogleButton from '../components/GoogleButton'
import LogInForm from '../components/LogInForm'


export default function Login() {
    return (
        <div className={styles.login}>

            {/* Login
            <Link href={"http://localhost:3001"}>Dashboard</Link> */}

            <div className={styles.form}>
                <div>
                    <Image 
                        alt="Logo" 
                        src={LogoIcon} 
                        width={50}
                        height={0}
                    />
                </div>
                <span className={styles.title}>Καλώς Ήρθατε!</span>


                {/* Login Form */}
                <LogInForm />

                <div className={styles.lines}>
                    <div className={styles.line}></div>
                    <span className={styles.or}> ή σύνεχεια με </span>
                    <div className={styles.line}></div>
                </div>

                {/* Google Button */}
                <GoogleButton />

                <div className='flex justify-between items-center text-sm mt-8 w-full'>
                    <Link href='/'>
                    <span className={styles.color}>Πίσω στη σελίδα</span>
                    </Link>
                    <div>
                        Δεν έχετε λογαριασμό; 
                        <Link href='/signup'>
                        <span className={`${styles.color} ml-2`}>Εγγραφή</span>
                        </Link>
                    </div>
                </div>

            </div>
        </div>
    )
}
