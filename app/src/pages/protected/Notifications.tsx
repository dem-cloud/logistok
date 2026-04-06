import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Notifications.module.css';
import { useNotifications, Notification, NotificationType } from '@/contexts/NotificationsContext';

import {
    Bell,
    Info,
    AlertTriangle,
    CheckCircle,
    XCircle,
    X,
    Check,
    Filter,
} from 'lucide-react';

// ============================================
// NOTIFICATION ICON MAP
// ============================================
const notificationIconMap: Record<NotificationType, typeof Info> = {
    info: Info,
    warning: AlertTriangle,
    success: CheckCircle,
    error: XCircle,
};

// ============================================
// TIME AGO HELPER
// ============================================
const getTimeAgo = (date: Date): string => {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
        return 'Μόλις τώρα';
    }

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
        return `${diffInMinutes} λεπτ${diffInMinutes === 1 ? 'ό' : 'ά'} πριν`;
    }

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
        return `${diffInHours} ώρ${diffInHours === 1 ? 'α' : 'ες'} πριν`;
    }

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) {
        return `${diffInDays} ημέρ${diffInDays === 1 ? 'α' : 'ες'} πριν`;
    }

    return date.toLocaleDateString('el-GR');
};

// ============================================
// FILTER TYPE
// ============================================
type FilterType = 'all' | 'unread' | NotificationType;

// ============================================
// NOTIFICATION CARD COMPONENT
// ============================================
const NotificationCard: React.FC<{
    notification: Notification;
    onMarkAsRead: (id: string) => void;
    onClear: (id: string) => void;
    onClick: (notification: Notification) => void;
}> = ({ notification, onMarkAsRead, onClear, onClick }) => {
    const IconComponent = notificationIconMap[notification.type];

    const handleMarkAsRead = (e: React.MouseEvent) => {
        e.stopPropagation();
        onMarkAsRead(notification.id);
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onClear(notification.id);
    };

    return (
        <div 
            className={`${styles.card} ${!notification.read ? styles.cardUnread : ''}`}
            onClick={() => onClick(notification)}
        >
            <div className={styles.avatarWrapper}>
                <div className={`${styles.avatar} ${styles[`avatar_${notification.type}`]}`}>
                    <IconComponent size={18} strokeWidth={2} />
                </div>
                {!notification.read && <div className={styles.unreadIndicator} />}
            </div>

            <div className={styles.cardBody}>
                <div className={styles.cardTop}>
                    <h3 className={styles.cardTitle}>{notification.title}</h3>
                    <span className={styles.cardTime}>{getTimeAgo(notification.timestamp)}</span>
                </div>
                <p className={styles.cardMessage}>{notification.message}</p>
            </div>

            <div className={styles.cardActions}>
                {!notification.read && (
                    <button 
                        className={styles.actionButton}
                        onClick={handleMarkAsRead}
                        title="Σήμανση ως αναγνωσμένο"
                    >
                        <Check size={16} strokeWidth={2} />
                    </button>
                )}
                <button 
                    className={`${styles.actionButton} ${styles.actionButtonDanger}`}
                    onClick={handleClear}
                    title="Διαγραφή"
                >
                    <X size={16} strokeWidth={2} />
                </button>
            </div>
        </div>
    );
};

// ============================================
// MAIN NOTIFICATIONS PAGE
// ============================================
export const Notifications: React.FC = () => {
    const navigate = useNavigate();
    const { 
        notifications, 
        unreadCount, 
        markAsRead, 
        markAllAsRead, 
        clearNotification 
    } = useNotifications();
    
    const [filter, setFilter] = useState<FilterType>('all');

    // Filter notifications
    const filteredNotifications = notifications.filter(n => {
        if (filter === 'all') return true;
        if (filter === 'unread') return !n.read;
        return n.type === filter;
    });

    const handleNotificationClick = (notification: Notification) => {
        // Always mark as read when clicking
        if (!notification.read) {
            markAsRead(notification.id);
        }
        // Navigate if link exists
        if (notification.link) {
            navigate(notification.link);
        }
    };

    const filterOptions: { value: FilterType; label: string }[] = [
        { value: 'all', label: 'Όλες' },
        { value: 'unread', label: 'Μη αναγνωσμένες' },
        { value: 'info', label: 'Πληροφορίες' },
        { value: 'warning', label: 'Προειδοποιήσεις' },
        { value: 'success', label: 'Επιτυχία' },
        { value: 'error', label: 'Σφάλματα' },
    ];

    return (
        <div className={styles.wrapper}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.titleWrapper}>
                    <p className={styles.eyebrow}>Κέντρο Ειδοποιήσεων</p>
                    <h1 className={styles.title}>
                        Ειδοποιήσεις
                        {unreadCount > 0 && (
                            <span className={styles.titleBadge}>{unreadCount} νέες</span>
                        )}
                    </h1>
                </div>

                <div className={styles.headerActions}>
                    {unreadCount > 0 && (
                        <button 
                            className={styles.markAllLink}
                            onClick={markAllAsRead}
                        >
                            Επισήμανση όλων ως αναγνωσμένα
                        </button>
                    )}
                </div>
            </div>

            {/* Filters */}
            <div className={styles.filters}>
                <Filter size={16} strokeWidth={2} className={styles.filterIcon} />
                {filterOptions.map(option => (
                    <button
                        key={option.value}
                        className={`${styles.filterButton} ${filter === option.value ? styles.filterButtonActive : ''}`}
                        onClick={() => setFilter(option.value)}
                    >
                        {option.label}
                        {option.value === 'unread' && unreadCount > 0 && (
                            <span className={styles.filterBadge}>{unreadCount}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Notifications List */}
            <div className={styles.list}>
                {filteredNotifications.length === 0 ? (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>
                            <Bell size={48} strokeWidth={1.5} />
                        </div>
                        <h3 className={styles.emptyTitle}>
                            {filter === 'all' 
                                ? 'Δεν υπάρχουν ειδοποιήσεις'
                                : 'Δεν βρέθηκαν ειδοποιήσεις'
                            }
                        </h3>
                        <p className={styles.emptyMessage}>
                            {filter === 'all'
                                ? 'Οι νέες ειδοποιήσεις θα εμφανιστούν εδώ'
                                : 'Δοκιμάστε να αλλάξετε τα φίλτρα'
                            }
                        </p>
                    </div>
                ) : (
                    filteredNotifications.map(notification => (
                        <NotificationCard
                            key={notification.id}
                            notification={notification}
                            onMarkAsRead={markAsRead}
                            onClear={clearNotification}
                            onClick={handleNotificationClick}
                        />
                    ))
                )}
            </div>
        </div>
    );
};

export default Notifications;