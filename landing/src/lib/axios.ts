import axios from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

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


// TODO: Να το ελέγξω αν με interceptors εχω καλύτερη υλοποίηση.
// Αν και με context api και withCredentials: true ειναι το ιδιο.