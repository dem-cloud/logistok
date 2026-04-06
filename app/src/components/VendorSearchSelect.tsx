import { useState, useRef, useEffect } from "react";
import { Plus } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { useVendors } from "@/hooks/useVendors";
import type { Vendor } from "@/hooks/useVendors";
import styles from "./VendorSearchSelect.module.css";

interface VendorSearchSelectProps {
    value: string;
    onChange: (vendorId: string, vendor?: Vendor) => void;
    onOpenQuickCreate: () => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}

export default function VendorSearchSelect({
    value,
    onChange,
    onOpenQuickCreate,
    placeholder = "Αναζήτηση προμηθευτή...",
    disabled,
    className,
}: VendorSearchSelectProps) {
    const [searchInput, setSearchInput] = useState("");
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const debouncedSearch = useDebounce(searchInput.trim(), 250);
    const containerRef = useRef<HTMLDivElement>(null);

    const { vendors, isFetching } = useVendors({
        search: debouncedSearch || undefined,
    });

    const selectedVendor = vendors.find((v) => String(v.id) === value);
    const displayValue = dropdownOpen ? searchInput : selectedVendor ? selectedVendor.name : "";

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleFocus = () => {
        setDropdownOpen(true);
        if (selectedVendor && !searchInput) setSearchInput(selectedVendor.name);
    };

    const handleSelect = (v: Vendor) => {
        onChange(String(v.id), v);
        setSearchInput("");
        setDropdownOpen(false);
    };

    return (
        <div ref={containerRef} className={`${styles.root} ${className || ""}`}>
            <div className={styles.inputRow}>
                <div className={`${styles.inputWrapper} ${styles.formGroupRelative}`}>
                    <input
                        type="text"
                        className={styles.formInput}
                        value={displayValue}
                        onChange={(e) => {
                            setSearchInput(e.target.value);
                            setDropdownOpen(true);
                            if (value && !e.target.value) onChange("", undefined);
                        }}
                        onFocus={handleFocus}
                        placeholder={placeholder}
                        disabled={disabled}
                    />
                    {dropdownOpen && (
                        <div
                            className={styles.dropdown}
                            onMouseDown={(e) => e.preventDefault()}
                        >
                            {isFetching ? (
                                <div className={styles.dropdownEmpty}>Φόρτωση...</div>
                            ) : vendors.length === 0 ? (
                                <div className={styles.dropdownEmpty}>
                                    {debouncedSearch ? "Δεν βρέθηκαν προμηθευτές" : "Πληκτρολογήστε για αναζήτηση"}
                                </div>
                            ) : (
                                vendors.slice(0, 15).map((v) => (
                                    <button
                                        key={v.id}
                                        type="button"
                                        className={styles.dropdownItem}
                                        onClick={() => handleSelect(v)}
                                    >
                                        {v.name}
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    className={styles.newBtn}
                    onClick={onOpenQuickCreate}
                    disabled={disabled}
                    title="Νέος προμηθευτής"
                >
                    <Plus size={14} />
                    Νέος
                </button>
            </div>
        </div>
    );
}
