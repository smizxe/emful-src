import { prisma } from '@/lib/prisma';
import React, { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import WalletClient from './WalletClient';

export default async function WalletPage() {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
        redirect('/login');
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { seller: true }
    });

    if (!user || user.role !== 'SELLER') {
        redirect('/login');
    }

    // WalletClient reads search params (deep links from the dashboard stats).
    return (
        <Suspense fallback={<div className="p-6" />}>
            <WalletClient />
        </Suspense>
    );
}
