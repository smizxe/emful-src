import React from 'react';
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { Tag, Button } from 'antd';
import { ArrowLeftOutlined, CopyOutlined, EyeOutlined, DownloadOutlined, PrinterOutlined, YoutubeOutlined, FacebookOutlined, DiscordOutlined } from '@ant-design/icons';
import Link from 'next/link';
import TrackingLogo from './TrackingLogo';
import { getShippingStatusLabel } from '@/lib/shippingStatus';

// Force dynamic since we are fetching specific order data
export const dynamic = 'force-dynamic';

export default async function OrderDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    // In Next.js 15, params is a Promise, so we await it.
    const { id: orderCode } = await params;

    const order = await prisma.order.findUnique({
        where: { orderCode },
        include: { jobs: true } // jobs contain the items
    });

    if (!order) {
        return notFound();
    }

    // Helper to format currency
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(amount);
    };

    // Calculate totals from jobs 
    // (Note: Order model has totalAmount, but detailed breakdown is in jobs)
    const baseItemsTotal = order.jobs.reduce((acc, job) => acc + (job.priceToCharge * job.qty), 0);
    const shippingTotal = order.jobs.reduce((acc, job) => acc + (job.shippingCost || 0), 0);
    const extraFeesTotal = order.jobs.reduce((acc, job) => acc + (job.extraFees || 0), 0);
    const priorityFeeTotal = (order.priorityProduction ? Number(order.priorityProductionFee || 0) : 0)
        + (order.priorityShipping ? Number(order.priorityShippingFee || 0) : 0);

    // Address format
    const firstJob = order.jobs[0];
    const recipient = firstJob?.recipientName || 'N/A';
    const address = [firstJob?.address1, firstJob?.address2, firstJob?.city, firstJob?.state, firstJob?.zip, firstJob?.country].filter(Boolean).join(', ');
    const phone = firstJob?.phone || '-';

    return (
        <div className="p-6 min-h-screen bg-transparent text-zinc-800 dark:text-zinc-200">
            {/* Header / Breadcrumb substitute */}
            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/orders">
                        <Button icon={<ArrowLeftOutlined />}>Back to Orders</Button>
                    </Link>
                </div>
                <Link href={`/print/invoices?ids=${order.orderCode}`} target="_blank">
                    <Button icon={<PrinterOutlined />}>Print Invoice</Button>
                </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* LEFT COLUMN (2/3) */}
                <div className="lg:col-span-2 space-y-6">

                    {/* INFORMATION CARD */}
                    <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 shadow-sm border border-zinc-100 dark:border-zinc-700">
                        <h3 className="text-lg font-bold mb-4 text-zinc-700 dark:text-zinc-300">Infomation</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                            {/* Left Info */}
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 min-w-[120px]">Order Id:</span>
                                    <span className="text-zinc-600 dark:text-zinc-400 text-right">{order.orderCode}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 min-w-[120px]">Source:</span>
                                    <span className="text-zinc-600 dark:text-zinc-400 text-right">Import</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 min-w-[120px]">Number Of Units:</span>
                                    <span className="text-zinc-600 dark:text-zinc-400 text-right">{order.jobs.reduce((a, b) => a + b.qty, 0)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 min-w-[120px]">Status:</span>
                                    <div className="text-right">
                                        <Tag color={order.status === 'COMPLETED' || order.status === 'DELIVERED' ? 'green' : (order.status === 'RECEIVED' ? 'cyan' : 'blue')} className="m-0 border-0 px-4 py-1 rounded text-sm font-semibold uppercase">
                                            {order.status}
                                        </Tag>
                                    </div>
                                </div>
                            </div>

                            {/* Right Info (Shipping) */}
                            <div className="space-y-3 text-sm">
                                <div className="flex">
                                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 min-w-[120px]">Shipping Name:</span>
                                    <span className="text-zinc-600 dark:text-zinc-400">{recipient}</span>
                                </div>
                                <div className="flex">
                                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 min-w-[120px]">Shipping Address:</span>
                                    <span className="text-zinc-600 dark:text-zinc-400">{address}</span>
                                </div>
                                <div className="flex">
                                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 min-w-[120px]">Shipping Phone:</span>
                                    <span className="text-zinc-600 dark:text-zinc-400">{phone}</span>
                                </div>
                                <div className="flex items-center">
                                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 min-w-[120px]">Tracking Id:</span>
                                    <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-700 px-2 py-1 rounded">
                                        {order.trackingNumber ? (
                                            <a href="https://stallionexpress.ca/tracking/" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline text-xs font-mono">
                                                {order.trackingNumber}
                                            </a>
                                        ) : (
                                            <span className="text-zinc-600 dark:text-zinc-300 text-xs font-mono">-</span>
                                        )}
                                        {order.trackingNumber && <CopyOutlined className="text-green-500 cursor-pointer text-xs" />}
                                    </div>
                                </div>
                                <div className="flex">
                                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 min-w-[120px]">Shipping Status:</span>
                                    <span className="text-zinc-600 dark:text-zinc-400">{getShippingStatusLabel(order.shippingStatus || (order.trackingNumber ? 'LABEL_CREATED' : 'PENDING'))}</span>
                                </div>
                                <div className="flex">
                                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 min-w-[120px]">Tracking label:</span>
                                    <span className="text-zinc-600 dark:text-zinc-400">-</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* PRODUCTS LIST */}
                    <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 shadow-sm border border-zinc-100 dark:border-zinc-700">
                        <h3 className="text-lg font-bold mb-4 text-zinc-700 dark:text-zinc-300">Products</h3>
                        <div className="space-y-8">
                            {order.jobs.map((job, index) => {
                                const designs: any[] = [];
                                try {
                                    const parsed = JSON.parse(job.designs || '[]');
                                    if (Array.isArray(parsed)) {
                                        designs.push(...parsed);
                                    }
                                } catch { }

                                return (
                                    <div key={job.id} className="border-b last:border-0 pb-6 last:pb-0 border-zinc-100 dark:border-zinc-700">
                                        <div className="flex flex-col md:flex-row justify-between gap-4 mb-4">
                                            <div>
                                                <h4 className="text-base font-semibold text-blue-600 mb-2">
                                                    {index + 1}. {job.sku} - {job.sku}
                                                </h4>
                                                <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold">Size:</span> {job.size}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold">Color:</span>
                                                        <span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-700 rounded text-xs uppercase">{job.color}</span>
                                                    </div>
                                                </div>
                                                <div className="mt-2 text-sm">
                                                    <span className="font-bold text-zinc-700 dark:text-zinc-300">Note: </span>
                                                    <span className="text-zinc-500">{job.notes || '-'}</span>
                                                </div>
                                            </div>
                                            <div className="text-right min-w-[100px]">
                                                <span className="font-bold text-zinc-700 dark:text-zinc-300 text-sm">Quantity: </span>
                                                <span className="text-base">{job.qty}</span>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            {designs.length > 0 ? designs.map((design: any, dIndex: number) => {
                                                const mockup = design.mockup || '';
                                                return (
                                                    <div key={dIndex} className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-lg">
                                                        <div>
                                                            <h5 className="font-bold text-sm mb-2 text-zinc-700 dark:text-zinc-300">Position {dIndex + 1}</h5>
                                                            <div className="text-sm space-y-1">
                                                                <div>Location: {design.position || design.location || 'Center Chest'}</div>
                                                                <div className="flex items-center gap-2">
                                                                    <span>Design:</span>
                                                                    <div className="flex gap-2">
                                                                        {design.url && (
                                                                            <a href={design.url} target="_blank">
                                                                                <Button size="small" type="primary" icon={<EyeOutlined />} className="bg-blue-600" />
                                                                            </a>
                                                                        )}
                                                                        {design.url && (
                                                                            <a href={design.url} download>
                                                                                <Button size="small" icon={<DownloadOutlined className="text-green-600" />} />
                                                                            </a>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <h5 className="font-bold text-sm mb-2 text-zinc-700 dark:text-zinc-300">Type: {design.type || 'Embroidery'}</h5>
                                                            <div className="flex items-center gap-2 text-sm">
                                                                <span>Mockup:</span>
                                                                <div className="flex gap-2">
                                                                    {mockup && (
                                                                        <a href={mockup} target="_blank">
                                                                            <Button size="small" type="primary" icon={<EyeOutlined />} className="bg-blue-600" />
                                                                        </a>
                                                                    )}
                                                                    {mockup && (
                                                                        <a href={mockup} download>
                                                                            <Button size="small" icon={<DownloadOutlined className="text-green-600" />} />
                                                                        </a>
                                                                    )}
                                                                    {!mockup && <span className="text-zinc-400">-</span>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }) : (
                                                <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg text-zinc-400 text-sm">
                                                    No design information available
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN (1/3) */}
                <div className="space-y-6">
                    {/* TRACKING CARD */}
                    <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 shadow-sm border border-zinc-100 dark:border-zinc-700">
                        <h3 className="text-lg font-bold mb-4 text-zinc-700 dark:text-zinc-300">Tracking</h3>
                        <div className="flex flex-col items-center gap-4">
                            <TrackingLogo />

                            <a href="https://stallionexpress.ca/tracking/" target="_blank" rel="noreferrer" className="w-full">
                                <Button type="primary" block size="large" className="bg-red-700 hover:bg-red-600 flex items-center justify-center gap-2 h-12 text-base font-semibold rounded-lg">
                                    <ArrowLeftOutlined rotate={180} /> Tracking Package
                                </Button>
                            </a>
                        </div>
                    </div>

                    {/* TOTAL CARD */}
                    <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 shadow-sm border border-zinc-100 dark:border-zinc-700">
                        <h3 className="text-lg font-bold mb-4 text-zinc-700 dark:text-zinc-300">Total</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-blue-600 uppercase bg-blue-50 dark:bg-zinc-700/50">
                                    <tr>
                                        <th className="px-3 py-2 rounded-l-md">Product</th>
                                        <th className="px-3 py-2 text-center">Qty</th>
                                        <th className="px-3 py-2 text-right">Unit Price</th>
                                        <th className="px-3 py-2 rounded-r-md text-right">Extra Fees</th>
                                    </tr>
                                </thead>
                                <tbody className="text-zinc-600 dark:text-zinc-300">
                                    {order.jobs.map((job) => (
                                        <tr key={job.id} className="border-b dark:border-zinc-700 last:border-0 border-dashed">
                                            <td className="px-3 py-4 font-medium text-blue-600">
                                                {job.sku}
                                                <div className="text-xs text-zinc-400 font-normal truncate max-w-[120px]">{job.color} / {job.size}</div>
                                            </td>
                                            <td className="px-3 py-4 text-center">{job.qty}</td>
                                            <td className="px-3 py-4 text-right">${job.priceToCharge.toFixed(1)}</td>
                                            <td className="px-3 py-4 text-right">${(job.extraFees || 0).toFixed(0)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="pt-4 mt-2 border-t border-zinc-200 dark:border-zinc-600 space-y-2">
                            <div className="flex justify-between font-bold text-zinc-700 dark:text-zinc-300">
                                <span>Shipping Fees:</span>
                                <span>{formatCurrency(shippingTotal)}</span>
                            </div>
                            <div className="flex justify-between font-bold text-zinc-700 dark:text-zinc-300">
                                <span>Priority Fees:</span>
                                <span>{formatCurrency(priorityFeeTotal)}</span>
                            </div>
                            <div className="flex justify-between font-bold text-xl text-zinc-900 dark:text-zinc-100">
                                <span>Total:</span>
                                <span>{formatCurrency(baseItemsTotal + shippingTotal + extraFeesTotal + priorityFeeTotal)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="mt-12 text-sm text-zinc-500 flex justify-between items-center border-t border-zinc-200 dark:border-zinc-700 pt-6">
                <span>© 2025 emfulfill - All Rights Reserved.</span>
                <div className="flex gap-4 text-xl">
                    <YoutubeOutlined />
                    <DiscordOutlined />
                    <FacebookOutlined />
                </div>
            </div>
        </div >
    );
}
