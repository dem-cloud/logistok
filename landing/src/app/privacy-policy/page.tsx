import React from 'react'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import PrivacyPolicySection from '@/components/privacyPolicy/PrivacyPolicySection'

export default function PrivacyPolicy() {
    return (
        <main id='privacyPolicy'>
            <Navbar />

            <PrivacyPolicySection />

            <Footer />
        </main>
    )
}
