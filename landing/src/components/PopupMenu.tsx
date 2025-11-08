import React from 'react'
import './Navbar.css';
import NavItems from './NavItems';
import ThemeButton from './ThemeButton';
import Logo from '../../public/logo.png'
import CloseIcon from '../../public/close_icon.png'
import Image from 'next/image';
import Link from 'next/link';

interface PopupMenuProps {
    activeSection: string | null;
    scrollToSection: (section: string) => void;
    handleMenu: () => void;
    setIsMenuOpen: (isOpen: boolean) => void;
}

export default function PopupMenu(props: PopupMenuProps) {

    const {
        activeSection, 
        scrollToSection,
        handleMenu,
        setIsMenuOpen
    } = props;

    return (
        <div className="popup-menu">
            <div className="flex flex-col">
                <div className="navbar-logo">
                    <Image 
                        alt="Logo" 
                        src={Logo}
                        width={200}
                        height={0}
                    />
                </div>

                <NavItems 
                    activeSection = {activeSection} 
                    scrollToSection = {scrollToSection}
                    customStyle = "navbar-items-mob"
                />
            </div>

            <div className="flex flex-col justify-between h-28">

                <Link className='flex' href="/signup">
                    <ThemeButton 
                        name = "Ξεκινήστε" 
                        variant = "primary" 
                        customStyle = "w-48 justify-center" 
                        handleClick = {handleMenu}
                    />
                </Link>
                
                <Link className='flex' href="/login">
                    <ThemeButton 
                        name = "Σύνδεση" 
                        variant = "secondary" 
                        customStyle = "w-48 justify-center" 
                        handleClick = {handleMenu}
                    />
                </Link>
            </div>

            <div className='absolute top-0 right-0 h-16 flex justify-center items-center mr-8'>
                <button onClick={()=>setIsMenuOpen(false)}>
                    <Image alt="Close Button" src={CloseIcon} width={24} height={24} />
                </button>
            </div>
        </div>
    )
}
