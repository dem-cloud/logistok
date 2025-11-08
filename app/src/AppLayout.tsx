import { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';

export default function AppLayout() {
    const { user, refresh, logout } = useAuth();

    if (!user) return null;

    const expirationTime = new Date(user.accessTokenExpiration);
    const [timeLeft, setTimeLeft] = useState<number>(expirationTime.getTime() - Date.now());
    const [showPopup, setShowPopup] = useState<boolean>(false);

    useEffect(() => {
        const countdownInterval = setInterval(() => {
            const timeRemaining = expirationTime.getTime() - Date.now();

            if (timeRemaining <= 0) {
                clearInterval(countdownInterval);
                setTimeLeft(0); // Set to 0 when the token expires
                console.log("Token expired!");
                logout()
            } else {
                setTimeLeft(timeRemaining);
                // Show popup when there are 15 seconds remaining
                if (timeRemaining <= 15000 && !showPopup) {
                    setShowPopup(true);
                }
            }
        }, 1000);

        return () => clearInterval(countdownInterval); // Cleanup on component unmount
    }, [expirationTime, showPopup]);

    // Convert remaining time into seconds, minutes, and seconds
    const seconds = Math.floor(timeLeft / 1000) % 60;
    const minutes = Math.floor(timeLeft / 60000) % 60;
    const hours = Math.floor(timeLeft / 3600000);

    const handleContinue = async () => {
        setShowPopup(false);
        await refresh()
        console.log("Token refreshed.");
    };

    const handleDisconnect = async () => {
        // Trigger the logout process
        await logout();
    };

    return (
        <div>
            AppLayout
            <h1>Welcome, {user.firstName}!</h1>
            <p>Your role: {user.role}</p>
            <p>Email: {user.email}</p>
            <p>Access expires at: {expirationTime.toISOString()}</p>
            <p>
                Time left before expiration: {hours}h {minutes}m {seconds}s
            </p>

            {/* Popup for 15 seconds before token expiration */}
            {showPopup && (
                <div style={{
                    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', 
                    backgroundColor: 'rgba(0, 0, 0, 0.7)', color: 'white', padding: '20px', borderRadius: '8px'
                }}>
                    <h2>Session Expiring in {seconds}s seconds!</h2>
                    <p>Do you want to continue your session or disconnect?</p>
                    <button onClick={handleContinue} style={{ margin: '10px' }}>Continue</button>
                    <button onClick={handleDisconnect} style={{ margin: '10px' }}>Disconnect</button>
                </div>
            )}
        </div>
    );
}
