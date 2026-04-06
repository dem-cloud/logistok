import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Topbar.module.css';
import { Notification } from '@/contexts/NotificationsContext';
import { 
    Search, 
    Bell, 
    ChevronRight,
    Info,
    AlertTriangle,
    CheckCircle,
    XCircle,
    X,
} from 'lucide-react';


type TopbarProps = {
    breadcrumb?: string[];
    title?: string;
    notifications?: Notification[];
    onMarkAsRead?: (id: string) => void;
    onMarkAllAsRead?: () => void;
    onClearNotification?: (id: string) => void;
    // Toast notifications
    toastNotification?: Notification | null;
    onDismissToast?: () => void;
};

// ============================================
// NOTIFICATION ICON MAP
// ============================================
const notificationIconMap = {
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
// TOAST NOTIFICATION COMPONENT
// ============================================
const ToastNotification: React.FC<{
    notification: Notification;
    onDismiss: () => void;
    onClick?: () => void;
}> = ({ notification, onDismiss, onClick }) => {
    const IconComponent = notificationIconMap[notification.type];

    useEffect(() => {
        const timer = setTimeout(() => {
            onDismiss();
        }, 5000); // Auto dismiss after 5 seconds

        return () => clearTimeout(timer);
    }, [onDismiss]);

    return (
        <div 
            className={`${styles.toast} ${styles[`toast_${notification.type}`]}`}
            onClick={onClick}
        >
            <div className={`${styles.toastIcon} ${styles[`toastIcon_${notification.type}`]}`}>
                <IconComponent size={16} strokeWidth={2} />
            </div>
            <div className={styles.toastContent}>
                <div className={styles.toastTitle}>{notification.title}</div>
                <div className={styles.toastMessage}>{notification.message}</div>
            </div>
            <button 
                className={styles.toastClose}
                onClick={(e) => {
                    e.stopPropagation();
                    onDismiss();
                }}
            >
                <X size={14} strokeWidth={2} />
            </button>
        </div>
    );
};

// ============================================
// NOTIFICATION ITEM COMPONENT
// ============================================
const NotificationItem: React.FC<{
    notification: Notification;
    onMarkAsRead?: (id: string) => void;
    onClear?: (id: string) => void;
    onClick?: () => void;
}> = ({ notification, onMarkAsRead, onClear, onClick }) => {
    const IconComponent = notificationIconMap[notification.type];

    const handleClick = () => {
        if (!notification.read && onMarkAsRead) {
            onMarkAsRead(notification.id);
        }
        onClick?.();
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onClear?.(notification.id);
    };

    return (
        <div 
            className={`${styles.notificationItem} ${!notification.read ? styles.unread : ''}`}
            onClick={handleClick}
        >
            <div className={`${styles.notificationIcon} ${styles[`icon_${notification.type}`]}`}>
                <IconComponent size={14} strokeWidth={2} />
            </div>
            <div className={styles.notificationContent}>
                <div className={styles.notificationTitle}>{notification.title}</div>
                <div className={styles.notificationMessage}>{notification.message}</div>
                <div className={styles.notificationTime}>
                    {getTimeAgo(notification.timestamp)}
                </div>
            </div>
            {onClear && (
                <button 
                    className={styles.notificationClear}
                    onClick={handleClear}
                    aria-label="Διαγραφή"
                >
                    <X size={14} strokeWidth={2} />
                </button>
            )}
        </div>
    );
};

// ============================================
// NOTIFICATIONS POPUP COMPONENT
// ============================================
const NotificationsPopup: React.FC<{
    notifications: Notification[];
    onMarkAsRead?: (id: string) => void;
    onMarkAllAsRead?: () => void;
    onClearNotification?: (id: string) => void;
    onClose: () => void;
    onViewAll: () => void;
    triggerRef: React.RefObject<HTMLElement | null>;
}> = ({ 
    notifications, 
    onMarkAsRead, 
    onMarkAllAsRead, 
    onClearNotification,
    onClose, 
    onViewAll,
    triggerRef,
}) => {
    const popupRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                popupRef.current && 
                !popupRef.current.contains(target) && 
                triggerRef.current && 
                !triggerRef.current.contains(target)
            ) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose, triggerRef]);

    const unreadCount = notifications.filter(n => !n.read).length;

    const handleNotificationClick = (notification: Notification) => {
        if (notification.link) {
            navigate(notification.link);
            onClose();
        }
    };

    return (
        <div className={styles.notificationsPopup} ref={popupRef}>
            {/* Header */}
            <div className={styles.popupHeader}>
                <h3 className={styles.popupTitle}>
                    Ειδοποιήσεις
                    {unreadCount > 0 && (
                        <span className={styles.unreadBadge}>{unreadCount}</span>
                    )}
                </h3>
                {unreadCount > 0 && onMarkAllAsRead && (
                    <button 
                        className={styles.markAllRead}
                        onClick={onMarkAllAsRead}
                    >
                        Επισήμανση όλων ως αναγνωσμένα
                    </button>
                )}
            </div>

            {/* Notifications List */}
            <div className={styles.notificationsList}>
                {notifications.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Bell size={32} strokeWidth={1.5} />
                        <p>Δεν υπάρχουν ειδοποιήσεις</p>
                    </div>
                ) : (
                    notifications.slice(0, 5).map((notification) => (
                        <NotificationItem
                            key={notification.id}
                            notification={notification}
                            onMarkAsRead={onMarkAsRead}
                            onClear={onClearNotification}
                            onClick={() => handleNotificationClick(notification)}
                        />
                    ))
                )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
                <div className={styles.popupFooter}>
                    <button 
                        className={styles.viewAllButton}
                        onClick={() => {
                            onViewAll();
                            onClose();
                        }}
                    >
                        Προβολή όλων
                    </button>
                </div>
            )}
        </div>
    );
};

