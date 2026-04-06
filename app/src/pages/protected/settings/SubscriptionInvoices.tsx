import { useState } from "react";
import styles from "./SubscriptionInvoices.module.css";
import { useInvoices } from "@/hooks/useInvoices";
import LoadingSpinner from "@/components/LoadingSpinner";
import {
    Download,
    FileText,
    Check,
    Clock,
    AlertCircle,
    ChevronDown,
    Search,
    Receipt,
} from "lucide-react";

// ============================================
// TYPES
// ============================================
type InvoiceStatus = "paid" | "pending" | "failed" | "void";

type Invoice = {
    id: string;
    number: string;
    date: string;
    due_date: string;
    amount: number;
    currency: string;
    status: InvoiceStatus;
    description: string;
    pdf_url: string | null;
};

// ============================================
// STATUS BADGE
// ============================================
const StatusBadge: React.FC<{ status: InvoiceStatus }> = ({ status }) => {
    const config: Record<InvoiceStatus, { label: string; icon: React.ReactNode; className: string }> = {
        paid: {
            label: "Πληρωμένο",
            icon: <Check size={12} />,
            className: styles.statusPaid,
        },
        pending: {
            label: "Εκκρεμεί",
            icon: <Clock size={12} />,
            className: styles.statusPending,
        },
        failed: {
            label: "Απέτυχε",
            icon: <AlertCircle size={12} />,
            className: styles.statusFailed,
        },
        void: {
            label: "Ακυρωμένο",
            icon: <AlertCircle size={12} />,
            className: styles.statusVoid,
        },
    };

    const { label, icon, className } = config[status];

    return (
        <span className={`${styles.statusBadge} ${className}`}>
            {icon}
            {label}
        </span>
    );
};

// ============================================
// MAIN COMPONENT
// ============================================
export default function SubscriptionInvoices() {
    const { data: invoices = [], isLoading } = useInvoices();

    const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");
    const [yearFilter, setYearFilter] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState("");

    if (isLoading) {
        return <LoadingSpinner />;
    }

    // Get unique years from invoices
    const years = [...new Set(invoices.map(inv => new Date(inv.date).getFullYear()))].sort((a, b) => b - a);

    // Filter invoices
    const filteredInvoices = invoices.filter((invoice) => {
        // Status filter
        if (statusFilter !== "all" && invoice.status !== statusFilter) {
            return false;
        }

        // Year filter
        if (yearFilter !== "all" && new Date(invoice.date).getFullYear().toString() !== yearFilter) {
            return false;
        }

        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            return (
                invoice.number.toLowerCase().includes(query) ||
                invoice.description.toLowerCase().includes(query)
            );
        }

        return true;
    });

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString("el-GR", {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    };

    const formatAmount = (amount: number, currency: string) => {
        return `${amount.toFixed(2)}${currency}`;
    };

    const handleDownload = (invoice: Invoice) => {
        if (invoice.pdf_url) {
            window.open(invoice.pdf_url, "_blank");
        }
    };

    return (
        <div className={styles.wrapper}>
            {/* Header with Filters */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <Receipt size={20} />
                    <h2>Ιστορικό Τιμολογίων</h2>
                    <span className={styles.invoiceCount}>{invoices.length} τιμολόγια</span>
                </div>

                <div className={styles.filters}>
                    {/* Search */}
                    <div className={styles.searchWrapper}>
                        <Search size={16} className={styles.searchIcon} />
                        <input
                            type="text"
                            placeholder="Αναζήτηση"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={styles.searchInput}
                        />
                    </div>

                    {/* Year Filter */}
                    <div className={styles.selectWrapper}>
                        <select
                            value={yearFilter}
                            onChange={(e) => setYearFilter(e.target.value)}
                            className={styles.select}
                        >
                            <option value="all">Όλα τα έτη</option>
                            {years.map((year) => (
                                <option key={year} value={year.toString()}>
                                    {year}
                                </option>
                            ))}
                        </select>
                        <ChevronDown size={14} className={styles.selectChevron} />
                    </div>

                    {/* Status Filter */}
                    <div className={styles.selectWrapper}>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | "all")}
                            className={styles.select}
                        >
                            <option value="all">Όλες οι καταστάσεις</option>
                            <option value="paid">Πληρωμένα</option>
                            <option value="pending">Εκκρεμή</option>
                            <option value="failed">Αποτυχημένα</option>
                        </select>
                        <ChevronDown size={14} className={styles.selectChevron} />
                    </div>
                </div>
            </div>

            {/* Invoices Table */}
            {filteredInvoices.length === 0 ? (
                <div className={styles.emptyState}>
                    <FileText size={48} />
                    <h3>Δεν βρέθηκαν τιμολόγια</h3>
                    <p>
                        {invoices.length === 0
                            ? "Δεν υπάρχουν τιμολόγια ακόμα."
                            : "Δοκιμάστε να αλλάξετε τα φίλτρα αναζήτησης."}
                    </p>
                </div>
            ) : (
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Αριθμός</th>
                                <th>Ημερομηνία</th>
                                <th>Περιγραφή</th>
                                <th>Ποσό</th>
                                <th>Κατάσταση</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredInvoices.map((invoice) => (
                                <tr key={invoice.id}>
                                    <td>
                                        <span className={styles.invoiceNumber}>
                                            {invoice.number}
                                        </span>
                                    </td>
                                    <td>{formatDate(invoice.date)}</td>
                                    <td>
                                        <span className={styles.invoiceDescription}>
                                            {invoice.description}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={styles.invoiceAmount}>
                                            {formatAmount(invoice.amount, invoice.currency)}
                                        </span>
                                    </td>
                                    <td>
                                        <StatusBadge status={invoice.status} />
                                    </td>
                                    <td>
                                        {invoice.pdf_url && (
                                            <button
                                                className={styles.downloadButton}
                                                onClick={() => handleDownload(invoice)}
                                                title="Λήψη PDF"
                                            >
                                                <Download size={16} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}