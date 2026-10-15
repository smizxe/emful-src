import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Starting database cleanup...\n');

    try {
        // 1. Find all products and their SKUs
        const allProducts = await prisma.product.findMany({
            select: { sku: true }
        });
        const productSkus = new Set(allProducts.map(p => p.sku));
        console.log(`📦 Found ${allProducts.length} products in database\n`);

        // 2. Check InventoryItems
        console.log('🔍 Checking InventoryItems...');
        const allInventoryItems = await prisma.inventoryItem.findMany();
        const orphanedItems = allInventoryItems.filter(item => !productSkus.has(item.sku));

        if (orphanedItems.length > 0) {
            const orphanedSkus = [...new Set(orphanedItems.map(i => i.sku))];
            console.log(`⚠️  Found ${orphanedItems.length} orphaned InventoryItems from ${orphanedSkus.length} SKUs:`);
            orphanedSkus.forEach(sku => {
                const count = orphanedItems.filter(i => i.sku === sku).length;
                console.log(`   - ${sku}: ${count} items`);
            });
        } else {
            console.log('✅ No orphaned InventoryItems found');
        }

        // 3. Check InventoryMovements
        console.log('\n🔍 Checking InventoryMovements...');
        const allMovements = await prisma.inventoryMovement.findMany();
        const orphanedMovements = allMovements.filter(mov => !productSkus.has(mov.sku));

        if (orphanedMovements.length > 0) {
            const orphanedMovementSkus = [...new Set(orphanedMovements.map(m => m.sku))];
            console.log(`⚠️  Found ${orphanedMovements.length} orphaned InventoryMovements from ${orphanedMovementSkus.length} SKUs:`);
            orphanedMovementSkus.forEach(sku => {
                const count = orphanedMovements.filter(m => m.sku === sku).length;
                console.log(`   - ${sku}: ${count} movements`);
            });
        } else {
            console.log('✅ No orphaned InventoryMovements found');
        }

        // 4. Special check for EM-18500
        console.log('\n🔎 Special check for EM-18500...');
        const em18500 = await prisma.product.findUnique({ where: { sku: 'EM-18500' } });
        const em18500Items = await prisma.inventoryItem.count({ where: { sku: 'EM-18500' } });
        const em18500Moves = await prisma.inventoryMovement.count({ where: { sku: 'EM-18500' } });

        console.log(`   Product exists: ${em18500 ? '✅ Yes (ID: ' + em18500.id + ')' : '❌ No'}`);
        console.log(`   InventoryItems: ${em18500Items}`);
        console.log(`   InventoryMovements: ${em18500Moves}`);

        // 5. Cleanup orphaned data
        if (orphanedItems.length > 0 || orphanedMovements.length > 0) {
            console.log('\n🗑️  Cleaning up orphaned data...\n');

            const orphanedSkus = [...new Set([
                ...orphanedItems.map(i => i.sku),
                ...orphanedMovements.map(m => m.sku)
            ])];

            for (const sku of orphanedSkus) {
                console.log(`   Cleaning SKU: ${sku}`);

                const deletedMovements = await prisma.inventoryMovement.deleteMany({
                    where: { sku }
                });
                console.log(`      - Deleted ${deletedMovements.count} movements`);

                const deletedItems = await prisma.inventoryItem.deleteMany({
                    where: { sku }
                });
                console.log(`      - Deleted ${deletedItems.count} items`);
            }

            console.log('\n✅ Cleanup completed!');
        } else {
            console.log('\n✅ Database is clean! No orphaned data.');
        }

        // 6. Final summary
        console.log('\n📊 Final Database Summary:');
        const summary = {
            products: await prisma.product.count(),
            variants: await prisma.productVariant.count(),
            inventoryItems: await prisma.inventoryItem.count(),
            inventoryMovements: await prisma.inventoryMovement.count(),
        };

        console.log(`   Products: ${summary.products}`);
        console.log(`   ProductVariants: ${summary.variants}`);
        console.log(`   InventoryItems: ${summary.inventoryItems}`);
        console.log(`   InventoryMovements: ${summary.inventoryMovements}`);

    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
