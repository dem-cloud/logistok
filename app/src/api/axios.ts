import axios from "axios";
import { getToken, setToken } from "../auth/tokenStore"

const BASE_URL = import.meta.env.VITE_API_URL;

// Public axios instance (χωρίς authentication)
export const axiosPublic = axios.create({
    baseURL: BASE_URL,
    // timeout: 10000,
    headers: {
        'Content-Type': 'application/json'
    }
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

        if (token) {
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
            try {
                const refreshed = await fetch(`${BASE_URL}/api/auth/refresh`, {
                    method: "POST",
                    credentials: "include"
                });
                if (!refreshed.ok) throw new Error("refresh_failed");

                const data = await refreshed.json();

                setToken(data.access_token);

                original.headers.Authorization = `Bearer ${data.access_token}`;

                return axiosPrivate(original);
            } catch {
                setToken(null);
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