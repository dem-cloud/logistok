import { useEffect } from "react";
import axios from "axios";
import { axiosPublic } from "@/api/axios";
import { useAuth } from "@/context/AuthContext";
import { getFingerprint } from "@/auth/getFingerprint";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Δήλωση του global αντικειμένου google (το παρέχει το script)
declare global {
    interface Window {
        google: any;
    }
}

const GoogleLoginButton: React.FC = () => {

    const { login, showToast } = useAuth();

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

    const handleGoogleResponse = async (googleResponse: any) => {
        try {
            const fingerprint = await getFingerprint();
            // Στέλνεις το credential token στο backend σου
            const response = await axiosPublic.post("/api/auth/google", { credential: googleResponse.credential, fingerprint }, { withCredentials: true });
            const { success, message, data = {}, code } = response.data;

            if(!success){
                showToast({ message: "Κάτι πήγε στραβά", type: "error" });
                return;
            }

            login(data);

        } catch (error) {
            console.error("Google login error:", error);
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
        }
    };

    return <div id="googleSignInDiv" style={{ width:"100%" }} onMouseDown={(e) => e.preventDefault()}></div>;
};

export default GoogleLoginButton;
