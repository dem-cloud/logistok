import { useState, useRef, useEffect } from "react";
import { Plus } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { useCustomers } from "@/hooks/useCustomers";
import type { Customer } from "@/hooks/useCustomers";
import styles from "./CustomerSearchSelect.module.css";

interface CustomerSearchSelectProps {
    value: string;
    onChange: (customerId: string, customer?: Customer) => void;
    onOpenQuickCreate: () => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}

export default function CustomerSearchSelect({
    value,
    onChange,
    onOpenQuickCreate,
    placeholder = "Αναζήτηση πελάτη...",
    disabled,
    className,
}: CustomerSearchSelectProps) {
    const [searchInput, setSearchInput] = useState("");
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const debouncedSearch = useDebounce(searchInput.trim(), 250);
    const containerRef = useRef<HTMLDivElement>(null);

    const { customers, isFetching } = useCustomers({
        search: debouncedSearch || undefined,
    });

    const selectedCustomer = customers.find((c) => String(c.id) === value);
    const displayValue = dropdownOpen ? searchInput : selectedCustomer ? selectedCustomer.full_name : "";

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
        if (selectedCustomer && !searchInput) setSearchInput(selectedCustomer.full_name);
    };

    const handleSelect = (c: Customer) => {
        onChange(String(c.id), c);
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
                            ) : customers.length === 0 ? (
                                <div className={styles.dropdownEmpty}>
                                    {debouncedSearch ? "Δεν βρέθηκαν πελάτες" : "Πληκτρολογήστε για αναζήτηση"}
                                </div>
                            ) : (
                                customers.slice(0, 15).map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        className={styles.dropdownItem}
                                        onClick={() => handleSelect(c)}
                                    >
                                        {c.full_name}
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
                    title="Νέος πελάτης"
                >
                    <Plus size={14} />
                    Νέος
                </button>
            </div>
        </div>
    );
}
