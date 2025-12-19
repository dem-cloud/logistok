// Αυτο ειναι για να ειναι ολη η λογικη των request μαζεμενη εδω.

// import { axiosPublic, axiosPrivate } from '../api/axios';

// export const authService = {
//     login: async (credentials: { email: string; password: string }) => {
//         const response = await axiosPublic.post('/api/auth/login', credentials);
//         return response.data;
//     },

//     signup: async (userData: any) => {
//         const response = await axiosPublic.post('/api/auth/signup', userData);
//         return response.data;
//     },

//     logout: async () => {
//         await axiosPrivate.post('/api/auth/logout');
//         localStorage.removeItem('accessToken');
//         localStorage.removeItem('refreshToken');
//     },

//     getCurrentUser: async () => {
//         const response = await axiosPrivate.get('/api/user/me');
//         return response.data;
//     }
// };


// Και εκει που κανουμε το request e.g. login.ts
// import { authService } from '@/services/authService';

// const handleLogin = async () => {
//     try {
//         const data = await authService.login({ email, password });
//         localStorage.setItem('accessToken', data.accessToken);
//         navigate('/dashboard');
//     } catch (error) {
//         alert(error.message);
//     }
// };