
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { sendVerificationEmail } from '@/lib/email';
import { notifyAdminNewUser } from '@/lib/notifications';
import { v4 as uuidv4 } from 'uuid';
import { getUserAccessStatus } from '@/lib/userAccess';

export async function POST(request: Request) {
    try {
        const { name, email, password } = await request.json();

        if (!email || !password || !name) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            const accessStatus = getUserAccessStatus(existingUser as any);
            if (accessStatus.blocked && accessStatus.code === 'BANNED') {
                return NextResponse.json({ error: accessStatus.message, code: accessStatus.code }, { status: 403 });
            }
            return NextResponse.json({ error: 'User already exists' }, { status: 409 });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create inactive user
        // Note: The schema doesn't have a 'name' field on User directly, but it might assume Seller profile or we need to adjust logic. 
        // The plan mentioned User { email, passwordHash, role, ... }
        // The schema shows User has NO name field, but Seller does.
        // For 'SELLER' role, we typically create a Seller record too?
        // Let's assume for now we create a Seller record linked to User if the role is SELLER (default).

        // Transaction to ensure consistency
        const newUser = await prisma.$transaction(async (tx) => {
            // Create Seller profile first or together?
            // "role" defaults to SELLER.
            // Let's create a Seller entity for this user to store the name.

            const seller = await tx.seller.create({
                data: {
                    name: name,
                    code: 'TB_GEN_' + Math.floor(Math.random() * 100000), // temp code generation
                    contactEmail: email,
                }
            });

            const user = await tx.user.create({
                data: {
                    email,
                    name, // Added name
                    passwordHash,
                    role: 'SELLER',
                    isActive: false, // Inactive until verified
                    sellerId: seller.id
                },
            });

            // Create Wallet for seller
            await tx.wallet.create({
                data: {
                    sellerId: seller.id,
                }
            });

            return user;
        });

        // Generate OTP
        const token = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit code
        const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Save Verification Token
        await prisma.verificationToken.create({
            data: {
                identifier: email,
                token,
                expires,
                userId: newUser.id
            }
        });

        // Send Email
        const emailSent = await sendVerificationEmail(email, token);

        if (!emailSent) {
            // Ideally rollback or warn. For now just warn.
            console.error('Failed to send verification email');
            return NextResponse.json({
                success: true,
                message: 'User created but failed to send email. Please contact support or try logging in to resend.',
                userId: newUser.id
            });
        }

        // Notify Admin
        await notifyAdminNewUser(email, name);

        return NextResponse.json({
            success: true,
            message: 'User registered successfully. Please check your email for the verification code.',
            userId: newUser.id
        });

    } catch (error) {
        console.error('Registration Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
