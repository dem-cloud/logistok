import React from 'react'
import './Navbar.css'
import { useRouter } from 'next/navigation';

export default function NavItems(props: any) {

    const {
        activeSection, 
        scrollToSection,
        customStyle = "navbar-items"
    } = props;

    const router = useRouter();

    const handleClick = (section: string) => {
        if (window.location.pathname !== '/') {
            // Store the target section in localStorage before navigation
            localStorage.setItem('targetSection', section);
            router.push('/');
        } else {
            scrollToSection(section);
        }
    };

    return (
        <nav className={customStyle}>
            <button 
                className={`nav-item ${activeSection === "home" ? "active" : ""}`}
                onClick={() => handleClick("home")}
            >
                Αρχική
            </button>
            <button 
                className={`nav-item ${activeSection === "features" ? "active" : ""}`}
                onClick={() => handleClick("features")}
            >
                Χαρακτηριστικά
            </button>
            <button 
                className={`nav-item ${activeSection === "industries" ? "active" : ""}`}
                onClick={() => handleClick("industries")}
            >
                Κλάδοι
            </button>
            <button 
                className={`nav-item ${activeSection === "pricing" ? "active" : ""}`}
                onClick={() => handleClick("pricing")}
            >
                Τιμολόγηση
            </button>
            <button 
                className={`nav-item ${activeSection === "contact" ? "active" : ""}`}
                onClick={() => handleClick("contact")}
            >
                Επικοινωνία
            </button>
        </nav>
    )
}
