import React from 'react'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import Header from '@/components/careers/Header'
import OpenPositions from '@/components/careers/OpenPositions'
import Apply from '@/components/careers/Apply'

export default function Careers() {
    return (
        <main id='careers'>
            <Navbar />

            <Header />
            <OpenPositions />
            <Apply />

            <Footer />
        </main>
    )
}
