import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import LoadingSpinner from "../components/LoadingSpinner";
import styles from './Auth.module.css'
import LogoIcon from '../assets/logo_icon.png'
import AuthForm from "../components/AuthForm";
import GoogleButton from "../components/GoogleButton.js"
import { useAuth } from "../context/AuthContext.js";

const WEBSITE_URL = import.meta.env.VITE_WEBSITE_URL;

export default function Auth() {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    
    useEffect(() => {
        // Αν είναι ήδη logged in, πήγαινε στο dashboard
        if (!loading && user) {
            navigate('/', { replace: true });
        }
    }, [user, loading, navigate]);
    
    if (loading) {
        return <LoadingSpinner />;
    }
    
    return (
        <div className={styles.auth}>

            <div className={styles.form}>
                <div 
                    className={styles.image}
                    onClick={()=>window.location.href=WEBSITE_URL}
                >
                    <img alt="" src={LogoIcon} className={styles.logo} />
                </div>
                <div className={styles.title}>Καλώς Ήρθατε στο Logistok!</div>
                <div className={styles.tagline}>Όλα όσα χρειάζεστε, σε ένα μέρος.</div>


                {/* Google Button */}
                <GoogleButton />

                <div className={styles.lines}>
                    <div className={styles.line}></div>
                    <span className={styles.or}> ή συνέχεια με </span>
                    <div className={styles.line}></div>
                </div>

                {/* Login Form */}
                <AuthForm />

                <div className={styles.footer}>
                    <div 
                        className={styles.backToWebsite}
                        onClick={()=>window.location.href=WEBSITE_URL}
                    >
                        Πίσω στη σελίδα
                    </div>
                </div>

            </div>
        </div>
    );
}
