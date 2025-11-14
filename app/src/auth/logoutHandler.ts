let logoutCallback: (() => void) | null = null;

export const registerLogout = (cb: () => void) => {
    logoutCallback = cb;
};

export const triggerLogout = () => {
    if (logoutCallback) logoutCallback();
};
