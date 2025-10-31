import React from 'react'
import styles from './Footer.module.css'
import Image from 'next/image'
import WhiteLogo from '../../../public/white_logo.png'
import QuickLinks from './QuickLinks'
import Newsletter from './Newsletter'
import Link from 'next/link'
import CompanyLinks from './CompanyLinks'

export default function Footer() {
    
    return (
        <div className={styles.footer}>
            <div className={styles.container}>
                
                <div className={styles.logo}>
                    <Image alt="Logo" src={WhiteLogo} width={200} height={0} />
                </div>

                <div className={styles.layout}>
                    {/* Column 1: Quick Links */}
                    <QuickLinks />

                    {/* Column 2: About the Company */}
                    <CompanyLinks />

                    {/* Column 3: Social Media */}
                    <div className={styles.column}>
                        <span className={styles.title}>Social</span>
                        <span>LinkedIn</span>
                        <Link href="https://www.instagram.com/logi.stok" target="_blank" rel="noopener noreferrer">
                        <span>Instagram</span>
                        </Link>
                        <span>YouTube</span>
                    </div>

                    {/* Column 4: Newsletter */}
                    <Newsletter />
                </div>
            </div>
        </div>

    )
}
