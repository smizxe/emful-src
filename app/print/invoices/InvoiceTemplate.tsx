'use client';

import React from 'react';
import dayjs from 'dayjs';

export default function InvoiceTemplate({ order }: { order: any }) {
    // Calculations
    const baseItemsTotal = order.jobs.reduce((acc: number, job: any) => acc + (job.priceToCharge * job.qty), 0);
    const shippingTotal = order.jobs.reduce((acc: number, job: any) => acc + (job.shippingCost || 0), 0);
    const extraFeesTotal = order.jobs.reduce((acc: number, job: any) => acc + (job.extraFees || 0), 0);
    const subtotal = baseItemsTotal + extraFeesTotal;
    const total = subtotal + shippingTotal;

    // Address info
    const firstJob = order.jobs[0];
    const recipient = firstJob?.recipientName || 'N/A';
    const phone = firstJob?.phone || '-';

    // Construct address lines for clearer display
    const addressLines = [
        [firstJob?.address1, firstJob?.address2].filter(Boolean).join(' '),
        [
            [firstJob?.city, firstJob?.state].filter(Boolean).join(', '),
            firstJob?.zip
        ].filter(Boolean).join(' '),
        firstJob?.country
    ].filter(Boolean);

    return (
        <div className="max-w-[800px] mx-auto bg-white p-8 text-black border border-gray-200 print:border-0">
            {/* Header */}
            <div className="flex justify-between items-start mb-8 border-b pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">INVOICE</h1>
                    <div className="text-gray-500 text-sm">
                        <div>Invoice #: {order.orderCode}</div>
                        <div>Date: {dayjs(order.createdAt).format('MMM D, YYYY')}</div>
                    </div>
                </div>
                <div className="text-right">
                    <h2 className="text-xl font-bold text-gray-800">{order.seller?.name || 'Seller Store'}</h2>
                    <div className="text-sm text-gray-500 mt-1">
                        <div>{order.seller?.address}</div>
                        <div>{order.seller?.contactEmail}</div>
                        <div>{order.seller?.phone}</div>
                    </div>
                </div>
            </div>

            {/* Addresses */}
            <div className="flex justify-between mb-8 gap-8">
                <div className="w-1/2">
                    <h3 className="text-xs font-bold uppercase text-gray-400 mb-2">Bill To</h3>
                    <div className="text-sm text-gray-800">
                        <div className="font-bold">{recipient}</div>
                        {addressLines.map((line, i) => (
                            <div key={i}>{line}</div>
                        ))}
                        {phone && phone !== '-' && <div>{phone}</div>}
                    </div>
                </div>
                <div className="w-1/2 text-right">
                    {/* Could be Ship To or Seller Info repeated */}
                </div>
            </div>

            {/* Items Table */}
            <table className="w-full mb-8 text-sm">
                <thead>
                    <tr className="border-b-2 border-gray-100">
                        <th className="text-left py-3 font-semibold text-gray-600">Items</th>
                        <th className="text-center py-3 font-semibold text-gray-600">Qty</th>
                        <th className="text-right py-3 font-semibold text-gray-600">Price</th>
                        <th className="text-right py-3 font-semibold text-gray-600">Total</th>
                    </tr>
                </thead>
                <tbody>
                    {order.jobs.map((job: any, index: number) => (
                        <tr key={index} className="border-b border-gray-50">
                            <td className="py-4">
                                <div className="font-medium text-gray-900">{job.sku}</div>
                                {(job.color || job.size) && (
                                    <div className="text-xs text-gray-500">{job.color} / {job.size}</div>
                                )}
                            </td>
                            <td className="text-center py-4">{job.qty}</td>
                            <td className="text-right py-4">${job.priceToCharge.toFixed(2)}</td>
                            <td className="text-right py-4 font-medium">${(job.priceToCharge * job.qty).toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Totals */}
            <div className="flex justify-end">
                <div className="w-1/2 space-y-2 text-sm">
                    <div className="flex justify-between pt-2">
                        <span className="text-gray-500">Subtotal</span>
                        <span className="font-medium">${baseItemsTotal.toFixed(2)}</span>
                    </div>
                    {extraFeesTotal > 0 && (
                        <div className="flex justify-between">
                            <span className="text-gray-500">Extra Fees</span>
                            <span className="font-medium">${extraFeesTotal.toFixed(2)}</span>
                        </div>
                    )}
                    <div className="flex justify-between">
                        <span className="text-gray-500">Shipping</span>
                        <span className="font-medium">${shippingTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t border-gray-200 pt-3 mt-2">
                        <span className="text-base font-bold text-gray-900">Total</span>
                        <span className="text-base font-bold text-blue-600">${total.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="mt-12 pt-6 border-t border-gray-100 text-center text-xs text-gray-400">
                <p>Thank you for your business!</p>
            </div>
        </div>
    );
}
