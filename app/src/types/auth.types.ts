
export interface User {
    id: string;
    email: string | null;
    phone: string | null;
    first_name: string | null;
    last_name: string | null;
}

export interface Role {
    id: string;
    key: string;
    name: string;
}

export interface StoreRole {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    is_main: boolean;
    
    role: Role;
    permissions: string[];
}

export interface OnboardingInfo {
    current_step: number;
    max_step_reached: number;
    is_completed: boolean;
}

export interface MembershipInfo {
    is_owner: boolean;
    status: 'active' | 'pending' | 'disabled';

    // Company-level role (if exists)
    role?: Role;
    permissions?: string[];
}

export interface CompanySessionInfo {
    id: string;
    name: string;
    logo_url: string | null;

    onboarding: OnboardingInfo;
    membership: MembershipInfo;
    
    stores: StoreRole[];
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