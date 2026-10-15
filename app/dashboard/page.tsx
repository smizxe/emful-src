import { prisma } from '@/lib/prisma';
import React from 'react';
import {
    DollarOutlined,
    ClockCircleOutlined,
    CustomerServiceOutlined,
    RiseOutlined
} from '@ant-design/icons';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import DashboardClient from './DashboardClient';
import { Package } from 'lucide-react';

export default async function DashboardPage() {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
        redirect('/login');
    }

    // Prisma Query with explicit typing
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            seller: {
                include: {
                    orders: true,
                    wallet: true
                }
            }
        }
    }) as {
        id: string;
        email: string;
        role: string;
        sellerId: string | null;
        seller: {
            id: string;
            name: string;
            orders: Array<{ id: string; status: string; totalAmount: number }>;
            wallet: { balance: number } | null;
        } | null;
    } | null;

    if (!user) {
        redirect('/login');
    }

    // Redirect admins to admin dashboard
    if (user.role === 'ADMIN') {
        redirect('/admin/dashboard');
    }

    // Redirect staff to staff dashboard
    if (user.role === 'STAFF') {
        redirect('/staff/dashboard');
    }

    // Data Selection for Dashboard
    const orders = user.seller?.orders || [];

    // Ensure wallet exists (create if missing)
    let balance = 0;
    if (user.seller) {
        if (!user.seller.wallet) {
            // Create wallet if it doesn't exist
            await prisma.wallet.create({
                data: {
                    sellerId: user.seller.id,
                    balance: 0,
                    currency: 'USD'
                }
            });
            balance = 0;
        } else {
            balance = user.seller.wallet.balance;
        }
    }

    // Calculate Stats
    const orderCount = orders.length;
    const pendingCount = orders.filter((o) => o.status === 'RECEIVED' || o.status === 'IN_PROCESS').length;

    // Money totals for the top row (all-time). Every refund path writes a REFUND
    // ledger entry, top-ups are CREDIT/TOPUP and order charges are DEBIT.
    let refundTotal = 0;
    let topUpTotal = 0;
    let costTotal = 0;
    if (user.seller) {
        const [refundAgg, topUpAgg, debitAgg] = await Promise.all([
            prisma.walletLedger.aggregate({
                where: { sellerId: user.seller.id, type: 'REFUND' },
                _sum: { amount: true },
            }),
            prisma.walletLedger.aggregate({
                where: { sellerId: user.seller.id, type: 'CREDIT', refType: 'TOPUP' },
                _sum: { amount: true },
            }),
            prisma.walletLedger.aggregate({
                where: { sellerId: user.seller.id, type: 'DEBIT' },
                _sum: { amount: true },
            }),
        ]);
        refundTotal = refundAgg._sum.amount || 0;
        topUpTotal = topUpAgg._sum.amount || 0;
        // DEBIT amounts are stored positive; they represent money spent.
        costTotal = Math.abs(debitAgg._sum.amount || 0);
    }

    // Row 1 — money. Row 2 (order status counts) is rendered by <SellerStats />.
    const stats = [
        { title: 'Total Top Up', key: 'totalTopUp', value: topUpTotal, prefix: '$', styles: { content: { color: '#3f8600' } }, icon: <RiseOutlined />, color: '#52c41a' },
        { title: 'Total Cost', key: 'totalCost', value: costTotal, prefix: '$', styles: { content: { color: '#cf1322' } }, icon: <Package size={24} />, color: '#1890ff' },
        { title: 'Refunds', key: 'refunds', value: refundTotal, prefix: '$', styles: { content: { color: '#cf1322' } }, icon: <DollarOutlined />, color: '#ff4d4f' },
        { title: 'Current Balance', key: 'balance', value: balance, prefix: '$', styles: { content: { color: '#3f8600' } }, icon: <RiseOutlined />, color: '#52c41a' },
    ];

    return <DashboardClient user={user} stats={stats} />;
}
