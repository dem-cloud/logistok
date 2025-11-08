"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import styles from './RecoverAccess.module.css';
import CreateNewPasswordForm from "@/components/CreateNewPasswordForm";
import ServerMessage from "@/components/ServerMessage";
import Image from "next/image";
import WhiteLogo from '../../../public/white_logo.png'
import ServerMessageContentOnly from "@/components/ServerMessageContentOnly";
import Link from "next/link";
import { axiosPublic } from "@/lib/axios";

interface ServerResponse {
    success: boolean;
    message: string;
}

export default function RecoverAccess() {

    const searchParams = useSearchParams();
    const token = searchParams.get("token") ?? "";
    const router = useRouter();

    const [message, setMessage] = useState<string>("Verifying your token...");
    const [tokenIsInvalidOrExpired, setTokenIsInvalidOrExpired] = useState<boolean>(true);
    const [tokenNull, setTokenNull] = useState<boolean>(false);
    const [serverResponse, setServerResponse] = useState<ServerResponse>({
        success: false,
        message: ""
    });

    const [loading, setLoading] = useState(true)
    const [activeStep, setActiveStep] = useState('createNewPassword');
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerHeight, setContainerHeight] = useState('fit-content');

    useEffect(() => {

        if (!token) {
            setMessage('No reset token provided');
            setTokenNull(true);
            setLoading(false);
            setTimeout(() => router.push("/"), 3000);
            return;
        }

        const validateResetToken = async () => {
            setLoading(true);
            
            try {
                const response = await axiosPublic.get(
                    '/api/shared/reset-password',
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

        validateResetToken();
    }, [token]);

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
        <div className={styles.recoverAccess}>
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
                <ServerMessage 
                    message = {message}
                    variant="failure"
                    extraContent = {tokenNull ? null : <Link href="/reset-password" className={styles.link}>Προσπαθήστε Ξανά</Link>}
                    buttonText="Επιστροφή Στην Αρχική"
                    handleButtonClick={()=>router.push("/")}
                />
            </div>
            :
            <div 
                ref={containerRef}
                className={styles.container}
                style={{ height: containerHeight }}
            >
                <div className={styles.slidesWrapper}>
                    <div 
                        data-active={activeStep === 'createNewPassword'}
                        className={`${styles.slide} ${activeStep === 'createNewPassword' ? styles.activeSlide : styles.leftSlide}`}
                    >
                        <CreateNewPasswordForm 
                            onNextStep={() => setActiveStep('successfulNewPassword')} 
                            setServerResponse = {setServerResponse}
                            token = {token}
                        />
                    </div>
        
                    <div 
                        data-active={activeStep === 'successfulNewPassword'}
                        className={`${styles.slide} ${activeStep === 'successfulNewPassword' ? styles.activeSlide : styles.rightSlide}`}
                    >
                        { serverResponse.success ? // Success
                            <ServerMessageContentOnly
                                message = {serverResponse.message}
                                variant="success"
                                buttonText="Προχωρήστε για Σύνδεση"
                                handleButtonClick={()=>router.push("/login")}
                            />
                            : // Failure
                            <ServerMessageContentOnly
                                message = {serverResponse.message}
                                variant="failure"
                                extraContent = {<Link href="/reset-password" className={styles.link}>Προσπαθήστε Ξανά</Link>}
                                buttonText="Επιστροφή Στην Αρχική"
                                handleButtonClick={()=>router.push("/")}
                            />
                        }
                    </div>
                </div>
            </div>
            }
        </div>
    );
};