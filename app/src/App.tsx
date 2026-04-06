import './App.css'
import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './routes/ProtectedRoute'
import RequirePermission from './routes/RequirePermission'
import Dashboard from './pages/protected/Dashboard'
import Auth from './pages/Auth'
import ResetPassword from './pages/ResetPassword'
import RequireLoggedOut from './routes/RequireLoggedOut'
import RequireOnboarding from './routes/RequireOnboarding'
import RequireFinishedOnboarding from './routes/RequireFinishedOnboarding'
import ProtectedCatchAll from './routes/ProtectedCatchAll'
import CompanySelector from './pages/protected/CompanySelector'
import InviteSetPassword from './pages/InviteSetPassword'
import RequireSelectCompany from './routes/RequireSelectCompany'
import LoadingSpinner from './components/LoadingSpinner'
import { useAuth } from './contexts/AuthContext'
import { OnboardingLayout } from './onboarding/OnboardingLayout'
import { PERMISSIONS } from './constants/permissions'

// Pages
import Notifications from './pages/protected/Notifications'
import Calendar from './pages/protected/Calendar'
import Sales from './pages/protected/Sales'
import Purchases from './pages/protected/Purchases'
import Products from './pages/protected/Products'
import Inventory from './pages/protected/Inventory'
import Customers from './pages/protected/Customers'
import Vendors from './pages/protected/Vendors'
import Transactions from './pages/protected/Transactions'
import Receipts from './pages/protected/Receipts'
import Payments from './pages/protected/Payments'
import Reports from './pages/protected/Reports'
import Invoices from './pages/protected/Invoices'
import Marketplace from './pages/protected/Marketplace'
import Help from './pages/protected/Help'
import Plugins from './pages/protected/Plugins'

// Settings
import SettingsHub from './pages/protected/settings/SettingsHub'
import SettingsPageLayout from './layouts/SettingsPageLayout'
import AccountProfile from './pages/protected/settings/AccountProfile'
import AccountSecurity from './pages/protected/settings/AccountSecurity'
import AccountNotifications from './pages/protected/settings/AccountNotifications'
import CompanyGeneral from './pages/protected/settings/CompanyGeneral'
import CompanyBranding from './pages/protected/settings/CompanyBranding'
import CompanyLegal from './pages/protected/settings/CompanyLegal'
import TeamMembers from './pages/protected/settings/TeamMembers'
import TeamInvites from './pages/protected/settings/TeamInvites'
import RolesSettings from './pages/protected/settings/RolesSettings'
import StoresSettings from './pages/protected/settings/StoresSettings'
import SubscriptionPlan from './pages/protected/settings/SubscriptionPlan'
import SubscriptionBilling from './pages/protected/settings/SubscriptionBilling'
import SubscriptionInvoices from './pages/protected/settings/SubscriptionInvoices'

