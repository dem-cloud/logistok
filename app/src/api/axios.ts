import axios from "axios";
import { getToken } from "../auth/tokenStore"
import { triggerLogout } from "../auth/logoutHandler";
import { getExp } from "../auth/getExp";
import { getExternalRefresh } from "../auth/refreshHandler";

const BASE_URL = import.meta.env.VITE_API_URL;

// Public axios instance (χωρίς authentication)
export const axiosPublic = axios.create({
    baseURL: BASE_URL,
    // timeout: 10000,
    headers: {
        'Content-Type': 'application/json'
    },
    validateStatus: () => true // Έτσι το Axios ΔΕΝ θα κάνει throw για 400, 401, 404, Θα κάνει throw μόνο σε network errors 500
});

// Private axios instance (με authentication)
export const axiosPrivate = axios.create({
    baseURL: BASE_URL,
    // timeout: 10000,
    headers: {
        'Content-Type': 'application/json'
    },
    withCredentials: true
});

// Request interceptor - Adding token in header
axiosPrivate.interceptors.request.use(
    (config) => {
        const token = getToken()
        const exp = getExp(token);

        if (token && exp) {
            config.headers.Authorization = `Bearer ${token}`
        }

        return config
    },
    (error) => Promise.reject(error)
)

// Fallback refresh on 401 - When access token expires tries for refresh
axiosPrivate.interceptors.response.use(
    res => res,
    async error => {
        const original = error.config;

        if (error.response?.status === 401 && !original._retry) {
        original._retry = true;

        const refresh = getExternalRefresh();
        if (!refresh) return Promise.reject(error); // safeguard

        try {
            const newToken = await refresh();

            original.headers.Authorization = `Bearer ${newToken}`;
            
            return axiosPrivate(original);

        } catch {
            triggerLogout(); // Η συνεδρία έληξε → forceLogout
            return Promise.reject(error); 
        }
        }

        return Promise.reject(error);
    }
);

/*

Request Type                 Timeout             Λόγος

GET (data fetch)             5000-10000ms        Γρήγορα reads
POST/PUT (submit data)       10000-15000ms       Writes μπορεί να είναι αργότερα
File Upload                  30000-60000ms       Μεγάλα αρχεία χρειάζονται χρόνο
Report Generation            30000-60000ms       Heavy processing


// Fast requests (list data)
export const axiosFast = axios.create({
    baseURL: BASE_URL,
    timeout: 5000, // 5 δευτερόλεπτα
});

// Normal requests
export const axiosPrivate = axios.create({
    baseURL: BASE_URL,
    timeout: 10000, // 10 δευτερόλεπτα
});

// Slow requests (file uploads, reports)
export const axiosSlow = axios.create({
    baseURL: BASE_URL,
    timeout: 60000, // 60 δευτερόλεπτα
});


*/