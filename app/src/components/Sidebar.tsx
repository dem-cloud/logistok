import React, { useState } from 'react';
import styles from './Sidebar.module.css';

const quickMenu: NavItem[] = [
  { label: 'Πίνακας Ελέγχου', icon: 'home', active: false },
  { label: 'Ειδοποιήσεις', icon: 'bell', active: false, badge: 8 },
  { label: 'Πρόγραμμα', icon: 'calendar', active: false },
];

const services: NavItem[] = [
  { label: 'Ανάλυση', icon: 'pulse', active: false },
  { label: 'Πορτοφόλι', icon: 'card', active: false },
  { label: 'Συναλλαγές', icon: 'transfer', active: false },
  { label: 'Επαφές', icon: 'user', active: false },
  { label: 'Τιμολόγια', icon: 'doc', active: false },
  { label: 'Λογαριασμός', icon: 'settings', active: false },
];

const others: NavItem[] = [
  { label: 'Αλλαγή Πλάνου', icon: 'flash', active: true },
  { label: 'Ρυθμίσεις', icon: 'gear', active: false },
  { label: 'Κέντρο Βοήθειας', icon: 'help', active: false },
];

// Demo stores data
const demoStores = [
  { id: '1', name: 'Κεντρικό Κατάστημα', address: 'Αθήνα' },
  { id: '2', name: 'Κατάστημα Θεσσαλονίκης', address: 'Θεσσαλονίκη' },
  { id: '3', name: 'Διαδικτυακό Κατάστημα', address: 'Διαδικτυακό' },
];

type NavItem = {
  label: string;
  icon: string;
  active?: boolean;
  badge?: number;
};

type SidebarProps = {
  companyName?: string;
  planName?: string;
  stores?: Array<{ id: string; name: string; address?: string }>;
  selectedStoreId?: string;
  onStoreChange?: (storeId: string) => void;
};

const Section: React.FC<{ title?: string; items: NavItem[] }> = ({
  title,
  items,
}) => (
  <div className={styles.section}>
    {title && <p className={styles.sectionTitle}>{title}</p>}
    <ul className={styles.list}>
      {items.map((item) => (
        <li
          key={item.label}
          className={`${styles.item} ${item.active ? styles.active : ''}`}
        >
          <span className={`${styles.icon} ${styles[item.icon]}`} />
          <span className={styles.label}>{item.label}</span>
          {item.badge ? <span className={styles.badge}>{item.badge}</span> : null}
        </li>
      ))}
    </ul>
  </div>
);

export const Sidebar: React.FC<SidebarProps> = ({
  companyName = 'Logistok',
  planName = 'Βασικό Πρόγραμμα',
  stores = demoStores,
  selectedStoreId,
  onStoreChange,
}) => {
  const [isStoreDropdownOpen, setIsStoreDropdownOpen] = useState(false);
  const selectedStore = stores.find((s) => s.id === selectedStoreId) || stores[0];

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.brandIcon}>L</span>
        <div className={styles.brandCopy}>
          <div className={styles.brandName}>Logistok</div>
        </div>
      </div>

      <div className={styles.storeSelector}>
        <button
          className={styles.storeButton}
          onClick={() => setIsStoreDropdownOpen(!isStoreDropdownOpen)}
        >
          <div className={styles.storeInfo}>
            <div className={styles.storeName}>{selectedStore.name}</div>
            {selectedStore.address && (
              <div className={styles.storeAddress}>{selectedStore.address}</div>
            )}
          </div>
          <span className={`${styles.chevron} ${isStoreDropdownOpen ? styles.chevronOpen : ''}`} />
        </button>
        {isStoreDropdownOpen && (
          <div className={styles.storeDropdown}>
            {stores.map((store) => (
              <button
                key={store.id}
                className={`${styles.storeOption} ${selectedStoreId === store.id ? styles.storeOptionActive : ''}`}
                onClick={() => {
                  onStoreChange?.(store.id);
                  setIsStoreDropdownOpen(false);
                }}
              >
                <div className={styles.storeOptionInfo}>
                  <div className={styles.storeOptionName}>{store.name}</div>
                  {store.address && (
                    <div className={styles.storeOptionAddress}>{store.address}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.fixedTop}>
        <Section title="Γρήγορο Μενού" items={quickMenu} />
      </div>

      <div className={styles.scrollableSection}>
        <div className={styles.scrollableSectionHeader}>
          <p className={styles.sectionTitle}>Υπηρεσίες</p>
        </div>
        <div className={styles.scrollableSectionContent}>
          <ul className={styles.list}>
            {services.map((item) => (
              <li
                key={item.label}
                className={`${styles.item} ${item.active ? styles.active : ''}`}
              >
                <span className={`${styles.icon} ${styles[item.icon]}`} />
                <span className={styles.label}>{item.label}</span>
                {item.badge ? <span className={styles.badge}>{item.badge}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={styles.fixedBottom}>
        <Section title="Άλλα" items={others} />
      </div>

      <div className={styles.accountInfo}>
        <span className={styles.accountIcon}>
          {companyName.charAt(0).toUpperCase()}
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

