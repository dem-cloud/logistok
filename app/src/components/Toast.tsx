import { useEffect, useState } from "react";
import styles from "./Toast.module.css";
import { ToastType } from "../types/toast.types";

interface Props {
    message: string;
    type: ToastType;
}

export default function Toast({ message, type }: Props) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setVisible(true), 10);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div
            className={`${styles.toast} ${styles[type]} ${
                visible ? styles.visible : ""
            }`}
        >
            {message}
        </div>
    );
}
