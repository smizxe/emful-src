'use client';

import React from 'react';
import { Dropdown, Button } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { useLanguage } from '@/components/Providers/LanguageContext';

export default function LanguageToggle() {
    const { language, setLanguage, t } = useLanguage();

    const items = [
        {
            key: 'en',
            label: (
                <div className="flex items-center gap-2 min-w-[100px]">
                    <span className="text-lg">🇺🇸</span>
                    <span className={`font-medium ${language === 'en' ? 'text-blue-600' : ''}`}>
                        {t.language.english}
                    </span>
                </div>
            ),
            onClick: () => setLanguage('en'),
        },
        {
            key: 'vi',
            label: (
                <div className="flex items-center gap-2 min-w-[100px]">
                    <span className="text-lg">🇻🇳</span>
                    <span className={`font-medium ${language === 'vi' ? 'text-blue-600' : ''}`}>
                        {t.language.vietnamese}
                    </span>
                </div>
            ),
            onClick: () => setLanguage('vi'),
        },
    ];

    return (
        <Dropdown menu={{ items }} placement="bottomRight" trigger={['click']}>
            <Button
                type="text"
                className="flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                icon={<GlobalOutlined className="text-lg" />}
            />
        </Dropdown>
    );
}
