import { useAuth } from '@/contexts/AuthContext';

/**
 * Returns whether the user can perform write actions in the current store.
 * False when the selected store is inactive (disabled by plan downgrade).
 */
export function useStoreCanEdit(): boolean {
    const { activeStore } = useAuth();
    if (!activeStore) return false;
    // is_active undefined = legacy payload, treat as true
    return activeStore.is_active !== false;
}

export default useStoreCanEdit;
