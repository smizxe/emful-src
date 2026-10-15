import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const { token: rawToken } = await request.json();

        if (!rawToken) {
            return NextResponse.json({ error: 'Token required' }, { status: 400 });
        }

        // Cleanup token - machine scanners may add whitespace or encode characters
        const token = String(rawToken).trim();

        // 1. Validate Token
        const qrToken = await prisma.qrToken.findUnique({
            where: { token },
            include: { job: true }
        });

        if (!qrToken) {
            return NextResponse.json({ error: 'Invalid Token' }, { status: 404 });
        }

        if (qrToken.type !== 'STATUS') {
            return NextResponse.json({ error: 'Invalid Token Type' }, { status: 400 });
        }

        if (qrToken.maxUses && qrToken.usedCount >= qrToken.maxUses) {
            return NextResponse.json({ error: 'Token already utilized fully' }, { status: 400 });
        }

        const job = qrToken.job;
        let newStatus = '';
        let message = '';

        // 2. Determine State Transition
        await prisma.$transaction(async (tx) => {
            if (job.status === 'RECEIVED') {
                newStatus = 'IN_PROCESS';
                message = 'Job started (Inventory Deducted)';

                // Deduct Inventory
                const sku = job.sku;
                const color = job.color || "";

                const invItem = await tx.inventoryItem.findFirst({
                    where: {
                        sku: sku,
                        color: color,
                        size: job.size || null
                    }
                });

                if (invItem) {
                    await tx.inventoryItem.update({
                        where: { id: invItem.id },
                        data: {
                            reserved: { decrement: job.qty },
                            onHand: { decrement: job.qty }
                        }
                    });

                    // Log Movement
                    await tx.inventoryMovement.create({
                        data: {
                            sku, color, size: job.size,
                            qtyChange: -job.qty,
                            type: 'DEDUCT',
                            refType: 'JOB_START',
                            refId: job.id,
                            createdById: null
                        }
                    });
                }
            } else if (job.status === 'IN_PROCESS') {
                newStatus = 'COMPLETED';
                message = 'Job Completed';
            } else if (job.status === 'COMPLETED') {
                throw new Error('Job is already COMPLETED');
            } else {
                throw new Error(`Invalid Job Status for scan: ${job.status}`);
            }

            // Update Job
            await tx.job.update({
                where: { id: job.id },
                data: { status: newStatus }
            });

            // Update Token Usage
            await tx.qrToken.update({
                where: { id: qrToken.id },
                data: { usedCount: { increment: 1 } }
            });

            // Audit
            await tx.auditLog.create({
                data: {
                    actorType: 'QR',
                    action: `UPDATE_STATUS_${newStatus}`,
                    entityType: 'JOB',
                    entityId: job.id
                }
            });

            // Check Parent Order Status
            // 1. If ALL jobs are completed -> Order COMPLETED
            const siblingJobs = await tx.job.findMany({
                where: { orderId: job.orderId }
            });
            const allCompleted = siblingJobs.every(j => (j.id === job.id ? newStatus === 'COMPLETED' : j.status === 'COMPLETED'));

            if (allCompleted) {
                await tx.order.update({
                    where: { id: job.orderId },
                    data: { status: 'COMPLETED' }
                });
            } else if (newStatus === 'IN_PROCESS') {
                // 2. If ANY job enters process -> Order IN_PROCESS (unless already active)
                const currentOrder = await tx.order.findUnique({ where: { id: job.orderId } });
                if (currentOrder && currentOrder.status === 'RECEIVED') {
                    await tx.order.update({
                        where: { id: job.orderId },
                        data: { status: 'IN_PROCESS' }
                    });
                }
            }
        });

        return NextResponse.json({ success: true, newStatus, message });

    } catch (error: any) {
        console.error(error);
        return NextResponse.json({ error: error.message || 'Scan failed' }, { status: 500 });
    }
}
