'use client'
import React from 'react'
import styles from './ThemeButton.module.css'

interface ThemeButtonProps {
    name?: string;
    variant?: 'primary' | 'secondary' | string;
    customStyle?: string;
    handleClick?: () => void;
    disabled?: boolean;
}

export default function ThemeButton(props: ThemeButtonProps) {

    const {
        name = "ThemeButton",
        variant = "",
        customStyle = "",
        handleClick = ()=>{},
        disabled = false
    } = props;

    return (
        <button 
            onClick={handleClick}
            className={`${styles.button} ${disabled ? 'disabled' : ''} ${styles[variant]} ${customStyle}`}
            disabled = {disabled}
        >
            <span className='text-center w-full'>{name}</span>
        </button>
    )
}
