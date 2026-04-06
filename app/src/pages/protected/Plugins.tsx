import { useCompanyPlugins } from "@/hooks/useCompanyPlugins";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { Link } from "react-router-dom";
import { Puzzle, Lock, ArrowRight } from "lucide-react";
import styles from "./Plugins.module.css";

export default function Plugins() {
    const { data: plugins, isLoading, error } = useCompanyPlugins();
    const { isBasic } = usePlanFeatures();

    if (isLoading) {
        return (
            <div className={styles.container}>
                <p className={styles.loading}>Φόρτωση...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.container}>
                <p className={styles.error}>Σφάλμα κατά την φόρτωση των plugins.</p>
            </div>
        );
    }

    const pluginsList = plugins ?? [];

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Τα Plugins μου</h1>
                <p className={styles.subtitle}>
                    {isBasic
                        ? "Τα plugins σας εμφανίζονται εδώ αλλά είναι απενεργοποιημένα λόγω του Basic πλάνου. Αναβαθμίστε για να τα ενεργοποιήσετε."
                        : "Διαχειριστείτε τα plugins της εταιρείας σας."}
                </p>
            </div>

            <div className={styles.content}>
                {pluginsList.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Puzzle className={styles.emptyIcon} size={48} />
                        <p className={styles.emptyText}>Δεν έχετε ακόμα plugins.</p>
                        <Link to="/marketplace" className={styles.emptyLink}>
                            Επισκεφθείτε το Marketplace
                            <ArrowRight size={16} />
                        </Link>
                    </div>
                ) : (
                    <div className={styles.pluginList}>
                        {pluginsList.map((plugin) => {
                            const isDisabled = isBasic || plugin.status === "disabled";
                            return (
                                <div
                                    key={plugin.plugin_key}
                                    className={`${styles.pluginCard} ${
                                        isDisabled ? styles.pluginCardDisabled : ""
                                    }`}
                                >
                                    <div className={styles.pluginThumb}>
                                        {plugin.photo_url ? (
                                            <img
                                                src={plugin.photo_url}
                                                alt={plugin.name}
                                            />
                                        ) : (
                                            <Puzzle size={24} />
                                        )}
                                    </div>
                                    <div className={styles.pluginContent}>
                                        <div className={styles.pluginName}>
                                            <span>{plugin.name}</span>
                                            {isDisabled && (
                                                <span className={styles.pluginBadge}>
                                                    <Lock size={12} />
                                                    Μη διαθέσιμο
                                                </span>
                                            )}
                                        </div>
                                        {plugin.description && (
                                            <p className={styles.pluginDescription}>
                                                {plugin.description}
                                            </p>
                                        )}
                                        {isDisabled && isBasic && (
                                            <Link
                                                to="/settings/subscription"
                                                className={styles.upgradeLink}
                                            >
                                                Αναβάθμιση για ενεργοποίηση
                                                <ArrowRight size={14} />
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
