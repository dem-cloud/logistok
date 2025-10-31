"use client";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import styles from './VerifyEmail.module.css'
import ServerMessage from "../components/ServerMessage";
import WhiteLogo from '../../../public/white_logo.png'
import Image from "next/image";
import Link from "next/link";

export default function VerifyEmail() {

    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get("token");
    const [message, setMessage] = useState<string>("Verifying your email...");
    const [tokenIsInvalidOrExpired, setTokenIsInvalidOrExpired] = useState<boolean>(true);
    const [tokenNull, setTokenNull] = useState<boolean>(false);
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (token) {
            fetch(`/api/verifyAccount?token=${token}`)
                .then((res) => res.json())
                .then((data) => {
                    setMessage(data.message);
                    if (data.success) {
                        setTokenIsInvalidOrExpired(false);
                    }
                })
                .catch(() => {
                    setMessage("Something went wrong. Please try again.");
                    setTokenNull(true);
                    setTimeout(() => router.push("/"), 3000);
                })
                .finally(() => setLoading(false));
        } else {
            setMessage("Something went wrong. Please try again.");
            setTokenNull(true);
            setLoading(false);
            setTimeout(() => router.push("/"), 3000);
        }
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