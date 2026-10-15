'use client';

import React from 'react';
import { useLanguage } from '@/components/Providers/LanguageContext';

interface TransProps {
    k: string; // Key path, e.g., 'common.save' or 'dashboard.welcome'
    values?: Record<string, string | number>;
    className?: string; // Optional className for styling the wrapper span
}

export default function Trans({ k, values, className }: TransProps) {
    const { t } = useLanguage();

    const getNestedValue = (obj: any, path: string): string => {
        return path.split('.').reduce((prev, curr) => {
            return prev ? prev[curr] : null;
        }, obj) || k;
    };

    let text = getNestedValue(t, k);

    if (values) {
        Object.keys(values).forEach(key => {
            text = text.replace(`{${key}}`, String(values[key]));
        });
    }

    return <span className={className}>{text}</span>;
}
