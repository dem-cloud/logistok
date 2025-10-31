import React from 'react'
import Navbar from '../components/Navbar'
import Header from '../components/aboutUs/Header'
import Footer from '../components/Footer'
import Vision from '../components/aboutUs/Vision'
import DiscoverLogistok from '../components/aboutUs/DiscoverLogistok'
import Team from '../components/aboutUs/Team'
import ContactSection from '../components/aboutUs/ContactSection'

export default function AboutUs() {
    return (
        <main id='about-us'>
            <Navbar />

            <Header />
            <Vision />
            <DiscoverLogistok />
            <Team />
            <ContactSection />

            <Footer />
        </main>
    )
}
