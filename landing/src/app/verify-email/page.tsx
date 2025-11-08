"use client";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import styles from './VerifyEmail.module.css'
import ServerMessage from "@/components/ServerMessage";
import WhiteLogo from '../../../public/white_logo.png'
import Image from "next/image";
import Link from "next/link";
import { axiosPublic } from "@/lib/axios";

export default function VerifyEmail() {

    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get("token");
    const [message, setMessage] = useState<string>("Verifying your email...");
    const [tokenIsInvalidOrExpired, setTokenIsInvalidOrExpired] = useState<boolean>(true);
    const [tokenNull, setTokenNull] = useState<boolean>(false);
    const [loading, setLoading] = useState(true)

    useEffect(() => {
    
        if (!token) {
            setMessage('No verify token provided');
            setTokenNull(true);
            setLoading(false);
            setTimeout(() => router.push("/"), 3000);
            return;
        }

        const verifyEmail = async () => {
            setLoading(true);
            
            try {
                const response = await axiosPublic.get(
                    '/api/shared/verify-email',
                    { params: { token } }
                );
                
                const { success, message } = response.data;
                setMessage(message);
                setTokenIsInvalidOrExpired(!success);
                
            } catch (error) {
                setMessage("Something went wrong. Please try again.")
                setTokenNull(true)
                setTimeout(() => router.push("/"), 3000);
            } finally {
                setLoading(false);
            }
        };

        verifyEmail();
    }, [token]);

    return (
        <div className={styles.verifyEmail}>
            <Link href="/" className={styles.logo}>
                <Image 
                    alt="Logo" 
                    src={WhiteLogo} 
                    width={200}
                    height={0}
                />
            </Link>
            { loading ?
                <span className="text-white font-semibold text-lg">
                    Checking token...
                </span>
                :
                !loading && tokenIsInvalidOrExpired ?
                <div>
                    {/* Link Expired or Invalid */}
                    <ServerMessage 
                        message = {message}
                        variant="failure"
                        extraContent = {tokenNull ? null : <Link href="/resend-verification-link" className={styles.resendLink}>Επαναποστολή Συνδέσμου Εξακρύβωσης Email</Link>}
                        buttonText="Επιστροφή Στην Αρχική"
                        handleButtonClick={()=>router.push("/")}
                    />
                </div>
                :
                <ServerMessage 
                    message = {message}
                    variant="success"
                    buttonText="Προχωρήστε για Σύνδεση"
                    handleButtonClick={()=>router.push("/login")}
                />
            }
        </div>
    );
};