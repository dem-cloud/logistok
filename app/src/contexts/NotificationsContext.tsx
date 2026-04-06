import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';

// This is an example implementation
// In production, you would fetch from API and use WebSockets for real-time updates

// ============================================
// TYPES
// ============================================
export type NotificationType = 'info' | 'warning' | 'success' | 'error';

export type Notification = {
    id: string;
    storeId: string;  // Κάθε notification ανήκει σε store
    type: NotificationType;
    title: string;
    message: string;
    timestamp: Date;
    read: boolean;
    link?: string;
};

type NotificationsContextType = {
    notifications: Notification[];
    unreadCount: number;
    markAsRead: (id: string) => void;
    markAllAsRead: () => void;
    clearNotification: (id: string) => void;
    addNotification: (notification: Omit<Notification, 'id' | 'storeId' | 'timestamp' | 'read'>) => void;
    toastNotification: Notification | null;
    dismissToast: () => void;
};

// ============================================
// CONTEXT
// ============================================
const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

// ============================================
// MOCK DATA GENERATOR
// ============================================
const generateMockNotifications = (storeId: string): Notification[] => [
    {
        id: `${storeId}-1`,
        storeId,
        type: 'info',
        title: 'Νέα παραγγελία',
        message: 'Λάβατε νέα παραγγελία #1234 από τον πελάτη Γιώργος Παπαδόπουλος',
        timestamp: new Date(Date.now() - 5 * 60 * 1000),
        read: false,
        link: '/sales',
    },
    {
        id: `${storeId}-2`,
        storeId,
        type: 'warning',
        title: 'Χαμηλό απόθεμα',
        message: 'Το προϊόν "iPhone 15 Pro" έχει απόθεμα κάτω από 5 τεμάχια',
        timestamp: new Date(Date.now() - 30 * 60 * 1000),
        read: false,
        link: '/inventory',
    },
    {
        id: `${storeId}-3`,
        storeId,
        type: 'success',
        title: 'Πληρωμή ολοκληρώθηκε',
        message: 'Η πληρωμή για το τιμολόγιο #5678 ολοκληρώθηκε επιτυχώς',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
        read: true,
        link: '/invoices',
    },
    {
        id: `${storeId}-4`,
        storeId,
        type: 'error',
        title: 'Αποτυχία συγχρονισμού',
        message: 'Ο συγχρονισμός με το WooCommerce απέτυχε. Παρακαλώ ελέγξτε τις ρυθμίσεις.',
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
        read: true,
        link: '/marketplace',
    },
];

// ============================================
// PROVIDER
// ============================================
export const NotificationsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { activeStore } = useAuth();
    
    // Store all notifications (across all stores)
    const [allNotifications, setAllNotifications] = useState<Notification[]>([]);
    const [toastNotification, setToastNotification] = useState<Notification | null>(null);
    const [loadedStores, setLoadedStores] = useState<Set<string>>(new Set());

    // Filter notifications for current store
    const notifications = activeStore 
        ? allNotifications.filter(n => n.storeId === activeStore.id)
        : [];

    const unreadCount = notifications.filter(n => !n.read).length;

    // Load notifications when store changes
    useEffect(() => {
        if (!activeStore) return;

        // Check if we already loaded this store's notifications
        if (loadedStores.has(activeStore.id)) return;

        // TODO: Replace with API call
        // const fetchNotifications = async () => {
        //     const response = await api.get(`/stores/${activeStore.id}/notifications`);
        //     setAllNotifications(prev => [...prev, ...response.data]);
        // };

        // Mock: Generate notifications for this store
        const storeNotifications = generateMockNotifications(activeStore.id);
        setAllNotifications(prev => [...prev, ...storeNotifications]);
        setLoadedStores(prev => new Set(prev).add(activeStore.id));
    }, [activeStore, loadedStores]);

    const markAsRead = useCallback((id: string) => {
        setAllNotifications(prev =>
            prev.map(n => n.id === id ? { ...n, read: true } : n)
        );
        // TODO: API call - PATCH /notifications/:id { read: true }
    }, []);

    const markAllAsRead = useCallback(() => {
        if (!activeStore) return;
        
        setAllNotifications(prev =>
            prev.map(n => n.storeId === activeStore.id ? { ...n, read: true } : n)
        );
        // TODO: API call - PATCH /stores/:storeId/notifications/mark-all-read
    }, [activeStore]);

    const clearNotification = useCallback((id: string) => {
        setAllNotifications(prev => prev.filter(n => n.id !== id));
        // TODO: API call - DELETE /notifications/:id
    }, []);

    const addNotification = useCallback((
        notification: Omit<Notification, 'id' | 'storeId' | 'timestamp' | 'read'>
    ) => {
        if (!activeStore) return;

        const newNotification: Notification = {
            ...notification,
            id: Date.now().toString(),
            storeId: activeStore.id,
            timestamp: new Date(),
            read: false,
        };

        setAllNotifications(prev => [newNotification, ...prev]);
        setToastNotification(newNotification);
    }, [activeStore]);

    const dismissToast = useCallback(() => {
        setToastNotification(null);
    }, []);

    // Example: Simulate receiving a push notification after 10 seconds (for demo)
    // useEffect(() => {
    //     const timer = setTimeout(() => {
    //         addNotification({
    //             type: 'info',
    //             title: 'Νέο μήνυμα',
    //             message: 'Ο πελάτης Μαρία Κ. σας έστειλε μήνυμα',
    //             link: '/messages',
    //         });
    //     }, 10000);
    //     return () => clearTimeout(timer);
    // }, [addNotification]);

    // TODO: Setup WebSocket or polling for real-time notifications
    // useEffect(() => {
    //     const ws = new WebSocket('wss://api.example.com/notifications');
    //     ws.onmessage = (event) => {
    //         const notification = JSON.parse(event.data);
    //         addNotification(notification);
    //     };
    //     return () => ws.close();
    // }, [addNotification]);

    return (
        <NotificationsContext.Provider
            value={{
                notifications,
                unreadCount,
                markAsRead,
                markAllAsRead,
                clearNotification,
                addNotification,
                toastNotification,
                dismissToast,
            }}
        >
            {children}
        </NotificationsContext.Provider>
    );
};

// ============================================
// HOOK
// ============================================
export const useNotifications = (): NotificationsContextType => {
    const context = useContext(NotificationsContext);
    if (!context) {
        throw new Error('useNotifications must be used within a NotificationsProvider');
    }
    return context;
};

export default NotificationsContext;