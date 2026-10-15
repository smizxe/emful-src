
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting data import...');

    const backupPath = path.join(process.cwd(), 'backup_data.json');
    if (!fs.existsSync(backupPath)) {
        console.error('Backup file not found!');
        process.exit(1);
    }

    const rawData = fs.readFileSync(backupPath, 'utf-8');
    const data = JSON.parse(rawData, (key, value) => {
        // Simple heuristic to recover dates
        // Checks if the string matches ISO 8601 format
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(value)) {
            return new Date(value);
        }
        return value;
    });

    console.log('Data loaded from JSON. Beginning insertion...');

    // Order matters for Foreign Key constraints
    // 1. Sellers
    if (data.sellers?.length) {
        console.log(`Importing ${data.sellers.length} Sellers...`);
        await prisma.seller.createMany({ data: data.sellers, skipDuplicates: true });
    }

    // 2. Users (depend on Sellers potentially)
    if (data.users?.length) {
        console.log(`Importing ${data.users.length} Users...`);
        await prisma.user.createMany({ data: data.users, skipDuplicates: true });
    }

    // 3. Wallets
    if (data.wallets?.length) {
        console.log(`Importing ${data.wallets.length} Wallets...`);
        await prisma.wallet.createMany({ data: data.wallets, skipDuplicates: true });
    }

    // 4. Products
    if (data.products?.length) {
        console.log(`Importing ${data.products.length} Products...`);
        await prisma.product.createMany({ data: data.products, skipDuplicates: true });
    }

    // 5. Product Variants
    if (data.productVariants?.length) {
        console.log(`Importing ${data.productVariants.length} Product Variants...`);
        await prisma.productVariant.createMany({ data: data.productVariants, skipDuplicates: true });
    }

    // 6. Inventory Items
    if (data.inventoryItems?.length) {
        console.log(`Importing ${data.inventoryItems.length} Inventory Items...`);
        await prisma.inventoryItem.createMany({ data: data.inventoryItems, skipDuplicates: true });
    }

    // 7. Orders
    if (data.orders?.length) {
        console.log(`Importing ${data.orders.length} Orders...`);
        await prisma.order.createMany({ data: data.orders, skipDuplicates: true });
    }

    // 8. Jobs
    if (data.jobs?.length) {
        console.log(`Importing ${data.jobs.length} Jobs...`);
        await prisma.job.createMany({ data: data.jobs, skipDuplicates: true });
    }

    // 9. Shipments
    if (data.shipments?.length) {
        console.log(`Importing ${data.shipments.length} Shipments...`);
        await prisma.shipment.createMany({ data: data.shipments, skipDuplicates: true });
    }

    // 10. Topup Requests
    if (data.topupRequests?.length) {
        console.log(`Importing ${data.topupRequests.length} Topup Requests...`);
        await prisma.topupRequest.createMany({ data: data.topupRequests, skipDuplicates: true });
    }

    // 11. Wallet Ledgers
    if (data.walletLedgers?.length) {
        console.log(`Importing ${data.walletLedgers.length} Wallet Ledgers...`);
        await prisma.walletLedger.createMany({ data: data.walletLedgers, skipDuplicates: true });
    }

    // 12. Audit Logs
    if (data.auditLogs?.length) {
        console.log(`Importing ${data.auditLogs.length} Audit Logs...`);
        await prisma.auditLog.createMany({ data: data.auditLogs, skipDuplicates: true });
    }

    // 13. Inventory Movements
    if (data.inventoryMovements?.length) {
        console.log(`Importing ${data.inventoryMovements.length} Inventory Movements...`);
        await prisma.inventoryMovement.createMany({ data: data.inventoryMovements, skipDuplicates: true });
    }

    // 14. Verification Tokens
    if (data.verificationTokens?.length) {
        console.log(`Importing ${data.verificationTokens.length} Verification Tokens...`);
        await prisma.verificationToken.createMany({ data: data.verificationTokens, skipDuplicates: true });
    }

    // 15. QrTokens
    if (data.qrTokens?.length) {
        console.log(`Importing ${data.qrTokens.length} QrTokens...`);
        await prisma.qrToken.createMany({ data: data.qrTokens, skipDuplicates: true });
    }

    console.log('Data import completed successfully!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
