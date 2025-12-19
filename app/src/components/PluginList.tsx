import { Plugin } from "@/onboarding/types";
import styles from './PluginList.module.css';
import { PluginCard } from "./PluginCard";
import { useOnboarding } from "@/onboarding/OnboardingContext";

type PluginListProps = {
    plugins: Plugin[];
    selectedPlugins: string[];
    onSelect: (pluginKey: string) => void;
};

export function PluginList({ plugins, selectedPlugins, onSelect }: PluginListProps) {

    const { onboardingMeta } = useOnboarding()

    if (plugins.length === 0) {
        return (
            <div className={styles.empty}>
                <p>Δεν υπάρχουν διαθέσιμα plugins</p>
            </div>
        );
    }

    return (
        <div className={styles.pluginList}>
            {plugins.map((plugin) => {
                
                let isNotAllowed = false 
                if(onboardingMeta.is_free_plan){
                    isNotAllowed = !!plugin.base_price_per_month
                }
                
                const isSelected = selectedPlugins.includes(plugin.key);

                return (
                    <PluginCard
                        key={plugin.key}
                        item={plugin}
                        selected={isSelected}
                        onSelect={() => onSelect(plugin.key)}
                        locked={isNotAllowed}
                    />
                );
            })}
        </div>
    );
}
