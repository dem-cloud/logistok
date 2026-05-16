import { useState, useCallback, useEffect, useMemo } from "react";
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, Truck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useVendors, useVendorMutations, useVendorOutstanding, type Vendor } from "@/hooks/useVendors";
import SidePopup from "@/components/reusable/SidePopup";
import Button from "@/components/reusable/Button";
import LoadingSpinner from "@/components/LoadingSpinner";
import { axiosPrivate } from "@/api/axios";
import countries from "i18n-iso-countries";
import el from "i18n-iso-countries/langs/el.json";
import styles from "./Vendors.module.css";

countries.registerLocale(el);
const countryList = Object.entries(countries.getNames("el"))
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "el"));

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export default function Vendors() {
    const { showToast } = useAuth();
    const [searchFilter, setSearchFilter] = useState("");
    const [popupOpen, setPopupOpen] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<number>(20);

    const { vendors, isLoading, isFetching } = useVendors({
        search: searchFilter.trim() || undefined,
    });

    // Reset pagination when filters change so the user doesn't land on a page
    // that no longer exists in the filtered set.
    useEffect(() => {
        setPage(1);
    }, [searchFilter, pageSize]);

    const totalPages = Math.max(1, Math.ceil(vendors.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    const paginatedVendors = useMemo(
        () => vendors.slice((currentPage - 1) * pageSize, currentPage * pageSize),
        [vendors, currentPage, pageSize],
    );
    const rangeStart = vendors.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const rangeEnd = Math.min(currentPage * pageSize, vendors.length);

    const mutations = useVendorMutations();
    const { payablesAmount, receivablesAmount, isLoading: outstandingLoading } = useVendorOutstanding(editId);

    const [formName, setFormName] = useState("");
    const [formContactName, setFormContactName] = useState("");
    const [formPhone, setFormPhone] = useState("");
    const [formEmail, setFormEmail] = useState("");
    const [formTaxId, setFormTaxId] = useState("");
    const [formAddress, setFormAddress] = useState("");
    const [formCity, setFormCity] = useState("");
    const [formPostalCode, setFormPostalCode] = useState("");
    const [formCountry, setFormCountry] = useState("");
    const [formNotes, setFormNotes] = useState("");
    const [formPaymentTerms, setFormPaymentTerms] = useState<"immediate" | "15" | "30" | "60" | "90">("immediate");
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});

    const resetForm = useCallback(() => {
        setFormName("");
        setFormContactName("");
        setFormPhone("");
        setFormEmail("");
        setFormTaxId("");
        setFormAddress("");
        setFormCity("");
        setFormPostalCode("");
        setFormCountry("");
        setFormNotes("");
        setFormPaymentTerms("immediate");
        setFormErrors({});
    }, []);

    const openCreate = useCallback(() => {
        setEditId(null);
        resetForm();
        setPopupOpen(true);
    }, [resetForm]);

    const openEdit = useCallback((v: Vendor) => {
        setEditId(v.id);
        setFormName(v.name);
        setFormContactName(v.contact_name || "");
        setFormPhone(v.phone || "");
        setFormEmail(v.email || "");
        setFormTaxId(v.tax_id || "");
        setFormAddress(v.address || "");
        setFormCity(v.city || "");
        setFormPostalCode(v.postal_code || "");
        const countryVal = v.country || "";
        const codeFromName = countryVal.length > 2
            ? Object.entries(countries.getNames("el")).find(([, n]) => n === countryVal)?.[0]
            : countryVal;
        setFormCountry(codeFromName || countryVal);
        setFormNotes(v.notes || "");
        const pt = (v as { payment_terms?: string }).payment_terms;
        setFormPaymentTerms(pt && ["15", "30", "60", "90"].includes(pt) ? (pt as "15" | "30" | "60" | "90") : "immediate");
        setFormErrors({});
        setPopupOpen(true);
    }, []);

    useEffect(() => {
        if (!popupOpen || editId || formCountry) return;

        const detectCountry = async () => {
            try {
                const res = await axiosPrivate.get("/api/billing/detect-country");
                const { success, data } = res.data;
                const code = success && data?.country ? data.country : "GR";
                setFormCountry(code);
            } catch {
                setFormCountry("GR");
            }
        };

        detectCountry();
    }, [popupOpen, editId, formCountry]);

    const closePopup = useCallback(() => {
        setPopupOpen(false);
        setEditId(null);
        resetForm();
    }, [resetForm]);

    const validateForm = (): boolean => {
        const err: Record<string, string> = {};
        if (!formName.trim()) err.name = "Το όνομα προμηθευτή είναι υποχρεωτικό";
        setFormErrors(err);
        return Object.keys(err).length === 0;
    };

    const handleSave = async () => {
        if (!validateForm()) return;

        try {
            if (editId) {
                await mutations.updateVendor.mutateAsync({
                    id: editId,
                    name: formName.trim(),
                    contact_name: formContactName.trim() || null,
                    phone: formPhone.trim() || null,
                    email: formEmail.trim() || null,
                    tax_id: formTaxId.trim() || null,
                    address: formAddress.trim() || null,
                    city: formCity.trim() || null,
                    postal_code: formPostalCode.trim() || null,
                    country: formCountry.trim() || null,
                    notes: formNotes.trim() || null,
                    payment_terms: formPaymentTerms,
                });
                showToast({ message: "Ο προμηθευτής ενημερώθηκε επιτυχώς", type: "success" });
            } else {
                await mutations.createVendor.mutateAsync({
                    name: formName.trim(),
                    contact_name: formContactName.trim() || null,
                    phone: formPhone.trim() || null,
                    email: formEmail.trim() || null,
                    tax_id: formTaxId.trim() || null,
                    address: formAddress.trim() || null,
                    city: formCity.trim() || null,
                    postal_code: formPostalCode.trim() || null,
                    country: formCountry.trim() || null,
                    notes: formNotes.trim() || null,
                    payment_terms: formPaymentTerms,
                });
                showToast({ message: "Ο προμηθευτής δημιουργήθηκε επιτυχώς", type: "success" });
            }
            closePopup();
        } catch (e: unknown) {
            const err = e as Error;
            showToast({ message: err.message || "Σφάλμα", type: "error" });
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await mutations.deleteVendor.mutateAsync(id);
            showToast({ message: "Ο προμηθευτής διαγράφηκε επιτυχώς", type: "success" });
            setDeleteConfirmId(null);
        } catch (e: unknown) {
            const err = e as Error;
            showToast({ message: err.message || "Σφάλμα", type: "error" });
        }
    };

    const showVendorsLoading = isLoading && vendors.length === 0;

    return (
        <div className={styles.wrapper}>
            <div className={styles.headerRow}>
                <h1 className={styles.title}>Προμηθευτές</h1>
                <p className={styles.subtitle}>Διαχείριση καταλόγου προμηθευτών</p>
            </div>

            <div className={styles.listToolbar}>
                <div className={styles.filtersRow}>
                    <div className={styles.filterGroup}>
                        <label className={styles.filterLabel}>Αναζήτηση</label>
                        <div className={styles.searchWrapper}>
                            <Search size={16} className={styles.searchIcon} />
                            <input
                                type="text"
                                className={styles.filterInput}
                                placeholder="Όνομα, επαφή, email ή τηλέφωνο..."
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
                <div className={styles.addBtn}>
                    <Button variant="primary" onClick={openCreate}>
                        <Plus size={16} />
                        Προσθήκη προμηθευτή
                    </Button>
                </div>
            </div>

            <div className={styles.section}>
                {showVendorsLoading ? (
                    <div className={styles.listLoading}>
                        <LoadingSpinner />
                    </div>
                ) : (
                    <div className={styles.listWrapper}>
                        <div className={styles.tableWrap}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Όνομα</th>
                                        <th>Επαφή</th>
                                        <th>Τηλέφωνο</th>
                                        <th>Email</th>
                                        <th>ΑΦΜ</th>
                                        <th className={styles.actionsCol}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedVendors.length === 0 ? (
                                        <tr className={styles.tableEmptyRow}>
                                            <td colSpan={6}>
                                                <div className={styles.tableEmptyState}>
                                                    <div className={styles.tableEmptyIcon} aria-hidden>
                                                        <Truck size={32} strokeWidth={1.35} />
                                                    </div>
                                                    <p className={styles.tableEmptyTitle}>Δεν υπάρχουν προμηθευτές</p>
                                                    <p className={styles.tableEmptyHint}>
                                                        Ο κατάλογος είναι κενός ή δεν ταιριάζει με την αναζήτηση. Χρησιμοποιήστε «Προσθήκη προμηθευτή» για την πρώτη εγγραφή.
                                                    </p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        paginatedVendors.map((v) => (
                                            <tr key={v.id} onClick={() => openEdit(v)}>
                                                <td className={styles.primaryCell}>{v.name}</td>
                                                <td>{v.contact_name || "—"}</td>
                                                <td>{v.phone || "—"}</td>
                                                <td>{v.email || "—"}</td>
                                                <td>{v.tax_id || "—"}</td>
                                                <td className={styles.actionsCol}>
                                                    <div className={styles.cellActions}>
                                                        <button
                                                            type="button"
                                                            className={styles.editBtn}
                                                            onClick={(e) => { e.stopPropagation(); openEdit(v); }}
                                                            title="Επεξεργασία"
                                                        >
                                                            <Pencil size={16} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={styles.deleteBtn}
                                                            onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(v.id); }}
                                                            title="Διαγραφή"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {isFetching && (
                            <div className={styles.listOverlay}>
                                <LoadingSpinner />
                            </div>
                        )}
                        {vendors.length > 0 && (
                        <div className={styles.pagination}>
                            <div className={styles.paginationInfo}>
                                Εμφάνιση <strong>{rangeStart}</strong>–<strong>{rangeEnd}</strong> από <strong>{vendors.length}</strong>
                            </div>
                            <div className={styles.paginationControls}>
                                <label className={styles.pageSizeLabel}>
                                    Γραμμές
                                    <select
                                        className={styles.pageSizeSelect}
                                        value={pageSize}
                                        onChange={(e) => setPageSize(Number(e.target.value))}
                                    >
                                        {PAGE_SIZE_OPTIONS.map((n) => (
                                            <option key={n} value={n}>{n}</option>
                                        ))}
                                    </select>
                                </label>
                                <div className={styles.pageNav}>
                                    <button
                                        type="button"
                                        className={styles.pageBtn}
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        disabled={currentPage <= 1}
                                        aria-label="Προηγούμενη σελίδα"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>
                                    <span className={styles.pageIndicator}>
                                        Σελίδα <strong>{currentPage}</strong> / {totalPages}
                                    </span>
                                    <button
                                        type="button"
                                        className={styles.pageBtn}
                                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                        disabled={currentPage >= totalPages}
                                        aria-label="Επόμενη σελίδα"
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                        )}
                    </div>
                )}
            </div>

            {deleteConfirmId && (
                <SidePopup
                    isOpen={!!deleteConfirmId}
                    onClose={() => setDeleteConfirmId(null)}
                    title="Επιβεβαίωση διαγραφής"
                    footerLeftButton={{
                        label: "Κλείσιμο",
                        onClick: () => setDeleteConfirmId(null),
                        variant: "outline",
                    }}
                    footerRightButton={{
                        label: "Διαγραφή",
                        onClick: () => handleDelete(deleteConfirmId!),
                        variant: "danger",
                        loading: mutations.deleteVendor.isPending,
                    }}
                >
                    <p className={styles.deleteConfirmText}>
                        Θέλετε να διαγράψετε αυτόν τον προμηθευτή; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.
                    </p>
                </SidePopup>
            )}

            <SidePopup
                isOpen={popupOpen}
                onClose={closePopup}
                title={editId ? "Επεξεργασία προμηθευτή" : "Νέος προμηθευτής"}
                width="560px"
                footerLeftButton={{
                    label: "Κλείσιμο",
                    onClick: closePopup,
                    variant: "outline",
                }}
                footerRightButton={{
                    label: "Αποθήκευση",
                    onClick: handleSave,
                    variant: "primary",
                    loading: mutations.createVendor.isPending || mutations.updateVendor.isPending,
                }}
            >
                <div>
                        {editId && (
                            <div className={styles.outstandingBanner}>
                                {outstandingLoading ? (
                                    "Φόρτωση..."
                                ) : (
                                    <>
                                        <div className={styles.outstandingLine}>
                                            Εκκρεμείς υποχρεώσεις (προς προμηθευτή): {payablesAmount.toFixed(2)} €
                                        </div>
                                        <div className={styles.outstandingLine}>
                                            Εκκρεμείς απαιτήσεις από προμηθευτή (πιστωτικά − εισπράξεις):{" "}
                                            {receivablesAmount.toFixed(2)} €
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Όνομα προμηθευτή *</label>
                        <input
                            type="text"
                            className={styles.formInput}
                            value={formName}
                            onChange={(e) => setFormName(e.target.value)}
                            placeholder="π.χ. Papadopoulos Supplies"
                        />
                        {formErrors.name && (
                            <span className={styles.formError}>{formErrors.name}</span>
                        )}
                    </div>

                    <div className={styles.formGroup} style={{ marginTop: 16 }}>
                        <label className={styles.formLabel}>Όνομα επαφής</label>
                        <input
                            type="text"
                            className={styles.formInput}
                            value={formContactName}
                            onChange={(e) => setFormContactName(e.target.value)}
                            placeholder="π.χ. Γιάννης Παπαδόπουλος"
                        />
                    </div>

                    <div className={styles.formRow} style={{ marginTop: 16 }}>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Τηλέφωνο</label>
                            <input
                                type="text"
                                className={styles.formInput}
                                value={formPhone}
                                onChange={(e) => setFormPhone(e.target.value)}
                                placeholder="π.χ. 2104455667"
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Email</label>
                            <input
                                type="email"
                                className={styles.formInput}
                                value={formEmail}
                                onChange={(e) => setFormEmail(e.target.value)}
                                placeholder="π.χ. info@example.com"
                            />
                        </div>
                    </div>

                    <div className={styles.formGroup} style={{ marginTop: 16 }}>
                        <label className={styles.formLabel}>ΑΦΜ</label>
                        <input
                            type="text"
                            className={styles.formInput}
                            value={formTaxId}
                            onChange={(e) => setFormTaxId(e.target.value)}
                            placeholder="π.χ. 092345621"
                        />
                    </div>

                    <div className={styles.formGroup} style={{ marginTop: 16 }}>
                        <label className={styles.formLabel}>Διεύθυνση</label>
                        <input
                            type="text"
                            className={styles.formInput}
                            value={formAddress}
                            onChange={(e) => setFormAddress(e.target.value)}
                            placeholder="π.χ. Αθηνών 45"
                        />
                    </div>

                    <div className={styles.formRow} style={{ marginTop: 16 }}>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Πόλη</label>
                            <input
                                type="text"
                                className={styles.formInput}
                                value={formCity}
                                onChange={(e) => setFormCity(e.target.value)}
                                placeholder="π.χ. Αθήνα"
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Ταχ. Κώδικας</label>
                            <input
                                type="text"
                                className={styles.formInput}
                                value={formPostalCode}
                                onChange={(e) => setFormPostalCode(e.target.value)}
                                placeholder="π.χ. 10451"
                            />
                        </div>
                    </div>

                    <div className={styles.formGroup} style={{ marginTop: 16 }}>
                        <label className={styles.formLabel}>Χώρα</label>
                        <select
                            className={styles.formSelect}
                            value={formCountry}
                            onChange={(e) => setFormCountry(e.target.value)}
                        >
                            <option value="">Επιλέξτε χώρα</option>
                            {countryList.map(({ code, name }) => (
                                <option key={code} value={code}>
                                    {name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.formGroup} style={{ marginTop: 16 }}>
                        <label className={styles.formLabel}>Όροι Πληρωμής</label>
                        <select
                            className={styles.formSelect}
                            value={formPaymentTerms}
                            onChange={(e) => setFormPaymentTerms(e.target.value as "immediate" | "15" | "30" | "60" | "90")}
                        >
                            <option value="immediate">Άμεση Πληρωμή</option>
                            <option value="15">15 ημέρες</option>
                            <option value="30">30 ημέρες</option>
                            <option value="60">60 ημέρες</option>
                            <option value="90">90 ημέρες</option>
                        </select>
                    </div>

                    <div className={styles.formGroup} style={{ marginTop: 16 }}>
                        <label className={styles.formLabel}>Σημειώσεις</label>
                        <textarea
                            className={styles.formInput}
                            value={formNotes}
                            onChange={(e) => setFormNotes(e.target.value)}
                            placeholder="Προαιρετικές σημειώσεις"
                            rows={2}
                        />
                    </div>
                </div>
            </SidePopup>
        </div>
    );
}
