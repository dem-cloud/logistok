'use client'
import React, { useEffect, useState } from 'react'
import ThemeButton from './ThemeButton'
import NavItems from './NavItems'
import Logo from '../../public/logo.png'
import './Navbar.css';
import HamburgerIcon from '../../public/hamburger_icon.png'
import Image from 'next/image';
import PopupMenu from './PopupMenu'
import GetStartedButton from './GetStartedButton'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

export default function Navbar() {

    const [activeSection, setActiveSection] = useState<string | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    
    const scrollToSection = (id: string) => {
        const section = document.getElementById(id);
        if (section) {
            // section.scrollIntoView({ behavior: "smooth" });
            window.scrollTo({
                top: section.offsetTop - 96, // Adjust by the height of the navbar (96px or h-24)
                behavior: "smooth"
            });
            setActiveSection(id);
        }
        isMenuOpen && setIsMenuOpen(false)
    };

    // 1 Detect scrolling to highlight the correct section
    useEffect(() => {
        const handleScroll = () => {
            const sections = ["home", "features", "industries", "pricing", "contact"];
            let currentSection = null;

            for (const id of sections) {
                const section = document.getElementById(id);
                if (section) {
                    const offset = section.getBoundingClientRect().top;
                    if (offset >= 0 && offset <= 200) { // Adjust threshold as needed
                        currentSection = id;
                        break;
                    }
                }
            }
            if (currentSection) {
                // console.log(currentSection)
                setActiveSection(currentSection);
            }
        };

        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // 2 Listen for "scrollToSection" event from HomeSection & from QuickLinks
    useEffect(() => {
        const handleCustomEvent = (event: Event) => {
            const customEvent = event as CustomEvent<string>;
            scrollToSection(customEvent.detail);
        };

        window.addEventListener("scrollToSection", handleCustomEvent);
        return () => window.removeEventListener("scrollToSection", handleCustomEvent);
    }, []);

    useEffect(() => {
        // Check for stored target section on mount
        const storedSection = localStorage.getItem('targetSection');
        if (storedSection) {
          scrollToSection(storedSection);
          localStorage.removeItem('targetSection');
        }
      }, []);

    const toggleMenu = () => {
        setIsMenuOpen(prevState => !prevState);
    };

    const handleMenu = () => {
        isMenuOpen && setIsMenuOpen(false);
    }

    return (
        <div className="navbar">
            <div className="navbar-left">
                <div 
                    className="navbar-logo"
                    onClick={() => scrollToSection("home")}
                >
                    <Image 
                        alt="Logo" 
                        src={Logo} 
                        width={200}
                        height={0}
                    />
                </div>

                <NavItems 
                    activeSection={activeSection} 
                    scrollToSection={scrollToSection}
                />
            </div>

            <div className="navbar-right">
                
                <div className='flex'>
                    <GetStartedButton />
                </div>

                <div className='flex ml-6'>
                    <ThemeButton 
                        name="Σύνδεση" 
                        variant="secondary"
                        handleClick={() => window.location.href = `${APP_URL}/auth`}
                    />
                </div>
            </div>

            <button className="hamburger-btn" onClick={toggleMenu}>
                <Image alt="Hamburger Button" src={HamburgerIcon} width={24} height={24} />
            </button>

            {/* Pop up with navbar-items and navbar-right in column */}
            {isMenuOpen && (
                <PopupMenu 
                    activeSection={activeSection} 
                    scrollToSection={scrollToSection}
                    handleMenu = {handleMenu}
                    setIsMenuOpen = {setIsMenuOpen}
                />
            )}
    </div>
    )
}
