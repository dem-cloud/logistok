import { Link } from "react-router-dom";
import { TrendingUp, ShoppingCart, Package, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSales } from "@/hooks/useSales";
import { usePurchases } from "@/hooks/usePurchases";
import { useStoreProducts } from "@/hooks/useInventory";
import { usePermissions } from "@/hooks/usePermissions";
import LoadingSpinner from "@/components/LoadingSpinner";
import styles from "./Dashboard.module.css";

function formatCurrency(amount: number) {
    return new Intl.NumberFormat("el-GR", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

function formatDate(iso: string) {
    try {
        const d = new Date(iso);
        return d.toLocaleDateString("el-GR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return iso;
    }
}

function getTodayDateRange() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${d}`;
    const dateFrom = `${dateStr}T00:00:00.000Z`;
    const dateTo = dateStr;
    return { dateFrom, dateTo };
}

const LOW_STOCK_THRESHOLD = 5;

export default function Dashboard() {
    const { activeStore } = useAuth();
    const { can } = usePermissions();
    const canViewSales = can("sales.view");
    const canViewPurchases = can("purchases.view");
    const canViewInventory = can("inventory.view");

    const { dateFrom, dateTo } = getTodayDateRange();

    const { sales, isLoading: salesLoading } = useSales({
        storeId: activeStore?.id ?? undefined,
        dateFrom,
        dateTo,
    });
    const { sales: allSales, isLoading: allSalesLoading } = useSales({
        storeId: activeStore?.id ?? undefined,
    });
    const { purchases, isLoading: purchasesLoading } = usePurchases({
        storeId: activeStore?.id ?? undefined,
        dateFrom,
        dateTo,
    });
    const { storeProducts, isLoading: inventoryLoading } = useStoreProducts({
        storeId: activeStore?.id ?? undefined,
    });

    const salesToday = sales ?? [];
    const purchasesToday = purchases ?? [];
    const salesTotal = salesToday.reduce((s, x) => s + (x.total_amount ?? 0), 0);
    const purchasesTotal = purchasesToday.reduce((s, x) => s + (x.total_amount ?? 0), 0);

    const productsInStock = (storeProducts ?? []).filter((p) => (p.stock_quantity ?? 0) > 0).length;
    const lowStockCount = (storeProducts ?? []).filter((p) => (p.stock_quantity ?? 0) > 0 && (p.stock_quantity ?? 0) < LOW_STOCK_THRESHOLD).length;

    const recentSales = [...(allSales ?? [])].slice(0, 5);
    const isLoading = salesLoading || allSalesLoading || purchasesLoading || inventoryLoading;

    if (!activeStore?.id) {
        return (
            <div className={styles.wrapper}>
                <p className={styles.emptyState}>Επιλέξτε κατάστημα από την πλευρική μπάρα.</p>
            </div>
        );
    }

    return (
        <div className={styles.wrapper}>
            {/* <header className={styles.header}>
                <h1 className={styles.title}>Πίνακας Ελέγχου</h1>
                <p className={styles.subtitle}>{activeStore.name}</p>
            </header> */}

            {isLoading ? (
                <div className={styles.loadingWrap}>
                    <LoadingSpinner />
                </div>
            ) : (
                <>
                    <section className={styles.cards}>
                        {canViewSales && (
                            <div className={styles.card}>
                                <div className={styles.cardIcon} style={{ background: "#dbeafe" }}>
                                    <TrendingUp size={20} color="#2563eb" />
                                </div>
                                <div className={styles.cardContent}>
                                    <span className={styles.cardLabel}>Πωλήσεις σήμερα</span>
                                    <span className={styles.cardValue}>
                                        {salesToday.length} {salesToday.length === 1 ? "πώληση" : "πωλήσεις"} · {formatCurrency(salesTotal)}
                                    </span>
                                </div>
                            </div>
                        )}
                        {canViewPurchases && (
                            <div className={styles.card}>
                                <div className={styles.cardIcon} style={{ background: "#dcfce7" }}>
                                    <ShoppingCart size={20} color="#16a34a" />
                                </div>
                                <div className={styles.cardContent}>
                                    <span className={styles.cardLabel}>Αγορές σήμερα</span>
                                    <span className={styles.cardValue}>
                                        {purchasesToday.length} {purchasesToday.length === 1 ? "αγορά" : "αγορές"} · {formatCurrency(purchasesTotal)}
                                    </span>
                                </div>
                            </div>
                        )}
                        {canViewInventory && (
                            <>
                                <div className={styles.card}>
                                    <div className={styles.cardIcon} style={{ background: "#f3e8ff" }}>
                                        <Package size={20} color="#7c3aed" />
                                    </div>
                                    <div className={styles.cardContent}>
                                        <span className={styles.cardLabel}>Προϊόντα σε απόθεμα</span>
                                        <span className={styles.cardValue}>{productsInStock}</span>
                                    </div>
                                </div>
                                <div className={styles.card}>
                                    <div className={styles.cardIcon} style={{ background: lowStockCount > 0 ? "#fef3c7" : "#f3f4f6" }}>
                                        <AlertTriangle size={20} color={lowStockCount > 0 ? "#d97706" : "#6b7280"} />
                                    </div>
                                    <div className={styles.cardContent}>
                                        <span className={styles.cardLabel}>Χαμηλό απόθεμα (&lt;{LOW_STOCK_THRESHOLD})</span>
                                        <span className={styles.cardValue}>{lowStockCount}</span>
                                    </div>
                                </div>
                            </>
                        )}
                    </section>

                    {canViewSales && (
                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <h2 className={styles.sectionTitle}>Πρόσφατες πωλήσεις</h2>
                                <Link to="/sales" className={styles.sectionLink}>
                                    Δείτε όλες →
                                </Link>
                            </div>
                            {recentSales.length === 0 ? (
                                <p className={styles.emptyList}>Δεν υπάρχουν πωλήσεις.</p>
                            ) : (
                                <ul className={styles.saleList}>
                                    {recentSales.map((sale) => (
                                        <li key={sale.id} className={styles.saleItem}>
                                            <span className={styles.saleDate}>{formatDate(sale.created_at)}</span>
                                            <span className={styles.saleAmount}>{formatCurrency(sale.total_amount)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    )}

                    {!canViewSales && !canViewPurchases && !canViewInventory && (
                        <p className={styles.emptyState}>
                            Δεν έχετε δικαιώματα για προβολή δεδομένων. Επικοινωνήστε με τον διαχειριστή.
                        </p>
                    )}
                </>
            )}
        </div>
    );
}
