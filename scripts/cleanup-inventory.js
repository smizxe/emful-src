/**
 * Database Cleanup Script for Product Management
 * 
 * This script cleans up orphaned inventory data that doesn't have
 * corresponding products in the database.
 * 
 * Run with: node scripts/cleanup-inventory.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Starting database cleanup...\n');

    // 1. Find orphaned InventoryItems
    console.log('📦 Checking for orphaned InventoryItems...');
    const allInventoryItems = await prisma.inventoryItem.findMany({
        select: { sku: true }
    });

    const allProducts = await prisma.product.findMany({
        select: { sku: true }
    });

    const productSkus = new Set(allProducts.map(p => p.sku));
    const orphanedItems = allInventoryItems.filter(item => !productSkus.has(item.sku));

    if (orphanedItems.length > 0) {
        const orphanedSkus = [...new Set(orphanedItems.map(i => i.sku))];
        console.log(`   Found ${orphanedItems.length} orphaned items from ${orphanedSkus.length} SKUs:`);
        orphanedSkus.forEach(sku => {
            const count = orphanedItems.filter(i => i.sku === sku).length;
            console.log(`   - ${sku}: ${count} items`);
        });
    } else {
        console.log('   ✅ No orphaned InventoryItems found');
    }

    // 2. Find orphaned InventoryMovements
    console.log('\n📊 Checking for orphaned InventoryMovements...');
    const allMovements = await prisma.inventoryMovement.findMany({
        select: { sku: true }
    });

    const orphanedMovements = allMovements.filter(mov => !productSkus.has(mov.sku));

    if (orphanedMovements.length > 0) {
        const orphanedMovementSkus = [...new Set(orphanedMovements.map(m => m.sku))];
        console.log(`   Found ${orphanedMovements.length} orphaned movements from ${orphanedMovementSkus.length} SKUs:`);
        orphanedMovementSkus.forEach(sku => {
            const count = orphanedMovements.filter(m => m.sku === sku).length;
            console.log(`   - ${sku}: ${count} movements`);
        });
    } else {
        console.log('   ✅ No orphaned InventoryMovements found');
    }

    // 3. Check for specific SKU (EM-18500)
    console.log('\n🔎 Checking for EM-18500...');
    const em18500Product = await prisma.product.findUnique({
        where: { sku: 'EM-18500' }
    });
    const em18500Items = await prisma.inventoryItem.findMany({
        where: { sku: 'EM-18500' }
    });
    const em18500Movements = await prisma.inventoryMovement.findMany({
        where: { sku: 'EM-18500' }
    });

    console.log(`   Product exists: ${em18500Product ? '✅ Yes' : '❌ No'}`);
    console.log(`   InventoryItems: ${em18500Items.length}`);
    console.log(`   InventoryMovements: ${em18500Movements.length}`);

    if (!em18500Product && (em18500Items.length > 0 || em18500Movements.length > 0)) {
        console.log('   ⚠️  Orphaned data found for EM-18500!');
    }

    // 4. Cleanup confirmation
    if (orphanedItems.length > 0 || orphanedMovements.length > 0) {
        console.log('\n⚠️  Orphaned data found! Proceeding with cleanup...\n');

        // Delete orphaned movements first
        if (orphanedMovements.length > 0) {
            const orphanedMovementSkus = [...new Set(orphanedMovements.map(m => m.sku))];
            const deletedMovements = await prisma.inventoryMovement.deleteMany({
                where: { sku: { in: orphanedMovementSkus } }
            });
            console.log(`   🗑️  Deleted ${deletedMovements.count} orphaned InventoryMovements`);
        }

        // Delete orphaned items
        if (orphanedItems.length > 0) {
            const orphanedSkus = [...new Set(orphanedItems.map(i => i.sku))];
            const deletedItems = await prisma.inventoryItem.deleteMany({
                where: { sku: { in: orphanedSkus } }
            });
            console.log(`   🗑️  Deleted ${deletedItems.count} orphaned InventoryItems`);
        }

        console.log('\n✅ Cleanup completed!');
    } else {
        console.log('\n✅ Database is clean! No orphaned data found.');
    }

    // 5. Final verification
    console.log('\n📋 Final database status:');
    const totalProducts = await prisma.product.count();
    const totalVariants = await prisma.productVariant.count();
    const totalInventoryItems = await prisma.inventoryItem.count();
    const totalMovements = await prisma.inventoryMovement.count();

    console.log(`   Products: ${totalProducts}`);
    console.log(`   ProductVariants: ${totalVariants}`);
    console.log(`   InventoryItems: ${totalInventoryItems}`);
    console.log(`   InventoryMovements: ${totalMovements}`);
}

main()
    .catch((e) => {
        console.error('❌ Error during cleanup:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
