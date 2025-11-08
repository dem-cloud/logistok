import { useEffect } from "react";
import axios from "axios";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Δήλωση του global αντικειμένου google (το παρέχει το script)
declare global {
    interface Window {
        google: any;
    }
}

const GoogleLoginButton: React.FC = () => {
    useEffect(() => {
        if (!window.google) return;

        window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleResponse,
        });

        window.google.accounts.id.renderButton(
            document.getElementById("googleSignInDiv"),
            { 
                theme: "outline", // ή "filled_blue", "filled_black"
                size: "large", // ή "small", "medium"
                text: "continue_with", // ή signin_with, "signup_with", "continue_with", "signin"
                shape: "rectangular", // ή "pill", "circle", "square"
                // logo_alignment: "left", // ή "center"
                // width: "250"       // προαιρετικό πλάτος σε pixels
            }
        );
    }, []);

    const handleGoogleResponse = async (response: any) => {
        try {
            // Στέλνεις το credential token στο backend σου
            const res = await axios.post("/api/auth/google", {
                credential: response.credential,
            });

            console.log("Server response:", res.data);

            // π.χ. αποθήκευσε το accessToken στο localStorage
            // localStorage.setItem("accessToken", res.data.accessToken);
        } catch (error) {
            console.error("Google login error:", error);
        }
    };

    return <div id="googleSignInDiv" style={{ width:"100%" }} onMouseDown={(e) => e.preventDefault()}></div>;
};

export default GoogleLoginButton;
