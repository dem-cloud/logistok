import { createContext, ReactNode, useContext, useState } from "react";

type BreadcrumbContextType = {
    breadcrumb: string[];
    title: string;
    setBreadcrumb: (breadcrumb: string[], title: string) => void;
    resetBreadcrumb: () => void;
};

const BreadcrumbContext = createContext<BreadcrumbContextType | undefined>(undefined);

export const BreadcrumbProvider = ({ children }: { children: ReactNode }) => {
    const [breadcrumb, setBreadcrumbState] = useState<string[]>([]);
    const [title, setTitle] = useState<string>('');

    const setBreadcrumb = (newBreadcrumb: string[], newTitle: string) => {
        setBreadcrumbState(newBreadcrumb);
        setTitle(newTitle);
    };

    const resetBreadcrumb = () => {
        setBreadcrumbState([]);
        setTitle('');
    };

    return (
        <BreadcrumbContext.Provider 
            value={{ breadcrumb, title, setBreadcrumb, resetBreadcrumb }}
        >
            {children}
        </BreadcrumbContext.Provider>
    );
};

// Hook που μπορεί να χρησιμοποιηθεί χωρίς provider (returns undefined)
export const useBreadcrumbContext = () => {
    return useContext(BreadcrumbContext); // Δεν πετάει error αν δεν υπάρχει provider
};