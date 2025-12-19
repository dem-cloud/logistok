
export interface User {
    email: string | null;
    phone: string | null;
}

export interface Company {
    id: string;
    name: string;
}

export interface CompanySessionInfo extends Company {
    onboarding: {
        current_step: number;
        max_step_reached: number;
        is_completed: boolean;
    }
    membership: {
        is_owner: boolean;
        status: "active" | "pending" | "disabled";
        role: {
            id: string;
            key: string;
            name: string;
        }
        permissions: string[];
    }
}

/**
 * Το Generic API Response
 */
export interface ApiResponse<T> {
    success: boolean;
    message: string;
    code?: string;
    data?: T;
}

/**
 * Το data αντικείμενο που επιστρέφει το auth (signup/login/refresh/password-reset)
 */
export interface AuthResponseData {
    access_token: string;
    user: User;
    companies: CompanySessionInfo[];
    active_company: CompanySessionInfo;
}

export interface RefreshResponseData {
    access_token: string;
}

export interface MeResponse {
    user: User;
    companies: CompanySessionInfo[];
}

/**
 * Τελικός τύπος του response στο signup/login
 */
export type AuthResponse = ApiResponse<AuthResponseData>;