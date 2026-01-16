import React, { useState } from 'react';
import styles from './Sidebar.module.css';
import { useNavigate } from 'react-router-dom';
import { StoreRole } from '@/types/auth.types';

export type NavItem = {
    label: string;
    icon: string;
    path: string;
    active?: boolean;
    badge?: number;
    notification?: boolean;
    pluginKey?: string;
};

type SidebarProps = {
    // Company & Plan
    companyName?: string;
    planName?: string;
    
    // Store Selector
    stores: StoreRole[];
    selectedStoreId?: string;
    onStoreChange: (storeId: string) => void;
    
    // Menu Sections
    quickMenu: NavItem[];
    coreOperations: NavItem[];
    financial: NavItem[];
    pluginMenuItems: NavItem[];
    management: NavItem[];
    system: NavItem[];
    
    // User
    userInitials?: string;
};

// ============================================
// MENU ITEM COMPONENT
// ============================================
const MenuItem: React.FC<{ 
    item: NavItem; 
    onClick: (item: NavItem) => void;
}> = ({ item, onClick }) => (
    <li
        className={`${styles.item} ${item.active ? styles.active : ''} ${
            item.notification ? styles.hasNotification : ''
        }`}
        onClick={() => onClick(item)}
    >
        <span className={`${styles.icon} ${styles[item.icon]}`} />
        <span className={styles.label}>{item.label}</span>
        {item.badge ? <span className={styles.badge}>{item.badge}</span> : null}
        {item.notification && !item.badge ? (
            <span className={styles.notificationDot} />
        ) : null}
    </li>
);

// ============================================
// SECTION COMPONENT
// ============================================
const Section: React.FC<{ 
    title?: string; 
    items: NavItem[];
    onItemClick: (item: NavItem) => void;
}> = ({ title, items, onItemClick }) => {
    if (items.length === 0) return null;

    return (
        <div className={styles.section}>
            {title && <p className={styles.sectionTitle}>{title}</p>}
            <ul className={styles.list}>
                {items.map((item) => (
                    <MenuItem key={item.path} item={item} onClick={onItemClick} />
                ))}
            </ul>
        </div>
    );
};

