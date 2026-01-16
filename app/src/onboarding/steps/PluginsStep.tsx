
import styles from '../OnboardingLayout.module.css'
import { useAuth } from '@/contexts/AuthContext';
import React, { useEffect, useState } from 'react';
import Button from '@/components/reusable/Button';
import { PluginList } from '@/components/PluginList';
import { useOnboarding } from '../OnboardingContext';
import { usePluginsRecommendations } from '@/hooks/usePluginsRecommendations';

export function PluginsStep() {
    
    const { showToast } = useAuth();
    const { onboardingData, nextStep } = useOnboarding();
    const { data: pluginRecommendations, isPending: pluginsLoading } = usePluginsRecommendations({scope: "onboarding", industries: onboardingData.industries})

    const [selectedPlugins, setSelectedPlugins] = useState(onboardingData.plugins || [])
    const [loadingSubmitRequest, setLoadingSubmitRequest] = useState(false)
    
    useEffect(() => {
        setSelectedPlugins(onboardingData.plugins || [])
    }, [onboardingData])

    const handleSelect = (pluginKey: string) => {
        setSelectedPlugins(prev =>
            prev.includes(pluginKey)
            ? prev.filter(key => key !== pluginKey) // unselect
            : [...prev, pluginKey]                   // select
        )
    }

    const handleNext = async (e: React.FormEvent, plugins: string[]) => {
        e.preventDefault();

        try {
            setLoadingSubmitRequest(true);

            await nextStep({ plugins: plugins });
            
        } catch (error) {
            console.error("error:", error);
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
        } finally {
            setLoadingSubmitRequest(false);
        }
    };

    return (
        <main className={styles.content}>
            <div className={styles.title}>Επιλέξτε τα πρόσθετα που θα απογειώσουν την επιχείρησή σας</div>
            <div className={styles.tagline}>Με κάθε πρόσθετο εξοπλίζεται την επιχείρησή σας με σημαντίκα εργαλεία</div>

            <form 
                onSubmit={(e) => handleNext(e, selectedPlugins)}
            >
                {pluginsLoading ? (
                    <div>Φόρτωση plugins...</div>
                ) : (
                    <PluginList
                        plugins={pluginRecommendations}
                        selectedPlugins={selectedPlugins}
                        onSelect={handleSelect}
                    />
                )}

                <div className={styles.pluginsBtn}>
                    <Button
                        type = "submit"
                        loading = {loadingSubmitRequest || pluginsLoading}
                        disabled = {loadingSubmitRequest || pluginsLoading}
                    >
                        Συνέχεια
                    </Button>
                </div>

                <button
                    type="button"
                    className={styles.skipButton}
                    onClick={(e)=>handleNext(e, [])}
                >
                    Παράλειψη
                </button>
            </form>

        </main>
    );
}