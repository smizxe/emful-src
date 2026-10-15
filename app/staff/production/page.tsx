'use client';

import React, { Suspense } from 'react';
import { Space, Spin } from 'antd';
import ProductionTable from '@/app/components/admin/ProductionTable';

function StaffProductionContent() {
    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <Space>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-500 to-cyan-600 bg-clip-text text-transparent">
                        Production Release
                    </h1>
                </Space>
            </div>

            <ProductionTable />
        </div>
    );
}

export default function StaffProductionPage() {
    return (
        <Suspense fallback={<div className="flex justify-center p-10"><Spin size="large" /></div>}>
            <StaffProductionContent />
        </Suspense>
    );
}
