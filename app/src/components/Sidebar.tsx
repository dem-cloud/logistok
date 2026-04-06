import React, { useState, useRef, useEffect } from 'react';
import styles from './Sidebar.module.css';
import { useNavigate } from 'react-router-dom';
import { StoreRole, User } from '@/types/auth.types';
import {
    Home,
    Bell,
    Calendar,
    ShoppingCart,
    Package,
    Box,
    Warehouse,
    Users,
    Truck,
    ArrowLeftRight,
    BarChart3,
    FileText,
    LayoutGrid,
    Settings,
    HelpCircle,
    UserPlus,
    LogOut,
    ChevronDown,
    LucideIcon,
    Building2,
    Puzzle,
    Receipt,
    Wallet,
} from 'lucide-react';

// ============================================
// ICON MAP
// ============================================
const iconMap: Record<string, LucideIcon> = {
    home: Home,
    bell: Bell,
    calendar: Calendar,
    cart: ShoppingCart,
    package: Package,
    box: Box,
    warehouse: Warehouse,
    users: Users,
    truck: Truck,
    transfer: ArrowLeftRight,
    chart: BarChart3,
    'file-text': FileText,
    grid: LayoutGrid,
    puzzle: Puzzle,
    settings: Settings,
    help: HelpCircle,
    receipt: Receipt,
    wallet: Wallet,
};

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
    selectedStore?: StoreRole | null;
    onStoreChange: (storeId: string) => void;
    
    // Menu Sections
    quickMenu: NavItem[];
    coreOperations: NavItem[];
    catalog: NavItem[];
    financial: NavItem[];
    pluginMenuItems: NavItem[];
    system: NavItem[];
    
    // User
    user?: User;
    showInviteUsers?: boolean;
    onLogout?: () => void;
    isOwner?: boolean;
    clearActiveCompany: () => void;
};

// ============================================
// MENU ITEM COMPONENT
// ============================================
const MenuItem: React.FC<{ 
    item: NavItem; 
    onClick: (item: NavItem) => void;
}> = ({ item, onClick }) => {
    const IconComponent = iconMap[item.icon];
    
    return (
        <li
            className={`${styles.item} ${item.active ? styles.active : ''} ${
                item.notification ? styles.hasNotification : ''
            }`}
            onClick={() => onClick(item)}
        >
            {IconComponent ? (
                <IconComponent className={styles.icon} size={18} strokeWidth={2} />
            ) : (
                <span className={styles.iconPlaceholder} />
            )}
            <span className={styles.label}>{item.label}</span>
            {item.badge ? <span className={styles.badge}>{item.badge}</span> : null}
            {item.notification && !item.badge ? (
                <span className={styles.notificationDot} />
            ) : null}
        </li>
    );
};

