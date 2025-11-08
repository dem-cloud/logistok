"use client"
import React from 'react'
import ThemeButton from './ThemeButton'

export default function ExploreButton() {

    const handleExploreClick = () => {
        window.dispatchEvent(new CustomEvent("scrollToSection", { detail: "features" }));
    };

    return (
        <ThemeButton
            name = "Εξερευνήστε"
            variant = "primary"
            handleClick = {handleExploreClick}
        />
    )
}
