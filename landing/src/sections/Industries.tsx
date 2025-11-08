import React from 'react'
import './Industries.css'
import industriesData from '@/data/industriesData.json';
import IndustryCard from '../components/IndustryCard';

interface Industry {
    id: number;
    image?: string;
    title?: string;
    subtitle?: string;
    available?: boolean;
}

const industries: Industry[] = industriesData;

export default function Industries() {
    return (
        <div className='industries-section'>
            <span className='is-title'>Προσαρμοσμένο για Πολλούς Επιχειρηματικούς Κλάδους.</span>
            <div className='is-cards'>
                {industries.map(industry => (
                    <IndustryCard 
                        key={industry.id}
                        image={industry.image}
                        title = {industry.title}
                        subtitle = {industry.subtitle}
                        available = {industry.available}
                    />
                ))}
            </div>
        </div>
    )
}
