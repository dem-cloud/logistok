import React, { useEffect } from 'react'
import styles from './Snackbar.module.css'

interface SnackbarProps {
    snackbar: { message: string, type: string } | null;
    setSnackbar: (snackbar: { message: string, type: string } | null) => void;
}

export default function Snackbar(props: SnackbarProps) {

    const {
        snackbar,
        setSnackbar
    } = props;

    // Automatically hide snackbar after 3 seconds
    useEffect(() => {
        if (snackbar) {
            const timer = setTimeout(() => setSnackbar(null), 3000); // hide snackbar after 3 seconds
            return () => clearTimeout(timer);
        }
    }, [snackbar, setSnackbar]);

    return (
        snackbar && (
            <div className={`${styles.snackbar} ${snackbar.type === 'success' ? styles.success : styles.error}`}>
                {snackbar.message}
            </div>
        )
    )
}
