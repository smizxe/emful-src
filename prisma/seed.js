const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // 1. Create Admin
    const admin = await prisma.user.upsert({
        where: { email: 'admin@egfulfill.local' },
        update: {},
        create: {
            email: 'admin@egfulfill.local',
            passwordHash: 'admin123',
            role: 'ADMIN',
        },
    });
    console.log('✅ Admin user ready');

    // 2. Create Seller
    const sellerUser = await prisma.user.upsert({
        where: { email: 'seller@test.local' },
        update: {},
        create: {
            email: 'seller@test.local',
            passwordHash: 'seller123',
            role: 'SELLER',
            seller: {
                create: {
                    code: 'SEL001',
                    name: 'Jenny Test Seller',
                    contactEmail: 'jenny@test.local',
                    wallet: {
                        create: {
                            balance: 10000.0,
                            currency: 'USD',
                        },
                    },
                },
            },
        },
        include: { seller: { include: { wallet: true } } }
    });
    console.log('✅ Seller user and wallet ready ($10,000)');

    const seller = sellerUser.seller;

    // 3. Products and Variants
    const productsData = [
        {
            sku: 'TSHIRT-BASIC',
            name: 'Basic Cotton T-Shirt',
            variants: [
                { color: 'Black', size: 'S', price: 12.0 },
                { color: 'Black', size: 'M', price: 12.0 },
                { color: 'Black', size: 'L', price: 12.0 },
                { color: 'Black', size: 'XL', price: 14.0 },
                { color: 'White', size: 'S', price: 11.0 },
                { color: 'White', size: 'M', price: 11.0 },
                { color: 'White', size: 'L', price: 11.0 },
                { color: 'White', size: 'XL', price: 13.0 },
            ]
        },
        {
            sku: 'HOODIE-PREM',
            name: 'Premium Heavy Hoodie',
            variants: [
                { color: 'Black', size: 'S', price: 25.0 },
                { color: 'Black', size: 'M', price: 25.0 },
                { color: 'Black', size: 'L', price: 25.0 },
                { color: 'Black', size: 'XL', price: 27.0 },
                { color: 'Black', size: '5XL', price: 35.0 },
                { color: 'Gray', size: 'L', price: 24.0 },
            ]
        },
        {
            sku: 'EG-6014',
            name: 'Special Edition Cap EG-6014',
            variants: [
                { color: 'Black', size: 'L', price: 15.0 },
                { color: 'Black', size: '5XL', price: 18.0 },
            ]
        }
    ];

    for (const pData of productsData) {
        const product = await prisma.product.upsert({
            where: { sku: pData.sku },
            update: { name: pData.name },
            create: {
                sku: pData.sku,
                name: pData.name,
            },
        });

        for (const vData of pData.variants) {
            await prisma.productVariant.upsert({
                where: {
                    productId_color_size: {
                        productId: product.id,
                        color: vData.color,
                        size: vData.size,
                    }
                },
                update: {
                    basePrice: vData.price,
                    cogsEstimate: vData.price * 0.6,
                },
                create: {
                    productId: product.id,
                    color: vData.color,
                    size: vData.size,
                    basePrice: vData.price,
                    cogsEstimate: vData.price * 0.6,
                },
            });

            // Also create InventoryItem for each variant
            await prisma.inventoryItem.upsert({
                where: {
                    sku_color_size: {
                        sku: pData.sku,
                        color: vData.color,
                        size: vData.size,
                    }
                },
                update: {},
                create: {
                    sku: pData.sku,
                    color: vData.color,
                    size: vData.size,
                    onHand: 500,
                    reserved: 0,
                }
            });
        }
        console.log(`✅ Product ${pData.sku} ready with variants and inventory`);
    }

    console.log('🏁 Seeding completed successfully!');
}

main()
    .catch((e) => {
        console.error('❌ Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
