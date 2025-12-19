import React from 'react';
import styles from './AppLayout.module.css';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';

type AppLayoutProps = {
  children?: React.ReactNode;
  topbarVariant?: 'dashboard' | 'select-company';
  topbarBreadcrumb?: string[];
  topbarTitle?: string;
  onLogout?: () => void;
  companyName?: string;
  planName?: string;
  stores?: Array<{ id: string; name: string; address?: string }>;
  selectedStoreId?: string;
  onStoreChange?: (storeId: string) => void;
  showSidebar?: boolean;
};

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  topbarVariant = 'dashboard', // dashboard | select-company
  topbarBreadcrumb = ['Logistok', 'Πίνακας Ελέγχου'],
  topbarTitle = 'Πίνακας Ελέγχου',
  onLogout,
  companyName,
  planName,
  stores,
  selectedStoreId,
  onStoreChange,
  showSidebar = true,
}) => {
  return (
    <div className={styles.app}>
      {showSidebar && (
        <Sidebar
          companyName={companyName}
          planName={planName}
          stores={stores}
          selectedStoreId={selectedStoreId}
          onStoreChange={onStoreChange}
        />
      )}
      <div className={styles.shell}>
        <Topbar
          variant={topbarVariant}
          breadcrumb={topbarBreadcrumb}
          title={topbarTitle}
          onLogout={onLogout}
        />
        <main className={styles.main}>
          {children ?? (
            <div className={styles.placeholder}>
              <h1>Ενημέρωση Προγραμμάτων</h1>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default AppLayout;

/* 
 * Usage Examples:
 * 
 * // Dashboard page
 * <AppLayout 
 *   topbarBreadcrumb={['Logistok', 'Dashboard']}
 *   topbarTitle="Dashboard"
 *   companyName="Logistok"
 *   planName="Basic Plan"
 * >
 *   <DashboardContent />
 * </AppLayout>
 * 
 * // Analytics page
 * <AppLayout 
 *   topbarBreadcrumb={['Logistok', 'Analytics']}
 *   topbarTitle="Analytics Reports"
 *   companyName="Logistok"
 *   planName="Pro Plan"
 * >
 *   <AnalyticsContent />
 * </AppLayout>
 * 
 * // Update Plans page
 * <AppLayout 
 *   topbarBreadcrumb={['Logistok', 'Update Plans']}
 *   topbarTitle="Update Plans"
 *   companyName="Logistok"
 *   planName="Basic Plan"
 * >
 *   <PlansContent />
 * </AppLayout>
 * 
 * // Select Company page (no sidebar, logout only)
 * <AppLayout 
 *   topbarVariant="select-company"
 *   showSidebar={false}
 *   onLogout={() => handleLogout()}
 * >
 *   <CompanySelector />
 * </AppLayout>
 */
