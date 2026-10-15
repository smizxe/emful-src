require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

const REQUIRED_CONFIRMATION = 'RESET_BUSINESS_DATA';

async function main() {
  const confirmation = process.env.RESET_CONFIRM;

  if (confirmation !== REQUIRED_CONFIRMATION) {
    console.error(`Refusing to run. Set RESET_CONFIRM=${REQUIRED_CONFIRMATION} to continue.`);
    process.exit(1);
  }

  console.log('Starting business data reset...');

  const before = await Promise.all([
    prisma.user.count(),
    prisma.seller.count(),
    prisma.wallet.count(),
    prisma.order.count(),
    prisma.job.count(),
    prisma.shipment.count(),
    prisma.ticket.count(),
    prisma.ticketMessage.count(),
    prisma.ticketAttachment.count(),
    prisma.notification.count(),
    prisma.walletLedger.count(),
    prisma.topupRequest.count(),
    prisma.inventoryItem.count(),
    prisma.inventoryMovement.count(),
    prisma.product.count(),
    prisma.productVariant.count(),
    prisma.productImage.count(),
    prisma.productTemplate.count(),
    prisma.paymentMethod.count(),
    prisma.auditLog.count(),
    prisma.verificationToken.count(),
  ]);

  console.log('Current counts:', {
    users: before[0],
    sellers: before[1],
    wallets: before[2],
    orders: before[3],
    jobs: before[4],
    shipments: before[5],
    tickets: before[6],
    ticketMessages: before[7],
    ticketAttachments: before[8],
    notifications: before[9],
    walletLedger: before[10],
    topupRequests: before[11],
    inventoryItems: before[12],
    inventoryMovements: before[13],
    products: before[14],
    productVariants: before[15],
    productImages: before[16],
    productTemplates: before[17],
    paymentMethods: before[18],
    auditLogs: before[19],
    verificationTokens: before[20],
  });

  await prisma.$transaction(async (tx) => {
    await tx.ticketAttachment.deleteMany();
    await tx.ticketMessage.deleteMany();
    await tx.ticket.deleteMany();

    await tx.qrToken.deleteMany();
    await tx.shipment.deleteMany();
    await tx.job.deleteMany();
    await tx.order.deleteMany();

    await tx.notification.deleteMany();
    await tx.auditLog.deleteMany();
    await tx.verificationToken.deleteMany();

    await tx.walletLedger.deleteMany();
    await tx.topupRequest.deleteMany();
    await tx.wallet.updateMany({
      data: {
        balance: 0,
      },
    });

    await tx.inventoryMovement.deleteMany();
    await tx.inventoryItem.deleteMany();

    await tx.productImage.deleteMany();
    await tx.productVariant.deleteMany();
    await tx.product.deleteMany();
    await tx.productTemplate.deleteMany();

    await tx.paymentMethod.deleteMany();
  }, {
    maxWait: 20000,
    timeout: 120000,
  });

  const after = await Promise.all([
    prisma.user.count(),
    prisma.seller.count(),
    prisma.wallet.count(),
    prisma.order.count(),
    prisma.job.count(),
    prisma.shipment.count(),
    prisma.ticket.count(),
    prisma.walletLedger.count(),
    prisma.topupRequest.count(),
    prisma.inventoryItem.count(),
    prisma.product.count(),
    prisma.paymentMethod.count(),
  ]);

  console.log('Reset completed successfully.');
  console.log('Remaining counts:', {
    users: after[0],
    sellers: after[1],
    wallets: after[2],
    orders: after[3],
    jobs: after[4],
    shipments: after[5],
    tickets: after[6],
    walletLedger: after[7],
    topupRequests: after[8],
    inventoryItems: after[9],
    products: after[10],
    paymentMethods: after[11],
  });
  console.log('Wallet balances have been reset to 0. User accounts, roles, seller profiles, and wallet records were preserved.');
}

main()
  .catch((error) => {
    console.error('Business data reset failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
