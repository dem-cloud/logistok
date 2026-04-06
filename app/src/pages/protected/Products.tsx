import { useState, useCallback, useEffect } from "react";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { useAuth } from "@/contexts/AuthContext";
import {
    useProducts,
    useProduct,
    useProductMutations,
    type Product,
    type CreateProductParams,
} from "@/hooks/useProducts";
import { useProductCategories } from "@/hooks/useProductCategories";
import { useUnits } from "@/hooks/useUnits";
import { useVatRates } from "@/hooks/useVatRates";
import SidePopup from "@/components/reusable/SidePopup";
import Button from "@/components/reusable/Button";
import LoadingSpinner from "@/components/LoadingSpinner";
import styles from "./Products.module.css";

type VariantFormRow = {
    id: string;
    name: string;
    sku: string;
    barcode: string;
    cost_price: string;
    sale_price: string;
};

type Tab = "products" | "categories";

export default function Products() {
    const { showToast } = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>("products");
    const [categoryFilter, setCategoryFilter] = useState<number | "">("");
    const [searchFilter, setSearchFilter] = useState("");
    const [popupOpen, setPopupOpen] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
    const [categoryPopupOpen, setCategoryPopupOpen] = useState(false);
    const [categoryEditId, setCategoryEditId] = useState<number | null>(null);
    const [categoryDeleteConfirmId, setCategoryDeleteConfirmId] = useState<number | null>(null);
    const [categorySearchFilter, setCategorySearchFilter] = useState("");

    const searchDebounced = useDebounce(searchFilter.trim(), 300);
    const { products, isLoading, isFetching } = useProducts({
        categoryId: categoryFilter ? Number(categoryFilter) : undefined,
        search: searchDebounced || undefined,
    });

    const { product: editProduct, isLoading: editLoading } = useProduct(editId);
    const { categories, isLoading: categoriesLoading, createCategory, updateCategory, deleteCategory } =
        useProductCategories();
    const { units } = useUnits();
    const { vatRates, defaultVatRateId } = useVatRates();
    const mutations = useProductMutations();

    const [formName, setFormName] = useState("");
    const [formDescription, setFormDescription] = useState("");
    const [formCategoryId, setFormCategoryId] = useState<number | "">("");
    const [formUnitId, setFormUnitId] = useState<number | "">("");
    const [formVatRateId, setFormVatRateId] = useState<number | "">("");
    const [formVatExempt, setFormVatExempt] = useState(false);
    const [formVariants, setFormVariants] = useState<VariantFormRow[]>([]);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});

    const [catFormName, setCatFormName] = useState("");
    const [catFormParentId, setCatFormParentId] = useState<number | "">("");
    const [catFormErrors, setCatFormErrors] = useState<Record<string, string>>({});

    const resetForm = useCallback(() => {
        setFormName("");
        setFormDescription("");
        setFormCategoryId("");
        setFormUnitId("");
        setFormVatRateId("");
        setFormVatExempt(false);
        setFormVariants([{ id: "0", name: "", sku: "", barcode: "", cost_price: "", sale_price: "" }]);
        setFormErrors({});
    }, []);

    const resetCategoryForm = useCallback(() => {
        setCatFormName("");
        setCatFormParentId("");
        setCatFormErrors({});
    }, []);

    const openCreate = useCallback(() => {
        setEditId(null);
        resetForm();
        setFormVariants([{ id: "0", name: "", sku: "", barcode: "", cost_price: "", sale_price: "" }]);
        setPopupOpen(true);
    }, [resetForm]);

    // When opening create form, default VAT rate to the one with is_default
    useEffect(() => {
        if (popupOpen && !editId && defaultVatRateId != null && formVatRateId === "" && !formVatExempt) {
            setFormVatRateId(defaultVatRateId);
        }
    }, [popupOpen, editId, defaultVatRateId, formVatRateId, formVatExempt]);

    const openEdit = useCallback((product: Product) => {
        setEditId(product.id);
        setFormName(product.name);
        setFormDescription(product.description || "");
        setFormCategoryId(product.product_category_id ?? "");
        setFormUnitId(product.unit_id ?? "");
        setFormVatRateId(product.vat_exempt ? "" : (product.vat_rate?.id ?? ""));
        setFormVatExempt(product.vat_exempt ?? false);
        setFormVariants(
            product.variants.length > 0
                ? product.variants.map((v) => ({
                      id: `v-${v.id}`,
                      name: v.name,
                      sku: v.sku || "",
                      barcode: v.barcode && !String(v.barcode).startsWith("__nb_") ? v.barcode : "",
                      cost_price: v.cost_price != null ? String(v.cost_price) : "",
                      sale_price: v.sale_price != null ? String(v.sale_price) : "",
                  }))
                : [{ id: "0", name: "", sku: "", barcode: "", cost_price: "", sale_price: "" }]
        );
        setFormErrors({});
        setPopupOpen(true);
    }, []);

    const closePopup = useCallback(() => {
        setPopupOpen(false);
        setEditId(null);
        resetForm();
    }, [resetForm]);

    const openCategoryCreate = useCallback(() => {
        setCategoryEditId(null);
        resetCategoryForm();
        setCategoryPopupOpen(true);
    }, [resetCategoryForm]);

    const openCategoryEdit = useCallback(
        (cat: { id: number; name: string; parent_id: number | null }) => {
            setCategoryEditId(cat.id);
            setCatFormName(cat.name);
            setCatFormParentId(cat.parent_id ?? "");
            setCatFormErrors({});
            setCategoryPopupOpen(true);
        },
        []
    );

    const closeCategoryPopup = useCallback(() => {
        setCategoryPopupOpen(false);
        setCategoryEditId(null);
        resetCategoryForm();
    }, [resetCategoryForm]);

    const addVariantRow = () => {
        setFormVariants((prev) => [
            ...prev,
            {
                id: `new-${Date.now()}`,
                name: "",
                sku: "",
                barcode: "",
                cost_price: "",
                sale_price: "",
            },
        ]);
    };

    const removeVariantRow = (id: string) => {
        setFormVariants((prev) => {
            const next = prev.filter((r) => r.id !== id);
            return next.length === 0 ? [{ id: "0", name: "", sku: "", barcode: "", cost_price: "", sale_price: "" }] : next;
        });
    };

    const updateVariantRow = (id: string, field: keyof VariantFormRow, value: string) => {
        setFormVariants((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    };

    const validateForm = (): boolean => {
        const err: Record<string, string> = {};
        if (!formName.trim()) err.name = "Το όνομα προϊόντος είναι υποχρεωτικό";
        const validVariants = formVariants.filter((v) => v.name.trim());
        if (validVariants.length === 0) err.variants = "Χρειάζεται τουλάχιστον μία παραλλαγή με όνομα";
        setFormErrors(err);
        return Object.keys(err).length === 0;
    };

    const handleSave = async () => {
        if (!validateForm()) return;

        const validVariants = formVariants.filter((v) => v.name.trim());
        if (validVariants.length === 0) return;

        const payload: CreateProductParams = {
            name: formName.trim(),
            description: formDescription.trim() || null,
            product_category_id: formCategoryId ? Number(formCategoryId) : null,
            unit_id: formUnitId ? Number(formUnitId) : null,
            vat_rate_id: formVatExempt ? null : (formVatRateId ? Number(formVatRateId) : defaultVatRateId),
            vat_exempt: formVatExempt,
            variants: validVariants.map((v) => ({
                name: v.name.trim(),
                sku: v.sku.trim() || null,
                barcode: v.barcode.trim() || null,
                cost_price: v.cost_price.trim() && !isNaN(Number(v.cost_price)) ? Number(v.cost_price) : null,
                sale_price: v.sale_price.trim() && !isNaN(Number(v.sale_price)) ? Number(v.sale_price) : null,
            })),
        };

        try {
            if (editId) {
                await mutations.updateProduct.mutateAsync({
                    id: editId,
                    name: payload.name,
                    description: payload.description,
                    product_category_id: payload.product_category_id,
                    unit_id: payload.unit_id,
                    vat_rate_id: formVatExempt ? null : (formVatRateId ? Number(formVatRateId) : null),
                    vat_exempt: formVatExempt,
                });
                const currentVariants = editProduct?.variants ?? [];
                for (let i = 0; i < validVariants.length; i++) {
                    const r = validVariants[i];
                    const nameVal = r.name.trim();
                    if (!nameVal) continue;
                    const existing = currentVariants[i];
                    if (existing) {
                        await mutations.updateVariant.mutateAsync({
                            productId: editId,
                            variantId: existing.id,
                            name: nameVal,
                            sku: r.sku.trim() || null,
                            barcode: r.barcode.trim() || null,
                            cost_price: r.cost_price.trim() && !isNaN(Number(r.cost_price)) ? Number(r.cost_price) : null,
                            sale_price: r.sale_price.trim() && !isNaN(Number(r.sale_price)) ? Number(r.sale_price) : null,
                        });
                    } else {
                        await mutations.createVariant.mutateAsync({
                            productId: editId,
                            name: nameVal,
                            sku: r.sku.trim() || null,
                            barcode: r.barcode.trim() || null,
                            cost_price: r.cost_price.trim() && !isNaN(Number(r.cost_price)) ? Number(r.cost_price) : null,
                            sale_price: r.sale_price.trim() && !isNaN(Number(r.sale_price)) ? Number(r.sale_price) : null,
                        });
                    }
                }
                for (let i = validVariants.length; i < currentVariants.length; i++) {
                    await mutations.deleteVariant.mutateAsync({
                        productId: editId,
                        variantId: currentVariants[i].id,
                    });
                }
                showToast({ message: "Το προϊόν ενημερώθηκε επιτυχώς", type: "success" });
            } else {
                await mutations.createProduct.mutateAsync(payload);
                showToast({ message: "Το προϊόν δημιουργήθηκε επιτυχώς", type: "success" });
            }
            closePopup();
        } catch (e: unknown) {
            const err = e as Error;
            showToast({ message: err.message || "Σφάλμα", type: "error" });
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await mutations.deleteProduct.mutateAsync(id);
            showToast({ message: "Το προϊόν διαγράφηκε επιτυχώς", type: "success" });
            setDeleteConfirmId(null);
        } catch (e: unknown) {
            const err = e as Error;
            showToast({ message: err.message || "Σφάλμα", type: "error" });
        }
    };

    const validateCategoryForm = (): boolean => {
        const err: Record<string, string> = {};
        if (!catFormName.trim()) err.name = "Το όνομα κατηγορίας είναι υποχρεωτικό";
        setCatFormErrors(err);
        return Object.keys(err).length === 0;
    };

    const handleCategorySave = async () => {
        if (!validateCategoryForm()) return;
        try {
            if (categoryEditId) {
                await updateCategory.mutateAsync({
                    id: categoryEditId,
                    name: catFormName.trim(),
                    parent_id: catFormParentId ? Number(catFormParentId) : null,
                });
                showToast({ message: "Η κατηγορία ενημερώθηκε επιτυχώς", type: "success" });
            } else {
                await createCategory.mutateAsync({
                    name: catFormName.trim(),
                    parent_id: catFormParentId ? Number(catFormParentId) : null,
                });
                showToast({ message: "Η κατηγορία δημιουργήθηκε επιτυχώς", type: "success" });
            }
            closeCategoryPopup();
        } catch (e: unknown) {
            const err = e as Error;
            showToast({ message: err.message || "Σφάλμα", type: "error" });
        }
    };

    const handleCategoryDelete = async (id: number) => {
        try {
            await deleteCategory.mutateAsync(id);
            showToast({ message: "Η κατηγορία διαγράφηκε επιτυχώς", type: "success" });
            setCategoryDeleteConfirmId(null);
        } catch (e: unknown) {
            const err = e as Error;
            showToast({ message: err.message || "Σφάλμα", type: "error" });
        }
    };

    const categorySearch = categorySearchFilter.trim().toLowerCase();
    const filteredCategories = categorySearch
        ? categories.filter(
              (c) =>
                  c.name.toLowerCase().includes(categorySearch) ||
                  (c.parent?.name?.toLowerCase().includes(categorySearch) ?? false)
          )
        : categories;
    const rootCategories = filteredCategories.filter((c) => !c.parent_id);
    const childCategories = filteredCategories.filter((c) => c.parent_id);

    const showProductsLoading = activeTab === "products" && isLoading && products.length === 0;

    return (
        <div className={styles.wrapper}>
            <div className={styles.headerRow}>
                <h1 className={styles.title}>Προϊόντα</h1>
                <p className={styles.subtitle}>Διαχείριση καταλόγου προϊόντων και κατηγοριών</p>
            </div>

            <div className={styles.tabs}>
                <button
                    type="button"
                    className={`${styles.tab} ${activeTab === "products" ? styles.tabActive : ""}`}
                    onClick={() => setActiveTab("products")}
                >
                    Προϊόντα
                </button>
                <button
                    type="button"
                    className={`${styles.tab} ${activeTab === "categories" ? styles.tabActive : ""}`}
                    onClick={() => setActiveTab("categories")}
                >
                    Κατηγορίες
                </button>
            </div>

            {activeTab === "products" && (
                <>
                    <div className={styles.productsToolbar}>
                        <div className={styles.filtersRow}>
                            <div className={styles.filterGroup}>
                                <label className={styles.filterLabel}>Αναζήτηση</label>
                                <div className={styles.searchWrapper}>
                                    <Search size={16} className={styles.searchIcon} />
                                    <input
                                        type="text"
                                        className={styles.filterInput}
                                        placeholder="Όνομα ή περιγραφή..."
                                        value={searchFilter}
                                        onChange={(e) => setSearchFilter(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className={styles.filterGroup}>
                                <label className={styles.filterLabel}>Κατηγορία</label>
                                <select
                                    className={styles.filterSelect}
                                    value={categoryFilter}
                                    onChange={(e) => setCategoryFilter(e.target.value ? Number(e.target.value) : "")}
                                >
                                    <option value="">Όλες</option>
                                    {categories.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.parent ? `${c.parent.name} → ` : ""}{c.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className={styles.addProductBtn}>
                            <Button variant="primary" onClick={openCreate}>
                                <Plus size={16} />
                                Προσθήκη προϊόντος
                            </Button>
                        </div>
                    </div>

                    <div className={styles.section}>
                        <h3 className={styles.sectionTitle}>Λίστα προϊόντων</h3>
                        {showProductsLoading ? (
                            <div className={styles.listLoading}>
                                <LoadingSpinner />
                            </div>
                        ) : products.length === 0 ? (
                            <p className={styles.sectionHint}>
                                Δεν υπάρχουν προϊόντα. Κάντε κλικ στο «Προσθήκη προϊόντος».
                            </p>
                        ) : (
                            <div className={styles.tableWrapper}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Όνομα</th>
                                            <th>Κατηγορία</th>
                                            <th>Μονάδα</th>
                                            <th>Παραλλαγές</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {products.map((p) => (
                                            <tr key={p.id}>
                                                <td>
                                                    <span className={styles.productName}>{p.name}</span>
                                                </td>
                                                <td>{p.category?.name ?? "—"}</td>
                                                <td>{p.unit?.symbol ?? p.unit?.unit_key ?? "—"}</td>
                                                <td>{p.variants.length}</td>
                                                <td>
                                                    <div className={styles.cellActions}>
                                                        <button
                                                            type="button"
                                                            className={styles.editBtn}
                                                            onClick={() => openEdit(p)}
                                                            title="Επεξεργασία"
                                                        >
                                                            <Pencil size={16} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={styles.deleteBtn}
                                                            onClick={() => setDeleteConfirmId(p.id)}
                                                            title="Διαγραφή"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {isFetching && (
                                    <div className={styles.tableOverlay}>
                                        <LoadingSpinner />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}

            {activeTab === "categories" && (
                <>
                    <div className={styles.productsToolbar}>
                        <div className={styles.filtersRow}>
                            <div className={styles.filterGroup}>
                                <label className={styles.filterLabel}>Αναζήτηση</label>
                                <div className={styles.searchWrapper}>
                                    <Search size={16} className={styles.searchIcon} />
                                    <input
                                        type="text"
                                        className={styles.filterInput}
                                        placeholder="Όνομα ή γονική κατηγορία..."
                                        value={categorySearchFilter}
                                        onChange={(e) => setCategorySearchFilter(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className={styles.addProductBtn}>
                            <Button variant="primary" onClick={openCategoryCreate}>
                                <Plus size={16} />
                                Προσθήκη κατηγορίας
                            </Button>
                        </div>
                    </div>

                    <div className={styles.section}>
                        <h3 className={styles.sectionTitle}>Λίστα κατηγοριών</h3>

                        {categoriesLoading ? (
                        <LoadingSpinner />
                    ) : filteredCategories.length === 0 ? (
                        <p className={styles.sectionHint}>
                            {categories.length === 0
                                ? "Δεν υπάρχουν κατηγορίες. Κάντε κλικ στο «Προσθήκη κατηγορίας»."
                                : "Δεν βρέθηκαν κατηγορίες για την αναζήτησή σας."}
                        </p>
                    ) : (
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Όνομα</th>
                                        <th>Γονική κατηγορία</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...rootCategories, ...childCategories].map((c) => (
                                        <tr key={c.id}>
                                            <td>
                                                <span className={styles.productName}>{c.name}</span>
                                            </td>
                                            <td>{c.parent?.name ?? "—"}</td>
                                            <td>
                                                <div className={styles.cellActions}>
                                                    <button
                                                        type="button"
                                                        className={styles.editBtn}
                                                        onClick={() => openCategoryEdit(c)}
                                                        title="Επεξεργασία"
                                                    >
                                                        <Pencil size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={styles.deleteBtn}
                                                        onClick={() => setCategoryDeleteConfirmId(c.id)}
                                                        title="Διαγραφή"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    </div>
                </>
            )}

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
                        loading: mutations.deleteProduct.isPending,
                    }}
                >
                    <p className={styles.deleteConfirmText}>
                        Θέλετε να διαγράψετε αυτό το προϊόν; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.
                    </p>
                </SidePopup>
            )}

            {categoryDeleteConfirmId && (
                <SidePopup
                    isOpen={!!categoryDeleteConfirmId}
                    onClose={() => setCategoryDeleteConfirmId(null)}
                    title="Επιβεβαίωση διαγραφής"
                    footerLeftButton={{
                        label: "Κλείσιμο",
                        onClick: () => setCategoryDeleteConfirmId(null),
                        variant: "outline",
                    }}
                    footerRightButton={{
                        label: "Διαγραφή",
                        onClick: () => handleCategoryDelete(categoryDeleteConfirmId!),
                        variant: "danger",
                        loading: deleteCategory.isPending,
                    }}
                >
                    <p className={styles.deleteConfirmText}>
                        Θέλετε να διαγράψετε αυτή την κατηγορία; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.
                    </p>
                </SidePopup>
            )}

            <SidePopup
                isOpen={popupOpen}
                onClose={closePopup}
                title={editId ? "Επεξεργασία προϊόντος" : "Νέο προϊόν"}
                width="720px"
                footerLeftButton={{
                    label: "Κλείσιμο",
                    onClick: closePopup,
                    variant: "outline",
                }}
                footerRightButton={{
                    label: "Αποθήκευση",
                    onClick: handleSave,
                    variant: "primary",
                    loading:
                        mutations.createProduct.isPending ||
                        mutations.updateProduct.isPending ||
                        mutations.createVariant.isPending ||
                        mutations.updateVariant.isPending ||
                        mutations.deleteVariant.isPending,
                }}
            >
                {editLoading && editId ? (
                    <LoadingSpinner />
                ) : (
                    <div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Όνομα προϊόντος *</label>
                            <input
                                type="text"
                                className={styles.formInput}
                                value={formName}
                                onChange={(e) => setFormName(e.target.value)}
                                placeholder="π.χ. Άμμος Μπετού"
                            />
                            {formErrors.name && (
                                <span className={styles.formError}>{formErrors.name}</span>
                            )}
                        </div>

                        <div className={styles.formGroup} style={{ marginTop: 16 }}>
                            <label className={styles.formLabel}>Περιγραφή</label>
                            <textarea
                                className={styles.formInput}
                                value={formDescription}
                                onChange={(e) => setFormDescription(e.target.value)}
                                placeholder="Προαιρετική περιγραφή"
                                rows={2}
                                style={{ height: "auto", minHeight: 60 }}
                            />
                        </div>

                        <div className={styles.formRow} style={{ marginTop: 16 }}>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Κατηγορία</label>
                                <select
                                    className={styles.formSelect}
                                    value={formCategoryId}
                                    onChange={(e) => setFormCategoryId(e.target.value ? Number(e.target.value) : "")}
                                >
                                    <option value="">—</option>
                                    {categories.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.parent ? `${c.parent.name} → ` : ""}{c.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Μονάδα</label>
                                <select
                                    className={styles.formSelect}
                                    value={formUnitId}
                                    onChange={(e) => setFormUnitId(e.target.value ? Number(e.target.value) : "")}
                                >
                                    <option value="">—</option>
                                    {units.map((u) => (
                                        <option key={u.id} value={u.id}>
                                            {u.symbol || u.name_singular} ({u.name_plural})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className={styles.formRow} style={{ marginTop: 16 }}>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Συντελεστής ΦΠΑ</label>
                                <select
                                    className={styles.formSelect}
                                    value={formVatExempt ? "" : (formVatRateId || defaultVatRateId || "")}
                                    onChange={(e) => setFormVatRateId(e.target.value ? Number(e.target.value) : "")}
                                    disabled={formVatExempt}
                                >
                                    <option value="">—</option>
                                    {vatRates.map((r) => (
                                        <option key={r.id} value={r.id}>
                                            {r.name} ({r.rate}%)
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel} htmlFor="product-vat-exempt">
                                    Απαλλαγή ΦΠΑ
                                </label>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        height: 42,
                                    }}
                                >
                                    <input
                                        id="product-vat-exempt"
                                        type="checkbox"
                                        checked={formVatExempt}
                                        onChange={(e) => {
                                            setFormVatExempt(e.target.checked);
                                            if (e.target.checked) setFormVatRateId("");
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className={styles.variantsSection}>
                            <div className={styles.variantsHeader}>
                                <h4 className={styles.variantsTitle}>Παραλλαγές</h4>
                                <button type="button" className={styles.addVariantBtn} onClick={addVariantRow}>
                                    <Plus size={14} />
                                    Προσθήκη παραλλαγής
                                </button>
                            </div>
                            {formErrors.variants && (
                                <span className={styles.formError} style={{ marginBottom: 8, display: "block" }}>
                                    {formErrors.variants}
                                </span>
                            )}
                            <div className={styles.variantHeaderRow}>
                                <span className={styles.variantRowHeader}>Όνομα *</span>
                                <span className={styles.variantRowHeader}>SKU</span>
                                <span className={styles.variantRowHeader}>Barcode</span>
                                <span className={styles.variantRowHeader}>Τιμή αγοράς</span>
                                <span className={styles.variantRowHeader}>Τιμή πώλησης</span>
                                <span />
                            </div>
                            {formVariants.map((row) => (
                                <div key={row.id} className={styles.variantRow}>
                                    <input
                                        type="text"
                                        className={styles.variantInputSmall}
                                        value={row.name}
                                        onChange={(e) => updateVariantRow(row.id, "name", e.target.value)}
                                        placeholder="π.χ. 25kg"
                                    />
                                    <input
                                        type="text"
                                        className={styles.variantInputSmall}
                                        value={row.sku}
                                        onChange={(e) => updateVariantRow(row.id, "sku", e.target.value)}
                                        placeholder="π.χ. SAND-25KG"
                                    />
                                    <input
                                        type="text"
                                        className={styles.variantInputSmall}
                                        value={row.barcode}
                                        onChange={(e) => updateVariantRow(row.id, "barcode", e.target.value)}
                                        placeholder="π.χ. 5201234567890"
                                    />
                                    <input
                                        type="text"
                                        className={styles.variantInputCost}
                                        value={row.cost_price}
                                        onChange={(e) => updateVariantRow(row.id, "cost_price", e.target.value)}
                                        placeholder="0.00"
                                    />
                                    <input
                                        type="text"
                                        className={styles.variantInputCost}
                                        value={row.sale_price}
                                        onChange={(e) => updateVariantRow(row.id, "sale_price", e.target.value)}
                                        placeholder="0.00"
                                    />
                                    <button
                                        type="button"
                                        className={styles.removeVariantBtn}
                                        onClick={() => removeVariantRow(row.id)}
                                        disabled={formVariants.length <= 1}
                                        title="Αφαίρεση"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </SidePopup>

            <SidePopup
                isOpen={categoryPopupOpen}
                onClose={closeCategoryPopup}
                title={categoryEditId ? "Επεξεργασία κατηγορίας" : "Νέα κατηγορία"}
                footerLeftButton={{
                    label: "Κλείσιμο",
                    onClick: closeCategoryPopup,
                    variant: "outline",
                }}
                footerRightButton={{
                    label: "Αποθήκευση",
                    onClick: handleCategorySave,
                    variant: "primary",
                    loading: createCategory.isPending || updateCategory.isPending,
                }}
            >
                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Όνομα κατηγορίας *</label>
                    <input
                        type="text"
                        className={styles.formInput}
                        value={catFormName}
                        onChange={(e) => setCatFormName(e.target.value)}
                        placeholder="π.χ. Υλικά Οικοδομών"
                    />
                    {catFormErrors.name && (
                        <span className={styles.formError}>{catFormErrors.name}</span>
                    )}
                </div>
                <div className={styles.formGroup} style={{ marginTop: 16 }}>
                    <label className={styles.formLabel}>Γονική κατηγορία</label>
                    <select
                        className={styles.formSelect}
                        value={catFormParentId}
                        onChange={(e) => setCatFormParentId(e.target.value ? Number(e.target.value) : "")}
                    >
                        <option value="">— (Κατηγορία πρώτου επιπέδου)</option>
                        {rootCategories
                            .filter((c) => !categoryEditId || c.id !== categoryEditId)
                            .map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                    </select>
                </div>
            </SidePopup>
        </div>
    );
}
