
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const email = 'admin@egfulfill.com';
    const password = '123456';

    console.log(`Creating admin user: ${email}...`);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
        where: { email },
    });

    if (existingUser) {
        console.log('User already exists. Updating password and role...');
        const passwordHash = await bcrypt.hash(password, 10);
        await prisma.user.update({
            where: { email },
            data: {
                passwordHash,
                role: 'ADMIN',
                isActive: true,
            },
        });
        console.log('Admin user updated successfully.');
    } else {
        console.log('Creating new user...');
        const passwordHash = await bcrypt.hash(password, 10);
        await prisma.user.create({
            data: {
                email,
                passwordHash,
                role: 'ADMIN',
                isActive: true,
            },
        });
        console.log('Admin user created successfully.');
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