export default function App() {

    const { loading } = useAuth()

    if (loading) {
        return <LoadingSpinner />
    }

    return (
        <Routes>
            {/* AUTH ROUTES (μόνο για logged-out users) */}
            <Route element={<RequireLoggedOut />}>
                <Route path="/auth">
                    <Route index element={<Auth />} />
                    <Route path="reset-password" element={<ResetPassword />} />
                </Route>
            </Route>

            <Route path="/invite/:token" element={<InviteSetPassword />} />

            {/* PROTECTED ROUTES - APP */}
            <Route element={<ProtectedRoute />}>

                <Route element={<RequireSelectCompany />}>
                    <Route path="/select-company" element={<CompanySelector />} />
                </Route>

                {/* ROUTES ΓΙΑ ΧΡΗΣΤΕΣ ΠΟΥ ΕΙΝΑΙ ΣΕ ONBOARDING */}
                <Route element={<RequireOnboarding />}>
                    <Route path="/onboarding/:step" element={<OnboardingLayout />} />
                </Route>

                {/* ROUTES ΓΙΑ ΧΡΗΣΤΕΣ ΠΟΥ ΕΧΟΥΝ ΟΛΟΚΛΗΡΩΣΕΙ ΤΟ ONBOARDING */}
                <Route element={<RequireFinishedOnboarding />}>
                    
                    {/* ============================================ */}
                    {/* QUICK MENU - No permissions required */}
                    {/* ============================================ */}
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/notifications" element={<Notifications />} />
                    <Route path="/calendar" element={<Calendar />} />

                    {/* ============================================ */}
                    {/* CORE OPERATIONS - Permission required */}
                    {/* ============================================ */}
                    <Route path="/sales" element={
                        <RequirePermission permission={PERMISSIONS.SALES_VIEW}>
                            <Sales />
                        </RequirePermission>
                    } />
                    <Route path="/purchases" element={
                        <RequirePermission permission={PERMISSIONS.PURCHASES_VIEW}>
                            <Purchases />
                        </RequirePermission>
                    } />
                    <Route path="/products" element={
                        <RequirePermission permission={PERMISSIONS.PRODUCTS_VIEW}>
                            <Products />
                        </RequirePermission>
                    } />
                    <Route path="/inventory" element={
                        <RequirePermission permission={PERMISSIONS.INVENTORY_VIEW}>
                            <Inventory />
                        </RequirePermission>
                    } />
                    <Route path="/customers" element={
                        <RequirePermission permission={PERMISSIONS.CUSTOMERS_VIEW}>
                            <Customers />
                        </RequirePermission>
                    } />
                    <Route path="/vendors" element={
                        <RequirePermission permission={PERMISSIONS.VENDORS_VIEW}>
                            <Vendors />
                        </RequirePermission>
                    } />

                    {/* ============================================ */}
                    {/* FINANCIAL - Permission required */}
                    {/* ============================================ */}
                    <Route path="/transactions" element={
                        <RequirePermission permission={PERMISSIONS.TRANSACTIONS_VIEW}>
                            <Transactions />
                        </RequirePermission>
                    } />
                    <Route path="/receipts" element={
                        <RequirePermission permission={PERMISSIONS.SALES_VIEW}>
                            <Receipts />
                        </RequirePermission>
                    } />
                    <Route path="/payments" element={
                        <RequirePermission permission={PERMISSIONS.PURCHASES_VIEW}>
                            <Payments />
                        </RequirePermission>
                    } />
                    <Route path="/reports" element={
                        <RequirePermission permission={PERMISSIONS.REPORTS_VIEW}>
                            <Reports />
                        </RequirePermission>
                    } />
                    <Route path="/invoices" element={
                        <RequirePermission permission={PERMISSIONS.INVOICES_VIEW}>
                            <Invoices />
                        </RequirePermission>
                    } />

                    {/* ============================================ */}
                    {/* SYSTEM - No permissions required */}
                    {/* ============================================ */}
                    <Route path="/plugins" element={<Plugins />} />
                    <Route path="/marketplace" element={<Marketplace />} />
                    <Route path="/help" element={<Help />} />

                    {/* ============================================ */}
                    {/* SETTINGS */}
                    {/* ============================================ */}
                    
                    {/* Settings Hub - Everyone can access */}
                    <Route path="/settings" element={<SettingsHub />} />

                    {/* Settings - My Account (everyone) */}
                    <Route path="/settings/account" element={<SettingsPageLayout />}>
                        <Route index element={<AccountProfile />} />
                        <Route path="security" element={<AccountSecurity />} />
                        <Route path="notifications" element={<AccountNotifications />} />
                    </Route>

                    {/* Settings - Company (owner only) */}
                    <Route path="/settings/company" element={
                        <RequirePermission ownerOnly redirectTo="/settings">
                            <SettingsPageLayout />
                        </RequirePermission>
                    }>
                        <Route index element={<CompanyGeneral />} />
                        <Route path="branding" element={<CompanyBranding />} />
                        <Route path="legal" element={<CompanyLegal />} />
                    </Route>

                    {/* Settings - Team (users.view permission) */}
                    <Route path="/settings/team" element={
                        <RequirePermission permission={PERMISSIONS.USERS_VIEW} redirectTo="/settings">
                            <SettingsPageLayout />
                        </RequirePermission>
                    }>
                        <Route index element={<TeamMembers />} />
                        <Route path="invites" element={
                            <RequirePermission permission={PERMISSIONS.USERS_INVITE} redirectTo="/settings/team">
                                <TeamInvites />
                            </RequirePermission>
                        } />
                    </Route>

                    {/* Settings - Roles (owner only) */}
                    <Route path="/settings/roles" element={
                        <RequirePermission ownerOnly redirectTo="/settings">
                            <SettingsPageLayout />
                        </RequirePermission>
                    }>
                        <Route index element={<RolesSettings />} />
                    </Route>

                    {/* Settings - Stores (stores.manage permission) */}
                    <Route path="/settings/stores" element={
                        <RequirePermission permission={PERMISSIONS.STORES_MANAGE} redirectTo="/settings">
                            <SettingsPageLayout />
                        </RequirePermission>
                    }>
                        <Route index element={<StoresSettings />} />
                    </Route>

                    {/* Settings - Subscription (owner only) */}
                    <Route path="/settings/subscription" element={
                        <RequirePermission ownerOnly redirectTo="/settings">
                            <SettingsPageLayout />
                        </RequirePermission>
                    }>
                        <Route index element={<SubscriptionPlan />} />
                        <Route path="billing" element={<SubscriptionBilling />} />
                        <Route path="invoices" element={<SubscriptionInvoices />} />
                    </Route>

                </Route>

                {/* LOGGED-IN catch-all (smart) */}
                <Route path="*" element={<ProtectedCatchAll />} />
            </Route>

            {/* Catch-all για NOT logged-in χρήστες -> redirect στο "/auth" */}
            <Route path="*" element={<Navigate to="/auth" replace />} />
        </Routes>
    )
}