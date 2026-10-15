import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';
import { calculateItemCosts } from '@/lib/pricing';

export async function GET(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        // Fetch all jobs
        const jobs = await prisma.job.findMany({
            where: {
                // Filter jobs that look like they need fixing (0 shipping, 0 fees)
                // OR just fix all to be safe? Let's fix all PENDING/RECEIVED jobs
                status: { in: ['PENDING_APPROVAL', 'RECEIVED', 'PROCESSING'] }
            }
        });

        let updatedCount = 0;
        const productsCache: Record<string, any> = {};

        for (const job of jobs) {
            // Fetch product
            let product = productsCache[job.sku];
            if (!product) {
                product = await prisma.product.findUnique({ where: { sku: job.sku } });
                if (product) productsCache[job.sku] = product;
            }

            if (!product) continue;

            // Calculate correct costs
            const { shippingCost, extraFees } = calculateItemCosts(product, job.qty);

            // Update if different
            if (job.shippingCost !== shippingCost || job.extraFees !== extraFees) {
                await prisma.job.update({
                    where: { id: job.id },
                    data: {
                        shippingCost,
                        extraFees
                    }
                });
                updatedCount++;
            }
        }

        return NextResponse.json({ success: true, message: `Fixed ${updatedCount} jobs.` });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
