import Image from 'next/image'
import React from 'react'
import MainImage from '../../public/main.png'
import './HomeSection.css'
import ExploreButton from '../components/ExploreButton'
import GetStartedButton from '@/components/GetStartedButton'


export default function HomeSection() {

    return (
        <div className='home-section'>
            <div className='hs-left-panel'>
                <span className='hs-main-text'>
                    Βελτιστοποιήστε τις λειτουργίες σας, παρακολουθήστε τα πάντα, αναπτυχθείτε εύκολα.
                </span>
                <span className='hs-secondary-text'>Από το απόθεμα στις πωλήσεις – Η επιχείρησή σας, απλοποιημένη.</span>
                <div className='hs-buttons'>
                    <ExploreButton />
                    
                    <GetStartedButton
                        variant = "secondary" 
                    />
                </div>
            </div>
            <div className='hs-right-panel'>
                <Image
                    alt="" 
                    src={MainImage} 
                    width={850} 
                    height={0}
                    style={{ height: 'auto' }}
                />
            </div>
        </div>
    )
}
