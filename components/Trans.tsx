'use client';

import { useLanguage } from '@/components/Providers/LanguageContext';

interface TransProps {
    id: string;
}

export default function Trans({ id }: TransProps) {
    const { t } = useLanguage();

    // Helper to access nested properties safely
    const getValue = (obj: any, path: string) => {
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    };

    const text = getValue(t, id);

    if (!text) {
        console.warn(`Missing translation for key: ${id}`);
        return <>{id}</>;
    }

    return <>{text}</>;
}
