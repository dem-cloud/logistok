import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './SettingsHub.module.css';
import { getSettingsCards } from '@/config/settings.routes';
import { usePermissions } from '@/hooks/usePermissions';
import {
    Building2,
    Users,
    Shield,
    Store,
    CreditCard,
    User,
    ChevronRight,
    LucideIcon,
} from 'lucide-react';

// Icon map for settings
const iconMap: Record<string, LucideIcon> = {
    'building': Building2,
    'users': Users,
    'shield': Shield,
    'store': Store,
    'credit-card': CreditCard,
    'user': User,
};

type SettingsCardProps = {
    icon: string;
    label: string;
    description: string;
    onClick: () => void;
};

const SettingsCard: React.FC<SettingsCardProps> = ({ 
    icon, 
    label, 
    description, 
    onClick 
}) => {
    const IconComponent = iconMap[icon];

    return (
        <button className={styles.card} onClick={onClick}>
            <div className={styles.cardIcon}>
                {IconComponent && <IconComponent size={24} strokeWidth={1.5} />}
            </div>
            <div className={styles.cardContent}>
                <h3 className={styles.cardLabel}>{label}</h3>
                <p className={styles.cardDescription}>{description}</p>
            </div>
            <ChevronRight className={styles.cardArrow} size={20} />
        </button>
    );
};

export const SettingsHub: React.FC = () => {
    const navigate = useNavigate();
    const { can, isOwner } = usePermissions();

    const cards = getSettingsCards(can, isOwner);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Ρυθμίσεις</h1>
                <p className={styles.subtitle}>
                    {isOwner ? 'Διαχειριστείτε τον λογαριασμό σας, την εταιρεία και τη συνδρομή σας' : 'Διαχειριστείτε τον λογαριασμό σας'}
                </p>
            </div>

            <div className={styles.grid}>
                {cards.map((card) => (
                    <SettingsCard
                        key={card.key}
                        icon={card.icon}
                        label={card.label}
                        description={card.description}
                        onClick={() => navigate(card.path)}
                    />
                ))}
            </div>
        </div>
    );
};

export default SettingsHub;