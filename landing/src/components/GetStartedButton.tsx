"use client"
import React from 'react'
import ThemeButton from './ThemeButton'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

interface GetStartedProps {
    variant?: string;
}

export default function GetStartedButton(props: GetStartedProps) {

    const {variant = "primary"} = props;

    const handleGetStartedClick = () => {
        window.location.href = `${APP_URL}/auth`;
    };

    return (
        <ThemeButton
            name = "Ξεκινήστε"
            variant = {variant}
            handleClick = {handleGetStartedClick}
        />
    )
}
