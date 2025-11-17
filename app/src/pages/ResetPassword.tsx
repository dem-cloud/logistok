import styles from './Auth.module.css'
import LogoIcon from '../assets/logo_icon.png'
import { useNavigate } from 'react-router-dom';
import AuthForm from '../components/AuthForm';
import { useState } from 'react';

const WEBSITE_URL = import.meta.env.VITE_WEBSITE_URL;

export default function ResetPassword() {

    const navigate = useNavigate();

    const [tagline, setTagline] = useState("Πες μας το email σου για να σου στείλουμε τον κωδικό επαλήθευσης.")
    
    return (
        <div className={styles.auth}>

            <div className={styles.form}>
                <div 
                    className={styles.image}
                    onClick={()=>window.location.href=WEBSITE_URL}
                >
                    <img alt="" src={LogoIcon} className={styles.logo} />
                </div>
                <div className={styles.title}>Επαναφορά Κωδικού Πρόσβασης</div>
                <div className={styles.tagline}>{tagline}</div>

                <AuthForm 
                    type = "password_reset"
                    setTagline={setTagline}
                />

                <div className={styles.footer}>
                    <div 
                        className={styles.backToWebsite}
                        onClick={()=>navigate('/auth')}
                    >
                        Πίσω
                    </div>
                </div>

            </div>
        </div>
    )
}
