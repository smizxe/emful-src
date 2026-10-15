import React from 'react';
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import UpdateStatusButton from './UpdateStatusButton'; // Client component

export default async function StatusScanPage({ params }: { params: { token: string } }) {
    // Resolve params (Next.js 15+ needs await, earlier versions no. Assuming Next 14/15 based on `package.json` -> "next": "16.1.1" -> Yes, await params)
    const { token } = await params;

    // Robust cleanup - machine scanners may add whitespace or encode characters
    const cleanToken = decodeURIComponent(token).trim();

    const qrToken = await prisma.qrToken.findUnique({
        where: { token: cleanToken },
        include: {
            job: {
                include: { order: true }
            }
        }
    });

    if (!qrToken || qrToken.type !== 'STATUS') {
        return <div className="p-8 text-center text-red-500 font-bold text-2xl">Invalid or Expired Token</div>;
    }

    if (qrToken.maxUses && qrToken.usedCount >= qrToken.maxUses) {
        return (
            <div className="p-8 text-center">
                <h1 className="text-3xl font-bold text-green-600 mb-4">Job Completed</h1>
                <p className="text-gray-600">This job has already been fully processed.</p>
                <div className="mt-8 border p-4 rounded bg-gray-50">
                    <p>Job: {qrToken.job.jobCode}</p>
                    <p>Status: {qrToken.job.status}</p>
                </div>
            </div>
        );
    }

    const job = qrToken.job;
    let nextStatus = '';
    let actionLabel = '';

    if (job.status === 'RECEIVED') {
        nextStatus = 'IN_PROCESS';
        actionLabel = 'START PRODUCTION (IN PROCESS)';
    } else if (job.status === 'IN_PROCESS') {
        nextStatus = 'COMPLETED';
        actionLabel = 'FINISH JOB (COMPLETED)';
    } else if (job.status === 'COMPLETED') {
        return <div className="p-8 text-center text-green-600 font-bold text-2xl">Job Already Completed</div>;
    }

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
            <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md text-center">
                <h1 className="text-xl text-gray-500 mb-2">Scan Action</h1>
                <h2 className="text-3xl font-bold mb-4">{job.jobCode}</h2>

                <div className="text-left bg-gray-50 p-4 rounded mb-6 text-sm">
                    <p><strong>SKU:</strong> {job.sku}</p>
                    <p><strong>Variant:</strong> {job.color} / {job.size}</p>
                    <p><strong>Qty:</strong> {job.qty}</p>
                    <p className="mt-2"><strong>Current Status:</strong> <span className="font-bold text-blue-600">{job.status}</span></p>
                </div>

                <UpdateStatusButton token={token} label={actionLabel} />
            </div>
        </div>
    );
}
