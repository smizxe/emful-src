'use client';

import React, { Suspense } from 'react';
import { Space, Spin } from 'antd';
import ProductionTable from '../../components/admin/ProductionTable';
import ProductionStats from '../../components/admin/ProductionStats';
import DateRangeFilter from '@/components/Shared/DateRangeFilter';
import Trans from '@/components/Shared/Trans';

function ProductionContent() {
    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <Space>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-500 to-purple-600 dark:from-pink-300 dark:to-purple-400 bg-clip-text text-transparent">
                        <Trans k="nav.productionRelease" />
                    </h1>
                </Space>
                <DateRangeFilter />
            </div>

            <ProductionStats />
            <ProductionTable />
        </div>
    );
}

export default function ProductionPage() {
    return (
        <Suspense fallback={<div className="flex justify-center p-10"><Spin size="large" /></div>}>
            <ProductionContent />
        </Suspense>
    );
}
