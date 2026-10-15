
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting data export...');

    const data = {
        users: await prisma.user.findMany(),
        verificationTokens: await prisma.verificationToken.findMany(),
        sellers: await prisma.seller.findMany(),
        wallets: await prisma.wallet.findMany(),
        walletLedgers: await prisma.walletLedger.findMany(),
        topupRequests: await prisma.topupRequest.findMany(),
        products: await prisma.product.findMany(),
        productVariants: await prisma.productVariant.findMany(),
        inventoryItems: await prisma.inventoryItem.findMany(),
        inventoryMovements: await prisma.inventoryMovement.findMany(),
        orders: await prisma.order.findMany(),
        jobs: await prisma.job.findMany(),
        qrTokens: await prisma.qrToken.findMany(),
        shipments: await prisma.shipment.findMany(),
        auditLogs: await prisma.auditLog.findMany(),
    };

    const backupPath = path.join(process.cwd(), 'backup_data.json');
    fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));

    console.log(`Data exported successfully to ${backupPath}`);
    console.log('Summary:');
    Object.entries(data).forEach(([key, value]) => {
        console.log(`- ${key}: ${value.length} records`);
    });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
