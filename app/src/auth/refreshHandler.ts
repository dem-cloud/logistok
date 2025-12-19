import { RefreshResponseData } from "../types/auth.types";

let externalRefresh: (() => Promise<RefreshResponseData>) | null = null;

export function registerRefresh(fn: () => Promise<RefreshResponseData>) {
    externalRefresh = fn;
}

export function getExternalRefresh() {
    return externalRefresh;
}
