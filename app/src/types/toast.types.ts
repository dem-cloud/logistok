export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastData {
    message: string;
    type?: ToastType;
    duration?: number;
}