import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { loadStripe } from "@stripe/stripe-js";
import { Link } from "react-router-dom";
import { Plus, AlertCircle, ArrowRight, Pencil, Trash2, RotateCcw } from "lucide-react";
import countries from "i18n-iso-countries";
import el from "i18n-iso-countries/langs/el.json";
import { useAuth } from "@/contexts/AuthContext";
import { useStoresCapacity } from "@/hooks/useStoresCapacity";
import useSubscription from "@/hooks/useSubscription";
import { axiosPrivate } from "@/api/axios";
import LoadingSpinner from "@/components/LoadingSpinner";
import SidePopup from "@/components/reusable/SidePopup";
import BillingInfoForm, { BillingInfoFormRef } from "@/components/BillingInfoForm";
import PaymentForm from "@/components/PaymentForm";
import { PaymentMethodFormRef } from "@/components/PaymentMethodForm";
import { CreditCard } from "lucide-react";
import styles from "./StoresSettings.module.css";
import previewStyles from "@/components/billing/PlanChangePreview.module.css";

countries.registerLocale(el);
const countryList = Object.entries(countries.getNames("el"))
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "el"));

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

export default function StoresSettings() {
    const queryClient = useQueryClient();
    const { showToast, activeCompany, me, setCompanies, setActiveCompany } = useAuth();
    const { data: capacity, isLoading: capacityLoading } = useStoresCapacity();
    const { data: subscription } = useSubscription();

    const [popupOpen, setPopupOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [pendingVerify, setPendingVerify] = useState<{
        subscriptionId: string;
        invoiceId: string;
        store: Record<string, string | null>;
    } | null>(null);

    const [storeName, setStoreName] = useState("");
    const [storePhone, setStorePhone] = useState("");
    const [storeEmail, setStoreEmail] = useState("");
    const [sameAsBillingAddress, setSameAsBillingAddress] = useState(true);
    const [storeAddress, setStoreAddress] = useState("");
    const [storeCity, setStoreCity] = useState("");
    const [storePostalCode, setStorePostalCode] = useState("");
    const [storeCountry, setStoreCountry] = useState("");
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});

    // Edit store state
    const [editStoreId, setEditStoreId] = useState<string | null>(null);
    const [editPopupOpen, setEditPopupOpen] = useState(false);
    const [editName, setEditName] = useState("");
    const [editPhone, setEditPhone] = useState("");
    const [editEmail, setEditEmail] = useState("");
    const [editAddress, setEditAddress] = useState("");
    const [editCity, setEditCity] = useState("");
    const [editPostalCode, setEditPostalCode] = useState("");
    const [editCountry, setEditCountry] = useState("");
    const [editFormErrors, setEditFormErrors] = useState<Record<string, string>>({});
    const [editLoading, setEditLoading] = useState(false);

    // Schedule remove / reactivate state
    const [scheduleRemoveStoreId, setScheduleRemoveStoreId] = useState<string | null>(null);
    const [scheduleRemoveLoading, setScheduleRemoveLoading] = useState(false);
    const [reactivateStoreId, setReactivateStoreId] = useState<string | null>(null);
    const [reactivateLoading, setReactivateLoading] = useState(false);
    const [pendingReactivateVerify, setPendingReactivateVerify] = useState<{
        subscriptionId: string;
        invoiceId: string;
        storeId: string;
    } | null>(null);

    const billingFormRef = useRef<BillingInfoFormRef>(null);
    const paymentFormRef = useRef<PaymentMethodFormRef>(null);
    const [selectedBillingMethod, setSelectedBillingMethod] = useState<"existing" | "new">("existing");
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"existing" | "new">("existing");

    const stores = activeCompany?.stores ?? [];
    const needsPayment = capacity && capacity.free_slots <= 0 && capacity.canAddExtraStores;
    const isBasicAtLimit = capacity && capacity.free_slots <= 0 && !capacity.canAddExtraStores;

    // Add store price preview (exact proration amount)
    const [addStorePreview, setAddStorePreview] = useState<{
        currency: { code: string; symbol: string };
        proration: { amount: number; vat: number; total: number; description: string };
        summary: { tax_percent: number };
    } | null>(null);
    const [addStorePreviewLoading, setAddStorePreviewLoading] = useState(false);
    const [addStorePreviewCountry, setAddStorePreviewCountry] = useState<string>("");
    const [addStorePreviewTaxId, setAddStorePreviewTaxId] = useState<string>("");

    const fetchAddStorePreview = useCallback(async () => {
        if (!popupOpen || !needsPayment) return;
        try {
            setAddStorePreviewLoading(true);
            setAddStorePreview(null);
            let billingInfo: { country?: string; taxId?: string } | null = null;
            if (selectedBillingMethod === "existing" && subscription?.billingInfo) {
                billingInfo = {
                    country: subscription.billingInfo.country || undefined,
                    taxId: subscription.billingInfo.taxId || undefined
                };
            } else if (selectedBillingMethod === "new" && billingFormRef.current) {
                const { data } = billingFormRef.current.getData();
                if (data?.country) {
                    billingInfo = {
                        country: data.country,
                        taxId: data.taxId || undefined
                    };
                } else if (addStorePreviewCountry) {
                    billingInfo = { country: addStorePreviewCountry, taxId: addStorePreviewTaxId || undefined };
                }
            } else if (addStorePreviewCountry) {
                billingInfo = { country: addStorePreviewCountry, taxId: addStorePreviewTaxId || undefined };
            }
            const res = await axiosPrivate.post("/api/billing/add-extra-store-preview", { billingInfo });
            if (res.data?.success && res.data?.data) {
                setAddStorePreview(res.data.data);
            }
        } catch {
            setAddStorePreview(null);
        } finally {
            setAddStorePreviewLoading(false);
        }
    }, [popupOpen, needsPayment, selectedBillingMethod, subscription?.billingInfo, addStorePreviewCountry, addStorePreviewTaxId]);

    useEffect(() => {
        if (popupOpen && needsPayment) {
            fetchAddStorePreview();
        } else {
            setAddStorePreview(null);
        }
    }, [popupOpen, needsPayment, fetchAddStorePreview]);

    useEffect(() => {
        if (subscription?.billingInfo) setSelectedBillingMethod("existing");
        else setSelectedBillingMethod("new");
        if (subscription?.card) setSelectedPaymentMethod("existing");
        else setSelectedPaymentMethod("new");
    }, [subscription?.billingInfo, subscription?.card]);

    useEffect(() => {
        if (!popupOpen || sameAsBillingAddress || storeCountry) return;
        const detect = async () => {
            try {
                const res = await axiosPrivate.get("/api/billing/detect-country");
                if (res.data?.success && res.data?.data?.country) {
                    setStoreCountry(res.data.data.country);
                }
            } catch {
                setStoreCountry("GR");
            }
        };
        detect();
    }, [popupOpen, sameAsBillingAddress]);

    useEffect(() => {
        if (!editPopupOpen || editLoading || editCountry) return;
        const detect = async () => {
            try {
                const res = await axiosPrivate.get("/api/billing/detect-country");
                if (res.data?.success && res.data?.data?.country) {
                    setEditCountry(res.data.data.country);
                }
            } catch {
                setEditCountry("GR");
            }
        };
        detect();
    }, [editPopupOpen, editLoading, editCountry]);

    const getStorePayload = (addressOverride?: { address: string | null; city: string | null; postal_code: string | null; country: string | null } | null) => {
        let address = storeAddress.trim() || null;
        let city = storeCity.trim() || null;
        let postal_code = storePostalCode.trim() || null;
        let country = storeCountry.trim() || null;
        if (sameAsBillingAddress && addressOverride) {
            address = addressOverride.address;
            city = addressOverride.city;
            postal_code = addressOverride.postal_code;
            country = addressOverride.country;
        }
        return {
            name: storeName.trim(),
            address,
            city,
            postal_code,
            country,
            phone: storePhone.trim() || null,
            email: storeEmail.trim() || null
        };
    };

    const validateStoreForm = () => {
        const errs: Record<string, string> = {};
        if (!storeName.trim()) errs.name = "Το όνομα καταστήματος είναι υποχρεωτικό";
        setFormErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const refreshStores = async () => {
        const { companies } = await me();
        setCompanies(companies);
        const updated = companies.find((c) => c.id === activeCompany?.id);
        if (updated) setActiveCompany(updated);
        await queryClient.invalidateQueries({ queryKey: ["stores-capacity"] });
        await queryClient.invalidateQueries({ queryKey: ["subscription"] });
    };

    const handleClosePopup = () => {
        setPopupOpen(false);
        setPendingVerify(null);
        setIsProcessing(false);
        setSameAsBillingAddress(true);
        setStoreName("");
        setStoreAddress("");
        setStoreCity("");
        setStorePostalCode("");
        setStoreCountry("");
        setStorePhone("");
        setStoreEmail("");
        setFormErrors({});
    };

    const handleOpenEditStore = async (storeId: string) => {
        setPopupOpen(false); // ensure Add popup is closed
        setEditStoreId(storeId);
        setEditPopupOpen(true);
        setEditLoading(true);
        setEditFormErrors({});
        try {
            const res = await axiosPrivate.get(`/api/shared/company/stores/${storeId}`);
            if (res.data?.success && res.data?.data) {
                const store = res.data.data;
                setEditName(store.name || "");
                setEditPhone(store.phone || "");
                setEditEmail(store.email || "");
                setEditAddress(store.address || "");
                setEditCity(store.city || "");
                setEditPostalCode(store.postal_code || "");
                setEditCountry(store.country || "");
            } else {
                showToast({ message: "Δεν βρέθηκε το κατάστημα", type: "error" });
                setEditPopupOpen(false);
            }
        } catch {
            showToast({ message: "Σφάλμα κατά τη φόρτωση του καταστήματος", type: "error" });
            setEditPopupOpen(false);
        } finally {
            setEditLoading(false);
        }
    };

    const handleCloseEditPopup = () => {
        setEditPopupOpen(false);
        setEditStoreId(null);
        setEditName("");
        setEditPhone("");
        setEditEmail("");
        setEditAddress("");
        setEditCity("");
        setEditPostalCode("");
        setEditCountry("");
        setEditFormErrors({});
    };

    const validateEditStoreForm = () => {
        const errs: Record<string, string> = {};
        if (!editName.trim()) errs.name = "Το όνομα καταστήματος είναι υποχρεωτικό";
        setEditFormErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSaveEditStore = async () => {
        if (!validateEditStoreForm() || !editStoreId) return;
        setEditLoading(true);
        try {
            const res = await axiosPrivate.patch(`/api/shared/company/stores/${editStoreId}`, {
                name: editName.trim(),
                phone: editPhone.trim() || null,
                email: editEmail.trim() || null,
                address: editAddress.trim() || null,
                city: editCity.trim() || null,
                postal_code: editPostalCode.trim() || null,
                country: editCountry.trim() || null
            });
            if (res.data?.success) {
                showToast({ message: "Το κατάστημα ενημερώθηκε επιτυχώς", type: "success" });
                await refreshStores();
                handleCloseEditPopup();
            } else {
                showToast({ message: res.data?.message || "Σφάλμα", type: "error" });
            }
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } } };
            showToast({ message: e.response?.data?.message || "Σφάλμα κατά την ενημέρωση", type: "error" });
        } finally {
            setEditLoading(false);
        }
    };

    const handleRetryVerify = async () => {
        if (!pendingVerify) return;
        setIsProcessing(true);
        try {
            const res = await axiosPrivate.post("/api/billing/verify-add-extra-store", {
                subscriptionId: pendingVerify.subscriptionId,
                invoiceId: pendingVerify.invoiceId,
                store: pendingVerify.store
            });
            if (res.data.success) {
                showToast({ message: "Το κατάστημα δημιουργήθηκε επιτυχώς", type: "success" });
                await refreshStores();
                setPendingVerify(null);
                handleClosePopup();
            } else {
                showToast({ message: "Η πληρωμή επεξεργάζεται ακόμα. Δοκιμάστε ξανά σε λίγο.", type: "warning" });
            }
        } catch {
            showToast({ message: "Η πληρωμή επεξεργάζεται ακόμα. Δοκιμάστε ξανά σε λίγο.", type: "warning" });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleScheduleRemove = async () => {
        if (!scheduleRemoveStoreId) return;
        const storeIdToSchedule = scheduleRemoveStoreId;
        setScheduleRemoveLoading(true);
        try {
            const res = await axiosPrivate.patch(`/api/shared/company/stores/${storeIdToSchedule}/schedule-remove`);
            if (res.data?.success) {
                const scheduledAt = res.data.data?.scheduled_deactivate_at ?? subscription?.current_period_end;
                if (scheduledAt && activeCompany) {
                    const updatedStores = (activeCompany.stores ?? []).map((s) =>
                        s.id === storeIdToSchedule ? { ...s, scheduled_deactivate_at: scheduledAt } : s
                    );
                    const updatedCompany = { ...activeCompany, stores: updatedStores };
                    setActiveCompany(updatedCompany);
                    setCompanies((prev) =>
                        prev.map((c) => (c.id === activeCompany.id ? updatedCompany : c))
                    );
                }
                showToast({ message: res.data.message || "Η αφαίρεση προγραμματίστηκε", type: "success" });
                setScheduleRemoveStoreId(null);
                await refreshStores();
            } else {
                showToast({ message: res.data?.message || "Σφάλμα", type: "error" });
            }
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } } };
            showToast({ message: e.response?.data?.message || "Σφάλμα", type: "error" });
        } finally {
            setScheduleRemoveLoading(false);
        }
    };

    const handleCancelScheduleRemove = async (storeId: string) => {
        try {
            const res = await axiosPrivate.patch(`/api/shared/company/stores/${storeId}/cancel-schedule-remove`);
            if (res.data?.success) {
                showToast({ message: res.data.message || "Η αφαίρεση ακυρώθηκε", type: "success" });
                await refreshStores();
            } else {
                showToast({ message: res.data?.message || "Σφάλμα", type: "error" });
            }
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } } };
            showToast({ message: e.response?.data?.message || "Σφάλμα", type: "error" });
        }
    };

    const handleReactivate = async (storeId: string) => {
        setReactivateStoreId(storeId);
        setReactivateLoading(true);
        try {
            const res = await axiosPrivate.post("/api/billing/reactivate-store", { storeId });
            if (res.data?.success) {
                showToast({ message: res.data.message || "Το κατάστημα επαναφέρθηκε", type: "success" });
                await refreshStores();
                setReactivateStoreId(null);
                setReactivateLoading(false);
                return;
            }
            if ((res.data?.code === "REQUIRES_PAYMENT" || res.data?.code === "REQUIRES_ACTION") && res.data?.data?.clientSecret) {
                const stripe = await stripePromise;
                if (!stripe) {
                    showToast({ message: "Stripe δεν είναι διαθέσιμο", type: "error" });
                    setReactivateLoading(false);
                    return;
                }
                const { error } = await stripe.confirmPayment({
                    clientSecret: res.data.data.clientSecret,
                    redirect: "if_required",
                    confirmParams: res.data.data.paymentMethodId ? { payment_method: res.data.data.paymentMethodId, return_url: window.location.href } : undefined
                });
                if (error) {
                    showToast({ message: error.message || "Η πληρωμή απέτυχε", type: "error" });
                    setReactivateLoading(false);
                    return;
                }
                const verifyRes = await axiosPrivate.post("/api/billing/verify-reactivate-store", {
                    subscriptionId: res.data.data.subscriptionId,
                    invoiceId: res.data.data.invoiceId,
                    storeId
                });
                if (verifyRes.data?.success) {
                    showToast({ message: "Το κατάστημα επαναφέρθηκε επιτυχώς", type: "success" });
                    await refreshStores();
                } else {
                    setPendingReactivateVerify({ subscriptionId: res.data.data.subscriptionId, invoiceId: res.data.data.invoiceId, storeId });
                    showToast({ message: "Η πληρωμή επεξεργάζεται. Κάντε κλικ στο 'Ξανά έλεγχος'.", type: "warning" });
                }
                setReactivateStoreId(null);
            } else {
                showToast({ message: res.data?.message || "Σφάλμα", type: "error" });
            }
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } } };
            showToast({ message: e.response?.data?.message || "Σφάλμα", type: "error" });
        } finally {
            setReactivateLoading(false);
        }
    };

    const handleRetryReactivateVerify = async () => {
        if (!pendingReactivateVerify) return;
        try {
            const res = await axiosPrivate.post("/api/billing/verify-reactivate-store", {
                subscriptionId: pendingReactivateVerify.subscriptionId,
                invoiceId: pendingReactivateVerify.invoiceId,
                storeId: pendingReactivateVerify.storeId
            });
            if (res.data?.success) {
                showToast({ message: "Το κατάστημα επαναφέρθηκε επιτυχώς", type: "success" });
                await refreshStores();
                setPendingReactivateVerify(null);
            } else {
                showToast({ message: "Η πληρωμή επεξεργάζεται ακόμα.", type: "warning" });
            }
        } catch {
            showToast({ message: "Η πληρωμή επεξεργάζεται ακόμα.", type: "warning" });
        }
    };

    const handleAddStore = async () => {
        if (!validateStoreForm()) return;

        let addressOverride: { address: string | null; city: string | null; postal_code: string | null; country: string | null } | null = null;
        if (sameAsBillingAddress) {
            if (subscription?.billingInfo) {
                addressOverride = {
                    address: subscription.billingInfo.address || null,
                    city: subscription.billingInfo.city || null,
                    postal_code: subscription.billingInfo.postalCode || null,
                    country: subscription.billingInfo.country || null
                };
            } else if (needsPayment && selectedBillingMethod === "new" && billingFormRef.current) {
                const { data } = billingFormRef.current.getData();
                if (data) {
                    addressOverride = {
                        address: data.address || null,
                        city: data.city || null,
                        postal_code: data.postalCode || null,
                        country: data.country || null
                    };
                }
            }
        }

        const storePayload = getStorePayload(addressOverride);

        try {
            setIsProcessing(true);

            if (capacity && capacity.free_slots > 0) {
                const res = await axiosPrivate.post("/api/shared/company/stores", storePayload);
                if (res.data.success) {
                    showToast({ message: "Το κατάστημα δημιουργήθηκε επιτυχώς", type: "success" });
                    await refreshStores();
                    handleClosePopup();
                } else if (res.data.code === "NEEDS_PAYMENT" || res.data.code === "PLAN_STORE_LIMIT") {
                    await queryClient.invalidateQueries({ queryKey: ["stores-capacity"] });
                    showToast({ message: "Απαιτείται πληρωμή για προσθήκη. Συμπληρώστε τα στοιχεία χρέωσης.", type: "info" });
                } else {
                    showToast({ message: res.data.message || "Σφάλμα", type: "error" });
                }
                setIsProcessing(false);
                return;
            }

            if (!needsPayment) {
                showToast({ message: "Δεν μπορείτε να προσθέσετε περισσότερα καταστήματα.", type: "error" });
                setIsProcessing(false);
                return;
            }

            let paymentMethodId: string | null = null;
            let billingInfo: Record<string, string> | null = null;

            if (selectedPaymentMethod === "new" && paymentFormRef.current) {
                const { paymentMethodId: pmId, error } = await paymentFormRef.current.submit();
                if (error) {
                    showToast({ message: error, type: "error" });
                    setIsProcessing(false);
                    return;
                }
                paymentMethodId = pmId;
            }

            if (selectedBillingMethod === "new" && billingFormRef.current) {
                const { data, error } = billingFormRef.current.getData();
                if (error) {
                    showToast({ message: error, type: "error" });
                    setIsProcessing(false);
                    return;
                }
                if (data) {
                    billingInfo = {
                        name: data.name || "",
                        taxId: data.taxId || "",
                        address: data.address || "",
                        city: data.city || "",
                        postalCode: data.postalCode || "",
                        country: data.country || ""
                    };
                }
            }

            const res = await axiosPrivate.post("/api/billing/add-extra-store", {
                store: storePayload,
                paymentMethodId,
                billingInfo
            });

            const { success, code, data, message } = res.data;

            if (success) {
                showToast({ message: message || "Το κατάστημα δημιουργήθηκε επιτυχώς", type: "success" });
                await refreshStores();
                handleClosePopup();
                setIsProcessing(false);
                return;
            }

            if ((code === "REQUIRES_PAYMENT" || code === "REQUIRES_ACTION") && data?.clientSecret) {
                const stripe = await stripePromise;
                if (!stripe) {
                    showToast({ message: "Stripe δεν είναι διαθέσιμο", type: "error" });
                    setIsProcessing(false);
                    return;
                }

                const confirmOptions: { clientSecret: string; redirect: "if_required"; confirmParams?: { payment_method?: string; return_url: string } } = {
                    clientSecret: data.clientSecret,
                    redirect: "if_required"
                };
                if (selectedPaymentMethod === "existing" && data.paymentMethodId) {
                    confirmOptions.confirmParams = {
                        payment_method: data.paymentMethodId,
                        return_url: window.location.href
                    };
                }

                const { error } = await stripe.confirmPayment(confirmOptions);

                if (error) {
                    showToast({ message: error.message || "Η πληρωμή απέτυχε", type: "error" });
                    setIsProcessing(false);
                    return;
                }

                try {
                    const verifyRes = await axiosPrivate.post("/api/billing/verify-add-extra-store", {
                        subscriptionId: data.subscriptionId,
                        invoiceId: data.invoiceId,
                        store: storePayload
                    });
                    if (verifyRes.data.success) {
                        showToast({ message: "Το κατάστημα δημιουργήθηκε επιτυχώς", type: "success" });
                        await refreshStores();
                        handleClosePopup();
                    } else {
                        setPendingVerify({
                            subscriptionId: data.subscriptionId,
                            invoiceId: data.invoiceId,
                            store: storePayload
                        });
                        showToast({
                            message: "Η πληρωμή επεξεργάζεται. Κάντε κλικ στο 'Ξανά έλεγχος'.",
                            type: "warning"
                        });
                    }
                } catch {
                    setPendingVerify({
                        subscriptionId: data.subscriptionId,
                        invoiceId: data.invoiceId,
                        store: storePayload
                    });
                    showToast({
                        message: "Η πληρωμή επεξεργάζεται. Κάντε κλικ στο 'Ξανά έλεγχος'.",
                        type: "warning"
                    });
                }
            } else {
                showToast({ message: message || "Σφάλμα", type: "error" });
            }
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string; code?: string } } };
            const code = e.response?.data?.code;
            if (code === "NEEDS_PAYMENT" || code === "PLAN_STORE_LIMIT") {
                queryClient.invalidateQueries({ queryKey: ["stores-capacity"] });
                showToast({
                    message: code === "PLAN_STORE_LIMIT"
                        ? "Έχετε φτάσει το όριο. Αναβαθμίστε το πλάνο ή συμπληρώστε τα στοιχεία χρέωσης για επιπλέον κατάστημα."
                        : "Απαιτείται πληρωμή για προσθήκη. Συμπληρώστε τα στοιχεία χρέωσης.",
                    type: "info"
                });
            } else {
                showToast({ message: e.response?.data?.message || "Σφάλμα", type: "error" });
            }
        } finally {
            setIsProcessing(false);
        }
    };

    if (capacityLoading) {
        return (
            <div className={styles.wrapper}>
                <LoadingSpinner />
            </div>
        );
    }

    const capacitySubtitle = capacity
        ? capacity.free_slots > 0
            ? `${capacity.active_store_count} από ${capacity.included_branches} δωρεάν`
            : capacity.canAddExtraStores
            ? `${capacity.active_store_count}/${capacity.max_stores} καταστήματα, +1 = €${capacity.extra_store_unit_price_monthly}/μήνα`
            : `${capacity.active_store_count}/${capacity.max_stores} καταστήματα`
        : "";

    return (
        <div className={styles.wrapper}>
            <div className={styles.headerRow}>
                <p className={styles.subtitle}>{capacitySubtitle}</p>
            </div>

            {isBasicAtLimit && (
                <div className={styles.upgradeNotice}>
                    <AlertCircle size={20} className={styles.upgradeNoticeIcon} />
                    <div className={styles.upgradeNoticeContent}>
                        <p className={styles.upgradeNoticeText}>
                            Δεν μπορείτε να προσθέσετε περισσότερα καταστήματα με το τρέχον πλάνο. Αναβαθμίστε για πρόσβαση.
                        </p>
                        <Link to="/settings/subscription" className={styles.upgradeLink}>
                            Αναβάθμιση για προσθήκη
                            <ArrowRight size={14} />
                        </Link>
                    </div>
                </div>
            )}

            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Λίστα καταστημάτων</h3>
                <div className={styles.storeList}>
                    {stores.length === 0 ? (
                        <p className={styles.sectionHint}>Δεν υπάρχουν καταστήματα.</p>
                    ) : (
                        stores.map((s) => {
                            const isInactive = s.is_active === false;
                            const isScheduled = !!(s as { scheduled_deactivate_at?: string | null }).scheduled_deactivate_at;
                            const canReactivate = isInactive && (
                                (capacity?.free_slots ?? 0) > 0 ||
                                ((capacity?.free_slots ?? 0) <= 0 && (capacity?.canAddExtraStores ?? false))
                            );
                            const cardClass = [
                                styles.storeCard,
                                isInactive && styles.storeCardInactive,
                                isScheduled && styles.storeCardScheduled
                            ].filter(Boolean).join(" ");

                            return (
                                <div key={s.id} className={cardClass}>
                                    <div className={styles.storeInfo}>
                                        <span className={styles.storeName}>
                                            {s.name}
                                            {s.is_main && <span className={styles.mainBadge}>Κεντρικό</span>}
                                            {isInactive && <span className={styles.inactiveBadge}>Ανενεργό</span>}
                                            {isScheduled && (
                                                <span className={styles.scheduledBadge}>
                                                    Αφαιρείται στις{" "}
                                                    {new Date((s as { scheduled_deactivate_at?: string }).scheduled_deactivate_at!).toLocaleDateString("el-GR", {
                                                        day: "numeric",
                                                        month: "long",
                                                        year: "numeric"
                                                    })}
                                                </span>
                                            )}
                                        </span>
                                        {(s.address || s.city || s.country) && (
                                            <span className={styles.storeAddress}>
                                                {[s.address, s.city, s.country].filter(Boolean).join(", ")}
                                            </span>
                                        )}
                                    </div>
                                    <div className={styles.storeCardActions}>
                                        {!s.is_main && !isInactive && !isScheduled && (
                                            <button
                                                type="button"
                                                className={styles.removeBtn}
                                                onClick={() => setScheduleRemoveStoreId(s.id)}
                                                title="Αφαίρεση από συνδρομή"
                                            >
                                                <Trash2 size={14} />
                                                Αφαίρεση από συνδρομή
                                            </button>
                                        )}
                                        {!s.is_main && isScheduled && (
                                            <button
                                                type="button"
                                                className={styles.cancelScheduleBtn}
                                                onClick={() => handleCancelScheduleRemove(s.id)}
                                                disabled={scheduleRemoveLoading}
                                                title="Ακύρωση αφαίρεσης"
                                            >
                                                Ακύρωση αφαίρεσης
                                            </button>
                                        )}
                                        {isInactive && canReactivate && (
                                            <button
                                                type="button"
                                                className={styles.reactivateBtn}
                                                onClick={() =>
                                                    pendingReactivateVerify?.storeId === s.id
                                                        ? handleRetryReactivateVerify()
                                                        : handleReactivate(s.id)
                                                }
                                                disabled={reactivateLoading && reactivateStoreId !== s.id}
                                                title={pendingReactivateVerify?.storeId === s.id ? "Ξανά έλεγχος" : "Επαναφορά"}
                                            >
                                                <RotateCcw size={14} />
                                                {pendingReactivateVerify?.storeId === s.id ? "Ξανά έλεγχος" : "Επαναφορά"}
                                            </button>
                                        )}
                                        {!isInactive && (
                                            <button
                                                type="button"
                                                className={styles.editStoreBtn}
                                                onClick={() => handleOpenEditStore(s.id)}
                                                title="Επεξεργασία"
                                                aria-label="Επεξεργασία καταστήματος"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
                {!isBasicAtLimit && (
                    <div style={{ marginTop: 16 }}>
                        <button
                            type="button"
                            className={styles.formInput}
                            style={{ cursor: "pointer", background: "#3b82f6", color: "white", fontWeight: 600 }}
                            onClick={() => { setEditPopupOpen(false); setPopupOpen(true); }}
                        >
                            <Plus size={16} style={{ verticalAlign: "middle", marginRight: 8 }} />
                            Προσθήκη καταστήματος
                        </button>
                    </div>
                )}
            </div>

            {/* Schedule remove confirmation */}
            <SidePopup
                isOpen={!!scheduleRemoveStoreId}
                onClose={() => setScheduleRemoveStoreId(null)}
                title="Αφαίρεση από συνδρομή"
                width="420px"
                footerLeftButton={{
                    label: "Κλείσιμο",
                    variant: "outline",
                    onClick: () => setScheduleRemoveStoreId(null),
                    show: true
                }}
                footerRightButton={{
                    label: scheduleRemoveLoading ? "Επεξεργασία..." : "Επιβεβαίωση",
                    variant: "primary",
                    onClick: handleScheduleRemove,
                    show: true,
                    disabled: scheduleRemoveLoading,
                    loading: scheduleRemoveLoading
                }}
            >
                {scheduleRemoveStoreId && (
                    <p className={styles.prorationNotice}>
                        Το κατάστημα θα αφαιρεθεί από τη συνδρομή στις{" "}
                        {subscription?.current_period_end
                            ? new Date(subscription.current_period_end).toLocaleDateString("el-GR", {
                                  day: "numeric",
                                  month: "long",
                                  year: "numeric"
                              })
                            : "τέλος του τρέχοντος κύκλου"}
                        . Θα παραμείνει ορατό αλλά περιορισμένο (χωρίς πωλήσεις, αποθέματα κ.λπ.).
                    </p>
                )}
            </SidePopup>

            <SidePopup
                isOpen={popupOpen}
                onClose={handleClosePopup}
                title="Προσθήκη καταστήματος"
                width="520px"
                footerLeftButton={{
                    label: "Κλείσιμο",
                    variant: "outline",
                    onClick: handleClosePopup,
                    show: true
                }}
                footerRightButton={{
                    label: pendingVerify
                        ? (isProcessing ? "Επεξεργασία..." : "Ξανά έλεγχος")
                        : (isProcessing ? "Επεξεργασία..." : "Προσθήκη"),
                    variant: "primary",
                    onClick: pendingVerify ? handleRetryVerify : handleAddStore,
                    show: true,
                    widthFull: true,
                    disabled: isProcessing,
                    loading: isProcessing
                }}
            >
                <div className={styles.addStoreForm}>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Όνομα καταστήματος *</label>
                        <input
                            type="text"
                            className={styles.formInput}
                            value={storeName}
                            onChange={(e) => setStoreName(e.target.value)}
                            placeholder="π.χ. Κεντρική Αποθήκη"
                        />
                        {formErrors.name && <span className={styles.formError}>{formErrors.name}</span>}
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Τηλέφωνο</label>
                        <input
                            type="text"
                            className={styles.formInput}
                            value={storePhone}
                            onChange={(e) => setStorePhone(e.target.value)}
                            placeholder="π.χ. +30 210 1234567"
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Email</label>
                        <input
                            type="email"
                            className={styles.formInput}
                            value={storeEmail}
                            onChange={(e) => setStoreEmail(e.target.value)}
                            placeholder="π.χ. store@company.com"
                        />
                    </div>
                    <label className={styles.checkboxRow}>
                        <input
                            type="checkbox"
                            checked={sameAsBillingAddress}
                            onChange={(e) => setSameAsBillingAddress(e.target.checked)}
                        />
                        <span style={{ fontSize: 14, textAlign: "left", paddingLeft: 10 }}>Η διεύθυνση του καταστήματος είναι ίδια με τη διεύθυνση χρέωσης</span>
                    </label>
                    {!sameAsBillingAddress && (
                        <>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Διεύθυνση</label>
                                <input
                                    type="text"
                                    className={styles.formInput}
                                    value={storeAddress}
                                    onChange={(e) => setStoreAddress(e.target.value)}
                                    placeholder="Οδός, Αριθμός"
                                />
                            </div>
                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Πόλη</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={storeCity}
                                        onChange={(e) => setStoreCity(e.target.value)}
                                        placeholder="π.χ. Αθήνα"
                                    />
                                </div>
                                <div className={styles.formGroupSmall}>
                                    <label className={styles.formLabel}>Τ.Κ.</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={storePostalCode}
                                        onChange={(e) => setStorePostalCode(e.target.value)}
                                        placeholder="π.χ. 10563"
                                    />
                                </div>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Χώρα</label>
                                <select
                                    className={styles.formSelect}
                                    value={storeCountry || ""}
                                    onChange={(e) => setStoreCountry(e.target.value)}
                                >
                                    <option value="">Επιλέξτε χώρα</option>
                                    {countryList.map(({ code, name }) => (
                                        <option key={code} value={code}>
                                            {name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}

                    {needsPayment && (
                        <>
                            <div className={previewStyles.previewSection}>
                                <h3 className={previewStyles.previewSectionTitle}>Στοιχεία Χρέωσης</h3>
                                <div className={previewStyles.billingMethodOptions}>
                                    {subscription?.billingInfo ? (
                                        <div className={previewStyles.optionsRow}>
                                            <div
                                                className={`${previewStyles.billingOption} ${selectedBillingMethod === "existing" ? previewStyles.active : ""}`}
                                                onClick={() => setSelectedBillingMethod("existing")}
                                            >
                                                <div className={previewStyles.radioOuter}>
                                                    {selectedBillingMethod === "existing" && <div className={previewStyles.radioInner} />}
                                                </div>
                                                <div className={previewStyles.billingOptionInfo}>
                                                    <strong>{subscription.billingInfo.name}</strong>
                                                    <span className={previewStyles.billingAddress}>
                                                        {subscription.billingInfo.address}, {subscription.billingInfo.city}{subscription.billingInfo.country ? `, ${subscription.billingInfo.country}` : ''}
                                                    </span>
                                                </div>
                                            </div>
                                            <div
                                                className={`${previewStyles.billingOption} ${selectedBillingMethod === "new" ? previewStyles.active : ""}`}
                                                onClick={() => setSelectedBillingMethod("new")}
                                            >
                                                <div className={previewStyles.radioOuter}>
                                                    {selectedBillingMethod === "new" && <div className={previewStyles.radioInner} />}
                                                </div>
                                                <div className={previewStyles.billingOptionInfo}>
                                                    <strong>Νέα στοιχεία χρέωσης</strong>
                                                    <span>Προσθήκη νέων στοιχείων τιμολόγησης</span>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            className={`${previewStyles.billingOption} ${previewStyles.active}`}
                                            onClick={() => setSelectedBillingMethod("new")}
                                        >
                                            <div className={previewStyles.radioOuter}>
                                                <div className={previewStyles.radioInner} />
                                            </div>
                                            <div className={previewStyles.billingOptionInfo}>
                                                <strong>Νέα στοιχεία χρέωσης</strong>
                                                <span>Προσθήκη νέων στοιχείων τιμολόγησης</span>
                                            </div>
                                        </div>
                                    )}
                                    {selectedBillingMethod === "new" && (
                                        <div className={previewStyles.billingFormWrapper}>
                                            <BillingInfoForm
                                                ref={billingFormRef}
                                                onCountryChange={(c) => setAddStorePreviewCountry(c)}
                                                onTaxIdChange={(v) => setAddStorePreviewTaxId(v)}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className={previewStyles.previewSection}>
                                <h3 className={previewStyles.previewSectionTitle}>Τρόπος Πληρωμής</h3>
                                <div className={previewStyles.paymentMethodOptions}>
                                    {subscription?.card ? (
                                        <div className={previewStyles.optionsRow}>
                                            <div
                                                className={`${previewStyles.paymentOption} ${selectedPaymentMethod === "existing" ? previewStyles.active : ""}`}
                                                onClick={() => setSelectedPaymentMethod("existing")}
                                            >
                                                <div className={previewStyles.radioOuter}>
                                                    {selectedPaymentMethod === "existing" && <div className={previewStyles.radioInner} />}
                                                </div>
                                                <div className={previewStyles.paymentOptionInfo}>
                                                    <div className={previewStyles.cardRow}>
                                                        <CreditCard size={18} />
                                                        <strong>{subscription.card.brand?.toUpperCase()}</strong>
                                                        <span>•••• {subscription.card.last4}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div
                                                className={`${previewStyles.paymentOption} ${selectedPaymentMethod === "new" ? previewStyles.active : ""}`}
                                                onClick={() => setSelectedPaymentMethod("new")}
                                            >
                                                <div className={previewStyles.radioOuter}>
                                                    {selectedPaymentMethod === "new" && <div className={previewStyles.radioInner} />}
                                                </div>
                                                <div className={previewStyles.paymentOptionInfo}>
                                                    <strong>Νέα κάρτα</strong>
                                                    <span>Προσθήκη νέας κάρτας πληρωμής</span>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            className={`${previewStyles.paymentOption} ${previewStyles.active}`}
                                            onClick={() => setSelectedPaymentMethod("new")}
                                        >
                                            <div className={previewStyles.radioOuter}>
                                                <div className={previewStyles.radioInner} />
                                            </div>
                                            <div className={previewStyles.paymentOptionInfo}>
                                                <strong>Νέα κάρτα</strong>
                                                <span>Προσθήκη νέας κάρτας πληρωμής</span>
                                            </div>
                                        </div>
                                    )}
                                    {selectedPaymentMethod === "new" && (
                                        <div className={previewStyles.paymentFormWrapper}>
                                            <PaymentForm ref={paymentFormRef} onSetupError={(e) => showToast({ message: e, type: "error" })} />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className={previewStyles.previewSection}>
                                <h3 className={previewStyles.previewSectionTitle}>Χρέωση Σήμερα</h3>
                                <div className={previewStyles.previewCard}>
                                    {addStorePreviewLoading ? (
                                        <div className={previewStyles.skeleton} style={{ width: 200 }} />
                                    ) : addStorePreview ? (
                                        <>
                                            <div className={previewStyles.previewRow}>
                                                <span className={previewStyles.previewLabel}>
                                                    {addStorePreview.proration.description}
                                                </span>
                                                <span className={previewStyles.previewValue}>
                                                    {addStorePreview.proration.total}{addStorePreview.currency.symbol}
                                                </span>
                                            </div>
                                            <div className={previewStyles.previewBreakdown}>
                                                <div className={previewStyles.previewBreakdownRow}>
                                                    <span>Υποσύνολο</span>
                                                    <span>{addStorePreview.proration.amount}{addStorePreview.currency.symbol}</span>
                                                </div>
                                                <div className={previewStyles.previewBreakdownRow}>
                                                    <span>ΦΠΑ {addStorePreview.summary?.tax_percent}%</span>
                                                    <span>{addStorePreview.proration.vat}{addStorePreview.currency.symbol}</span>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <span className={styles.prorationNotice}>
                                            Θα χρεωθείτε αναλογικά για 1 επιπλέον κατάστημα.
                                        </span>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </SidePopup>

            <SidePopup
                isOpen={editPopupOpen}
                onClose={handleCloseEditPopup}
                title="Επεξεργασία καταστήματος"
                width="520px"
                footerLeftButton={{
                    label: "Κλείσιμο",
                    variant: "outline",
                    onClick: handleCloseEditPopup,
                    show: true
                }}
                footerRightButton={{
                    label: editLoading ? "Επεξεργασία..." : "Αποθήκευση",
                    variant: "primary",
                    onClick: handleSaveEditStore,
                    show: true,
                    widthFull: true,
                    disabled: editLoading,
                    loading: editLoading
                }}
            >
                <div className={styles.addStoreForm}>
                    {editLoading && !editName ? (
                        <LoadingSpinner />
                    ) : (
                        <>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Όνομα καταστήματος *</label>
                                <input
                                    type="text"
                                    className={styles.formInput}
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    placeholder="π.χ. Κεντρική Αποθήκη"
                                />
                                {editFormErrors.name && <span className={styles.formError}>{editFormErrors.name}</span>}
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Τηλέφωνο</label>
                                <input
                                    type="text"
                                    className={styles.formInput}
                                    value={editPhone}
                                    onChange={(e) => setEditPhone(e.target.value)}
                                    placeholder="π.χ. +30 210 1234567"
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Email</label>
                                <input
                                    type="email"
                                    className={styles.formInput}
                                    value={editEmail}
                                    onChange={(e) => setEditEmail(e.target.value)}
                                    placeholder="π.χ. store@company.com"
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Διεύθυνση</label>
                                <input
                                    type="text"
                                    className={styles.formInput}
                                    value={editAddress}
                                    onChange={(e) => setEditAddress(e.target.value)}
                                    placeholder="Οδός, Αριθμός"
                                />
                            </div>
                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Πόλη</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={editCity}
                                        onChange={(e) => setEditCity(e.target.value)}
                                        placeholder="π.χ. Αθήνα"
                                    />
                                </div>
                                <div className={styles.formGroupSmall}>
                                    <label className={styles.formLabel}>Τ.Κ.</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={editPostalCode}
                                        onChange={(e) => setEditPostalCode(e.target.value)}
                                        placeholder="π.χ. 10563"
                                    />
                                </div>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Χώρα</label>
                                <select
                                    className={styles.formSelect}
                                    value={editCountry || ""}
                                    onChange={(e) => setEditCountry(e.target.value)}
                                >
                                    <option value="">Επιλέξτε χώρα</option>
                                    {countryList.map(({ code, name }) => (
                                        <option key={code} value={code}>
                                            {name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}
                </div>
            </SidePopup>
        </div>
    );
}