// ============================================
// MAIN SIDEBAR COMPONENT
// ============================================
export const Sidebar: React.FC<SidebarProps> = ({
    companyName = 'Logistok',
    planName = 'Βασικό Πρόγραμμα',
    stores = [],
    selectedStoreId,
    onStoreChange,
    quickMenu,
    coreOperations,
    financial,
    pluginMenuItems,
    management,
    system,
    userInitials = 'L',
}) => {
    const navigate = useNavigate();
    const [isStoreDropdownOpen, setIsStoreDropdownOpen] = useState(false);
    const selectedStore = stores.find((s) => s.id === selectedStoreId) || stores[0];

    const handleItemClick = (item: NavItem) => {
        navigate(item.path);
    };

    return (
        <aside className={styles.sidebar}>
            {/* ============================================ */}
            {/* BRAND */}
            {/* ============================================ */}
            <div className={styles.brand}>
                <span className={styles.brandIcon}>L</span>
                <div className={styles.brandCopy}>
                    <div className={styles.brandName}>Logistok</div>
                </div>
            </div>

            {/* ============================================ */}
            {/* STORE SELECTOR */}
            {/* ============================================ */}
            {stores.length > 0 && (
                <div className={styles.storeSelector}>
                    <button
                        className={styles.storeButton}
                        onClick={() => setIsStoreDropdownOpen(!isStoreDropdownOpen)}
                    >
                        <div className={styles.storeInfo}>
                            <div className={styles.storeName}>
                                {selectedStore?.name || 'Επιλέξτε Κατάστημα'}
                            </div>
                            {selectedStore?.address && (
                                <div className={styles.storeAddress}>
                                    {selectedStore.address}
                                </div>
                            )}
                        </div>
                        <span 
                            className={`${styles.chevron} ${
                                isStoreDropdownOpen ? styles.chevronOpen : ''
                            }`} 
                        />
                    </button>
                    
                    {isStoreDropdownOpen && (
                        <div className={styles.storeDropdown}>
                            {stores.map((store) => (
                                <button
                                    key={store.id}
                                    className={`${styles.storeOption} ${
                                        selectedStoreId === store.id ? styles.storeOptionActive : ''
                                    }`}
                                    onClick={() => {
                                        onStoreChange?.(store.id);
                                        setIsStoreDropdownOpen(false);
                                    }}
                                >
                                    <div className={styles.storeOptionInfo}>
                                        <div className={styles.storeOptionName}>
                                            {store.name}
                                        </div>
                                        {store.address && (
                                            <div className={styles.storeOptionAddress}>
                                                {store.address}
                                            </div>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ============================================ */}
            {/* QUICK MENU (Fixed Top) */}
            {/* ============================================ */}
            <div className={styles.fixedTop}>
                <Section 
                    title="Γρήγορο Μενού" 
                    items={quickMenu} 
                    onItemClick={handleItemClick} 
                />
            </div>

            {/* ============================================ */}
            {/* SCROLLABLE SECTION */}
            {/* ============================================ */}
            <div className={styles.scrollableSection}>
                <div className={styles.scrollableSectionContent}>
                    {/* Core Operations */}
                    {coreOperations.length > 0 && (
                        <>
                            <div className={styles.scrollableSectionHeader}>
                                <p className={styles.sectionTitle}>Βασικές Λειτουργίες</p>
                            </div>
                            <ul className={styles.list}>
                                {coreOperations.map((item) => (
                                    <MenuItem 
                                        key={item.path} 
                                        item={item} 
                                        onClick={handleItemClick} 
                                    />
                                ))}
                            </ul>
                        </>
                    )}

                    {/* Financial */}
                    {financial.length > 0 && (
                        <>
                            <p className={styles.sectionTitle} style={{ marginTop: '24px' }}>
                                Οικονομικά
                            </p>
                            <ul className={styles.list}>
                                {financial.map((item) => (
                                    <MenuItem 
                                        key={item.path} 
                                        item={item} 
                                        onClick={handleItemClick} 
                                    />
                                ))}
                            </ul>
                        </>
                    )}

                    {/* Plugin Items */}
                    {pluginMenuItems.length > 0 && (
                        <>
                            <p className={styles.sectionTitle} style={{ marginTop: '24px' }}>
                                Plugins
                            </p>
                            <ul className={styles.list}>
                                {pluginMenuItems.map((item) => (
                                    <MenuItem 
                                        key={item.path} 
                                        item={item} 
                                        onClick={handleItemClick} 
                                    />
                                ))}
                            </ul>
                        </>
                    )}

                    {/* Management (Conditional) */}
                    {management.length > 0 && (
                        <>
                            <p className={styles.sectionTitle} style={{ marginTop: '24px' }}>
                                Διαχείριση
                            </p>
                            <ul className={styles.list}>
                                {management.map((item) => (
                                    <MenuItem 
                                        key={item.path} 
                                        item={item} 
                                        onClick={handleItemClick} 
                                    />
                                ))}
                            </ul>
                        </>
                    )}
                </div>
            </div>

            {/* ============================================ */}
            {/* SYSTEM (Fixed Bottom) */}
            {/* ============================================ */}
            <div className={styles.fixedBottom}>
                <Section 
                    title="Σύστημα" 
                    items={system} 
                    onItemClick={handleItemClick} 
                />
            </div>

            {/* ============================================ */}
            {/* ACCOUNT INFO */}
            {/* ============================================ */}
            <div className={styles.accountInfo}>
                <span className={styles.accountIcon}>
                    {userInitials}
                </span>
                <div className={styles.accountDetails}>
                    <div className={styles.accountName}>{companyName}</div>
                    <div className={styles.accountPlan}>{planName}</div>
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