// ============================================
// SECTION COMPONENT
// ============================================
const Section: React.FC<{ 
    title?: string; 
    items: NavItem[];
    onItemClick: (item: NavItem) => void;
    className?: string;
}> = ({ title, items, onItemClick, className }) => {
    if (items.length === 0) return null;

    return (
        <div className={`${styles.section} ${className || ''}`}>
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
// ACCOUNT POPUP COMPONENT
// ============================================
const AccountPopup: React.FC<{
    user?: SidebarProps['user'];
    companyName?: string;
    userRole?: string;
    planName?: string;
    showInviteUsers?: boolean;
    onLogout?: () => void;
    onClose: () => void;
    triggerRef: React.RefObject<HTMLButtonElement | null>;
    isOwner?: boolean;
    clearActiveCompany: () => void;
}> = ({ user, companyName, planName, showInviteUsers, onLogout, onClose, triggerRef, isOwner, clearActiveCompany }) => {
    const navigate = useNavigate();
    const popupRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (popupRef.current && !popupRef.current.contains(target) && triggerRef.current && !triggerRef.current.contains(target)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose, triggerRef]);

    const displayName = user?.first_name && user?.last_name 
        ? `${user.first_name} ${user.last_name}`
        : user?.first_name || user?.email?.split('@')[0] || 'User';

    const initials = user?.first_name && user?.last_name
        ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase()
        : user?.email?.[0].toUpperCase() || 'U';

    const handleNavigate = (path: string) => {
        navigate(path);
        onClose();
    };

    const handleSwitchCompany = () => {
        clearActiveCompany();
        navigate('/select-company');
        onClose();
    };

    return (
        <div className={styles.accountPopup} ref={popupRef}>
            {/* User Info Header */}
            <div className={styles.popupHeader}>
                {user?.avatar_url ? (
                    <img 
                        src={user.avatar_url} 
                        alt={displayName}
                        className={styles.popupAvatar}
                    />
                ) : (
                    <div className={styles.popupAvatarFallback}>
                        {initials}
                    </div>
                )}
                <div className={styles.popupUserInfo}>
                    <div className={styles.popupName}>{displayName}</div>
                    {user?.email && (
                        <div className={styles.popupEmail}>{user.email}</div>
                    )}
                </div>
            </div>

            {/* Company User Role Plan */}
           <div className={styles.popupCompany}>
                <span>{companyName}</span>

                {isOwner && planName && (
                    <>
                        <span>•</span>
                        <span>{`${planName} Πλάνο`}</span>
                    </>
                )}
            </div>
           

            <div className={styles.popupDivider} />

            {/* Actions */}
            <div className={styles.popupActions}>
                {showInviteUsers && (
                    <button 
                        className={styles.popupAction}
                        onClick={() => handleNavigate('/settings/team/invites')}
                    >
                        <UserPlus size={16} strokeWidth={2} />
                        <span>Πρόσκληση χρηστών</span>
                    </button>
                )}
                <button 
                    className={styles.popupAction}
                    onClick={() => handleNavigate('/plugins')}
                >
                    <Puzzle size={16} strokeWidth={2} />
                    <span>Τα Plugins μου</span>
                </button>
                <button 
                    className={styles.popupAction}
                    onClick={handleSwitchCompany}
                >
                    <Building2 size={16} strokeWidth={2} />
                    <span>Αλλαγή Εταιρείας</span>
                </button>
                <button 
                    className={styles.popupAction}
                    onClick={() => handleNavigate('/settings')}
                >
                    <Settings size={16} strokeWidth={2} />
                    <span>Ρυθμίσεις</span>
                </button>
            </div>

            <div className={styles.popupDivider} />

            {/* Logout */}
            {onLogout && (
                <button 
                    className={`${styles.popupAction} ${styles.popupActionDanger}`}
                    onClick={() => {
                        onLogout();
                        onClose();
                    }}
                >
                    <LogOut size={16} strokeWidth={2} />
                    <span>Αποσύνδεση</span>
                </button>
            )}
        </div>
    );
};

// ============================================
// MAIN SIDEBAR COMPONENT
// ============================================
export const Sidebar: React.FC<SidebarProps> = ({
    companyName = "Χωρίς Όνομα",
    planName,
    stores = [],
    selectedStore: selectedStoreProp,
    onStoreChange,
    quickMenu,
    coreOperations,
    catalog = [],
    financial,
    pluginMenuItems,
    system,
    user,
    showInviteUsers,
    onLogout,
    isOwner,
    clearActiveCompany
}) => {
    const navigate = useNavigate();
    const [isStoreDropdownOpen, setIsStoreDropdownOpen] = useState(false);
    const [isAccountPopupOpen, setIsAccountPopupOpen] = useState(false);
    const selectedStore = selectedStoreProp || stores[0];

    const accountButtonRef = useRef<HTMLButtonElement>(null);
    const storeButtonRef = useRef<HTMLButtonElement>(null);
    const storeDropdownRef = useRef<HTMLDivElement>(null);

    // Click outside handler for store dropdown
    useEffect(() => {
        if (!isStoreDropdownOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                storeDropdownRef.current && 
                !storeDropdownRef.current.contains(target) && 
                storeButtonRef.current && 
                !storeButtonRef.current.contains(target)
            ) {
                setIsStoreDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isStoreDropdownOpen]);

    if (!selectedStore) {
        return null; // or loading state
    }

    const handleItemClick = (item: NavItem) => {
        navigate(item.path);
    };

    const userInitials = user?.first_name && user?.last_name
        ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase()
        : user?.email?.[0].toUpperCase() || 'U';

    const userDisplayName = user?.first_name && user?.last_name
        ? `${user.first_name} ${user.last_name}`
        : user?.email?.split('@')[0] || 'User';

    const handleStoreChange = async (storeId: string) => {
        setIsStoreDropdownOpen(false);
        if (storeId !== selectedStore?.id) {
            await onStoreChange(storeId);
            navigate('/');
        }
    };

    return (
        <aside className={styles.sidebar}>
            {/* ============================================ */}
            {/* FIXED TOP: Brand + Store Selector */}
            {/* ============================================ */}
            <div className={styles.fixedTop}>
                {/* Brand */}
                <div className={styles.brand}>
                    <span className={styles.brandIcon}>O</span>
                    <div className={styles.brandCopy}>
                        <div className={styles.brandName}>Olyntos ERP</div>
                    </div>
                </div>

                {/* Store Selector */}
                {stores.length > 0 && (
                    <div className={styles.storeSelector}>
                        <button
                            ref={storeButtonRef}
                            className={styles.storeButton}
                            onClick={() => setIsStoreDropdownOpen(!isStoreDropdownOpen)}
                        >
                            <div className={styles.storeInfo}>
                                <div className={styles.storeName}>
                                    {selectedStore?.name || 'Επιλέξτε Κατάστημα'}
                                </div>
                                <div className={styles.storeAddress}>
                                    {selectedStore.city ? selectedStore.city : 'Τοποθεσία'}
                                </div>
                            </div>
                            <ChevronDown 
                                className={`${styles.chevron} ${
                                    isStoreDropdownOpen ? styles.chevronOpen : ''
                                }`}
                                size={16}
                            />
                        </button>
                        
                        {isStoreDropdownOpen && (
                            <div className={styles.storeDropdown} ref={storeDropdownRef}>
                                {stores.map((store) => (
                                    <button
                                        key={store.id}
                                        className={`${styles.storeOption} ${
                                            selectedStore.id === store.id ? styles.storeOptionActive : ''
                                        }`}
                                        onClick={() => handleStoreChange(store.id)}
                                    >
                                        <div className={styles.storeOptionInfo}>
                                            <div className={styles.storeOptionName}>
                                                {store.name}
                                                {store.is_active === false && (
                                                    <span className={styles.storeReadOnlyBadge} title="Μόνο ανάγνωση">
                                                        (Μόνο ανάγνωση)
                                                    </span>
                                                )}
                                            </div>
                                            <div className={styles.storeOptionAddress}>
                                                {store.city ? store.city : 'Τοποθεσία'}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ============================================ */}
            {/* SCROLLABLE: All Menu Sections */}
            {/* ============================================ */}
            <div className={styles.scrollableSection}>
                <div className={styles.scrollableContent}>
                    {/* Quick Menu */}
                    <Section 
                        title="Γρήγορο Μενού" 
                        items={quickMenu} 
                        onItemClick={handleItemClick} 
                    />

                    {/* Core Operations */}
                    <Section 
                        title="Λειτουργίες" 
                        items={coreOperations} 
                        onItemClick={handleItemClick} 
                    />

                    {/* Catalog */}
                    <Section 
                        title="Κατάλογος" 
                        items={catalog} 
                        onItemClick={handleItemClick} 
                    />

                    {/* Financial */}
                    <Section 
                        title="Οικονομικά" 
                        items={financial} 
                        onItemClick={handleItemClick} 
                    />

                    {/* Plugin Items */}
                    <Section 
                        title="Plugins" 
                        items={pluginMenuItems} 
                        onItemClick={handleItemClick} 
                    />
                </div>
            </div>

            {/* ============================================ */}
            {/* FIXED BOTTOM: Support + Account */}
            {/* ============================================ */}
            <div className={styles.fixedBottom}>
                <Section 
                    title="Επεκτάσεις" 
                    items={system} 
                    onItemClick={handleItemClick} 
                />

                {/* Account Info */}
                <div className={styles.accountWrapper}>
                    <button 
                        ref={accountButtonRef}
                        className={styles.accountInfo}
                        onClick={() => setIsAccountPopupOpen(prev => !prev)}
                    >
                        {user?.avatar_url ? (
                            <img 
                                src={user.avatar_url} 
                                alt={companyName}
                                className={styles.accountAvatar}
                            />
                        ) : (
                            <span className={styles.accountIcon}>
                                {userInitials}
                            </span>
                        )}
                        <div className={styles.accountDetails}>
                            <div className={styles.accountName}>{userDisplayName}</div>
                            <div className={styles.accountRole}>
                                {selectedStore.role.name}
                            </div>
                        </div>
                        <ChevronDown 
                            className={`${styles.accountChevron} ${
                                isAccountPopupOpen ? styles.accountChevronOpen : ''
                            }`}
                            size={16}
                        />
                    </button>

                    {isAccountPopupOpen && (
                        <AccountPopup
                            user={user}
                            companyName={companyName}
                            userRole={selectedStore.role.name}
                            planName={planName}
                            showInviteUsers={showInviteUsers}
                            onLogout={onLogout}
                            onClose={() => setIsAccountPopupOpen(false)}
                            triggerRef={accountButtonRef}
                            isOwner={isOwner}
                            clearActiveCompany={clearActiveCompany}
                        />
                    )}
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;