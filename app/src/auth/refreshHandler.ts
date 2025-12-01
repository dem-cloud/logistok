interface User {
    email: string;
    first_name: string;
    last_name: string;
    needsOnboarding: boolean;
    onboardingStep: number;
}

interface RefreshResponse {
    access_token: string;
    user: User;
}

let externalRefresh: (() => Promise<RefreshResponse>) | null = null;

export function registerRefresh(fn: () => Promise<RefreshResponse>) {
    externalRefresh = fn;
}

export function getExternalRefresh() {
    return externalRefresh;
}
