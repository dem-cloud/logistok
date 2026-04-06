import React from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import styles from './SettingsPageLayout.module.css';
import { getSettingsCardByPath } from '@/config/settings.routes';
import { usePermissions } from '@/hooks/usePermissions';
import { ArrowLeft } from 'lucide-react';

export const SettingsPageLayout: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { can, isOwner } = usePermissions();

    const cardConfig = getSettingsCardByPath(location.pathname);

    if (!cardConfig) {
        return null;
    }

    const { label, tabs } = cardConfig;

    const hasTabPermission = (tab: { permission?: string }) => {
        if (!tab.permission) return true;
        return isOwner || can(tab.permission);
    };

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                <button
                    className={styles.backButton}
                    onClick={() => navigate('/settings')}
                >
                    <ArrowLeft size={18} />
                    <span>Ρυθμίσεις</span>
                </button>
                <h1 className={styles.title}>{label}</h1>
            </div>

            {/* Tabs */}
            {tabs && tabs.length > 1 && (
                <div className={styles.tabs}>
                    {tabs.map((tab) => {
                        const enabled = hasTabPermission(tab);
                        return (
                            <button
                                key={tab.key}
                                className={`${styles.tab} ${
                                    location.pathname === tab.path ? styles.tabActive : ''
                                } ${!enabled ? styles.tabDisabled : ''}`}
                                onClick={() => enabled && navigate(tab.path)}
                                disabled={!enabled}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Content */}
            <div className={styles.content}>
                <Outlet />
            </div>
        </div>
    );
};

export default SettingsPageLayout;