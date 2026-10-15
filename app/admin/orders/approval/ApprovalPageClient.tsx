'use client';

import React from 'react';
import { Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import ApprovalClient from './ApprovalClient';
import DateRangeFilter from '@/components/Shared/DateRangeFilter';
import { useLanguage } from '@/components/Providers/LanguageContext';

export default function ApprovalPageClient({
    initialOrders,
    businessTimeZone,
    approveEndpoint
}: {
    initialOrders: any[];
    businessTimeZone: string;
    approveEndpoint?: string;
}) {
    const router = useRouter();
    const { t } = useLanguage();

    return (
        <div className="p-6">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold">{t.approvalPage.title}</h1>
                    <p className="text-gray-500">{t.approvalPage.subtitle}</p>
                </div>
                <div className="flex gap-2">
                    <DateRangeFilter />
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={() => router.refresh()}
                        type="primary"
                        ghost
                    >
                        {t.common.refresh}
                    </Button>
                </div>
            </div>
            <ApprovalClient
                orders={initialOrders}
                businessTimeZone={businessTimeZone}
                approveEndpoint={approveEndpoint}
            />
        </div>
    );
}
