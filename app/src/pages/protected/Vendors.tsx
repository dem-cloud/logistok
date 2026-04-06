import { useState, useCallback, useEffect } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
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

export default function Vendors() {
    const { showToast } = useAuth();
    const [searchFilter, setSearchFilter] = useState("");
    const [popupOpen, setPopupOpen] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    const { vendors, isLoading, isFetching } = useVendors({
        search: searchFilter.trim() || undefined,
    });

    const mutations = useVendorMutations();
    const { outstandingAmount, isLoading: outstandingLoading } = useVendorOutstanding(editId);

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

    const formatMeta = (v: Vendor) => {
        const parts: string[] = [];
        if (v.contact_name) parts.push(v.contact_name);
        if (v.phone) parts.push(v.phone);
        if (v.email) parts.push(v.email);
        if (v.tax_id) parts.push(`ΑΦΜ: ${v.tax_id}`);
        return parts.join(" · ") || "—";
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
                        <input
                            type="text"
                            className={styles.filterInput}
                            placeholder="Όνομα, επαφή, email ή τηλέφωνο..."
                            value={searchFilter}
                            onChange={(e) => setSearchFilter(e.target.value)}
                        />
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
                <h3 className={styles.sectionTitle}>Λίστα προμηθευτών</h3>
                {showVendorsLoading ? (
                    <div className={styles.listLoading}>
                        <LoadingSpinner />
                    </div>
                ) : vendors.length === 0 ? (
                    <p className={styles.sectionHint}>
                        Δεν υπάρχουν προμηθευτές. Κάντε κλικ στο «Προσθήκη προμηθευτή».
                    </p>
                ) : (
                    <div className={styles.listWrapper}>
                        <div className={styles.vendorList}>
                        {vendors.map((v) => (
                            <div key={v.id} className={styles.vendorCard}>
                                <div className={styles.vendorInfo}>
                                    <span className={styles.vendorName}>{v.name}</span>
                                    <span className={styles.vendorMeta}>{formatMeta(v)}</span>
                                </div>
                                <div className={styles.vendorCardActions}>
                                    <button
                                        type="button"
                                        className={styles.editBtn}
                                        onClick={() => openEdit(v)}
                                        title="Επεξεργασία"
                                    >
                                        <Pencil size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.deleteBtn}
                                        onClick={() => setDeleteConfirmId(v.id)}
                                        title="Διαγραφή"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                        </div>
                        {isFetching && (
                            <div className={styles.listOverlay}>
                                <LoadingSpinner />
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
                                    <>Συνολικές Εκκρεμείς Υποχρεώσεις: {outstandingAmount.toFixed(2)} €</>
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
