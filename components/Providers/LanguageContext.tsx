'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { en } from '@/lib/translations/en';
import { vi } from '@/lib/translations/vi';

type Language = 'en' | 'vi';
type Translations = typeof en;

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<Language>('en');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // Load saved language from localStorage
        const saved = localStorage.getItem('language') as Language;
        if (saved && (saved === 'en' || saved === 'vi')) {
            setLanguageState(saved);
        }
        setMounted(true);
    }, []);

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        localStorage.setItem('language', lang);
    };

    const translations = language === 'vi' ? vi : en;

    // Prevent hydration mismatch handled by initial state
    // if (!mounted) {
    //     return <>{children}</>;
    // }

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t: translations }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}
