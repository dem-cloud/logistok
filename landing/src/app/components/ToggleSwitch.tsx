"use client"
import React, { useState } from "react";
import styles from "./ToggleSwitch.module.css";

interface ToggleSwitchProps {
    isYearly: boolean;
    setIsYearly: (isYearly: boolean) => void;
}

export default function ToggleSwitch(props: ToggleSwitchProps) {

    const {
        isYearly = false, 
        setIsYearly = () => {}
    } = props;

    return (
        <div className={styles.toggleContainer}>
            <span className={`${styles.toggleLabel} ${!isYearly ? styles.active : ""}`}>Μηνιαία</span>

            <div className={styles.toggleSwitch} onClick={() => setIsYearly(!isYearly)}>
                <div className={`${styles.toggleCircle} ${isYearly ? styles.yearly : styles.monthly}`}></div>
            </div>

            <span className={`${styles.toggleLabel} ${isYearly ? styles.active : ""}`}>Ετήσια</span>
        </div>
    );
}
