import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const prismaClientSingleton = () => {
    // Append connection_limit=1 for serverless environments to prevent pool exhaustion if not using PgBouncer
    // Note: Best practice is to use Transaction Mode (port 6543) with ?pgbouncer=true
    let url = process.env.DATABASE_URL;

    if (process.env.NODE_ENV === 'production' && url && !url.includes('connection_limit')) {
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}connection_limit=1`;
    }

    return new PrismaClient({
        log: ['error', 'warn'],
        datasources: {
            db: {
                url,
            },
        },
    });
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
