
export interface User {
    id: string;
    email: string | null;
    phone: string | null;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
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
    country?: string | null;
    is_main: boolean;
    is_active?: boolean;  // false when store disabled by plan downgrade; undefined = legacy, treat as true
    scheduled_deactivate_at?: string | null;  // ISO date when store will be deactivated
    
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

    subscription?: {
        plan: {
            name: string;
            key?: string | null;
            features?: { reports?: boolean; plugins_allowed?: string[] } | null;
            included_branches?: number;
            max_users?: number | null;
        };
        status?: 'incomplete' | 'incomplete_expired' | 'active' | 'past_due' | 'trialing' | 'canceled';
    };
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