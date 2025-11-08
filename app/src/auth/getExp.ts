export function getExp(token: string | null): number | null {
    if (!token) return null;
    try {
        const [, payloadB64] = token.split(".");
        const payload = JSON.parse(atob(payloadB64));
        return typeof payload.exp === "number" ? payload.exp : null;
    } catch {
        return null;
    }
}
