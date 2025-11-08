import { useEffect, useState } from "react"
import axios from "axios"
import { useAuth } from "../context/AuthContext"
import { setToken } from "../auth/tokenStore"

// Ελέγχει αν υπάρχει ενεργό access token για να συνδέσει τον χρήστη χωρίς να τον ξαναβάλει σε login form.
export const useAutoLogin = () => {
    const { login, logout } = useAuth()
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const checkRefresh = async () => {
        try {
            const res = await axios.post(
                `${import.meta.env.VITE_BASE_URL}/api/auth/refresh`,
                {},
                { withCredentials: true }
            )

            const { accessToken, user } = res.data

            if (accessToken && user) {
                setToken(accessToken)
                login(accessToken, user)
            } else {
                logout()
            }
        } catch {
            logout()
        } finally {
            setLoading(false)
        }
        }

        checkRefresh()
    }, [login, logout])

    return { loading }
}