// ============================================
// MAIN TOPBAR COMPONENT
// ============================================
export const Topbar: React.FC<TopbarProps> = ({
    breadcrumb,
    title,
    notifications = [],
    onMarkAsRead,
    onMarkAllAsRead,
    onClearNotification,
    toastNotification,
    onDismissToast,
}) => {
    const navigate = useNavigate();
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    const bellButtonRef = useRef<HTMLButtonElement>(null);

    const unreadCount = notifications.filter(n => !n.read).length;

    const handleToastClick = (notification: Notification) => {
        if (notification.link) {
            navigate(notification.link);
        }
        onDismissToast?.();
    };

    return (
        <>
            <header className={styles.topbar}>
                <div className={styles.left}>
                    {breadcrumb && breadcrumb.length > 0 && (
                        <div className={styles.breadcrumb}>
                            {breadcrumb.map((crumb, idx) => (
                                <React.Fragment key={idx}>
                                    <span
                                        className={
                                            idx === breadcrumb.length - 1
                                                ? styles.crumbMuted
                                                : styles.crumb
                                        }
                                    >
                                        {crumb}
                                    </span>
                                    {idx < breadcrumb.length - 1 && (
                                        <ChevronRight 
                                            className={styles.chevron} 
                                            size={14} 
                                            strokeWidth={2.5}
                                        />
                                    )}
                                </React.Fragment>
                            ))}
                        </div>
                    )}
                    {title && <h2 className={styles.title}>{title}</h2>}
                </div>

                <div className={styles.actions}>
                    <div className={styles.search}>
                        <Search className={styles.searchIcon} size={16} strokeWidth={2} />
                        <input placeholder="Αναζήτηση" />
                    </div>

                    <div className={styles.notificationsWrapper}>
                        <button 
                            ref={bellButtonRef}
                            className={`${styles.iconButton} ${isNotificationsOpen ? styles.iconButtonActive : ''}`}
                            aria-label="Ειδοποιήσεις"
                            onClick={() => setIsNotificationsOpen(prev => !prev)}
                        >
                            <Bell size={18} strokeWidth={2} />
                            {unreadCount > 0 && (
                                <span className={styles.notificationDot} />
                            )}
                        </button>

                        {isNotificationsOpen && (
                            <NotificationsPopup
                                notifications={notifications}
                                onMarkAsRead={onMarkAsRead}
                                onMarkAllAsRead={onMarkAllAsRead}
                                onClearNotification={onClearNotification}
                                onClose={() => setIsNotificationsOpen(false)}
                                onViewAll={() => navigate('/notifications')}
                                triggerRef={bellButtonRef}
                            />
                        )}
                    </div>
                </div>
            </header>

            {/* Toast Notification */}
            {toastNotification && onDismissToast && (
                <div className={styles.toastContainer}>
                    <ToastNotification
                        notification={toastNotification}
                        onDismiss={onDismissToast}
                        onClick={() => handleToastClick(toastNotification)}
                    />
                </div>
            )}
        </>
    );
};

export default Topbar;