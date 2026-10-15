import { PrismaClient } from '@prisma/client';
import { calculateItemCosts } from '../lib/pricing';

const prisma = new PrismaClient();

async function main() {
    console.log("Starting Cost Backfill...");

    // Fetch all jobs, especially those with 0 shipping which might be incorrect
    const jobs = await prisma.job.findMany({
        where: {
            status: { in: ['PENDING_APPROVAL', 'RECEIVED', 'PROCESSING', 'REJECTED'] }
        }
    });

    console.log(`Found ${jobs.length} jobs to check.`);

    let updatedCount = 0;
    const productsCache: Record<string, any> = {};

    for (const job of jobs) {
        // Fetch product
        let product = productsCache[job.sku];
        if (!product) {
            product = await prisma.product.findUnique({ where: { sku: job.sku } });
            if (product) productsCache[job.sku] = product;
        }

        if (!product) {
            console.warn(`Product not found for SKU: ${job.sku}`);
            continue;
        }

        // Calculate correct costs
        const { shippingCost, extraFees } = calculateItemCosts(product, job.qty);

        // Update if different
        // Note: Using small epsilon for float comparison or just direct inequality
        if (job.shippingCost !== shippingCost || job.extraFees !== extraFees) {
            await prisma.job.update({
                where: { id: job.id },
                data: {
                    shippingCost,
                    extraFees
                }
            });
            updatedCount++;
            if (updatedCount % 10 === 0) process.stdout.write('.');
        }
    }

    console.log(`\nFixed ${updatedCount} jobs.`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
