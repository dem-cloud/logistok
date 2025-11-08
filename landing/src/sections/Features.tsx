import React from 'react'
import './Features.css'
import FeatureCard from '../components/FeatureCard'
import featuresData from '@/data/featuresData.json';

interface Feature {
    id: number;
    labelColor?: string;
    title?: string;
    subtitle?: string;
    image?: string;
}

const features: Feature[] = featuresData;

export default function Features() {
    return (
        <div className='features-section'>
            <span className='fs-title'>Το All-in-One Σύστημα Διαχείρισης για Σύγχρονες Επιχειρήσεις.</span>
            <div className='fs-cards'>
                {features.map(feature => (
                    <FeatureCard 
                        key={feature.id}
                        labelColor={feature.labelColor}
                        title = {feature.title}
                        subtitle = {feature.subtitle}
                        image={feature.image}
                    />
                ))}
            </div>
        </div>
    )
}
