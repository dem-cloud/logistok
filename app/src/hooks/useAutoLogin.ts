import { useEffect, useState } from "react"
import { useAuth } from "../context/AuthContext"
import { axiosPrivate } from "../api/axios";

// Ελέγχει αν υπάρχει ενεργό access token για να συνδέσει τον χρήστη χωρίς να τον ξαναβάλει σε login form.
export const useAutoLogin = () => {
    const { refresh, forceLogout, setUser } = useAuth();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const attempt = async () => {
            try {

                await refresh();      // Χρησιμοποιούμε την κεντρική λογική ανανέωσης

                const response = await axiosPrivate.get("/api/auth/me");
                const { success, message, data } = response.data
                const { user } = data;

                if(!success || !user){
                    console.log(message)
                    throw new Error("invalid_me_response");
                }

                setUser(user);

            } catch {
                forceLogout();        // Αν απέτυχε, η συνεδρία έληξε → redirect login
            } finally {
                setLoading(false);
            }
        };

        attempt();
    }, []);

  return { loading };
};