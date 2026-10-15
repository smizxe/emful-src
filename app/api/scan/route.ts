import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
    const body = await request.json();
    let { code } = body; // Can be URL, Token, or F-JOB.../S-JOB...

    if (!code) {
        return NextResponse.json({ error: 'Code is required' }, { status: 400 });
    }

    code = code.trim();

    // Normalize URL: Add protocol if missing (for URLs like emfulfill.com/f/TOKEN)
    if (code.includes('/f/') || code.includes('/s/')) {
        if (!code.startsWith('http://') && !code.startsWith('https://')) {
            code = `https://${code}`;
        }
    }

    try {
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;

        // If user is logged in, link this job update to them
        let assignedStaffId: string | null = null;
        if (userId) assignedStaffId = userId;

        let type = '';
        let job = null;

        // --- STRATEGY 1: Try to resolve from QR Token (URL or Raw Token) ---
        let token = '';

        // Robust Token Extraction:
        // 1. Get last path segment
        // 2. Decode URI in case it was encoded
        // 3. Remove newlines, carriage returns, and other control characters
        // 4. Trim whitespace
        const rawPossibleToken = code.split('/').pop()?.split('?')[0] || '';
        const possibleToken = decodeURIComponent(rawPossibleToken)
            .replace(/[\r\n\t]/g, '') // Remove newlines, carriage returns, tabs
            .replace(/[^\x20-\x7E]/g, '') // Remove non-printable ASCII characters
            .trim();

        if (possibleToken && possibleToken.length > 10) {
            token = possibleToken;
        }

        // Fallback: Try strict UUID match
        if (!token) {
            const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
            const urlMatch = code.match(uuidRegex);
            if (urlMatch) token = urlMatch[0];
        }

        if (token) {
            const qrToken = await prisma.qrToken.findUnique({
                where: { token },
                include: {
                    job: {
                        include: { order: true }
                    }
                }
            });

            if (qrToken) {
                job = qrToken.job;
                type = qrToken.type; // 'STATUS' or 'FILE'
            }
        }

        // --- STRATEGY 2: Fallback to Manual Codes (F-JOB-..., S-JOB-...) ---
        // If Strategy 1 worked, we have 'token' and 'job'. If not, we try Strategy 2.
        if (!job) {
            let jobIdStr = '';

            // Clean up code if it was a URL but didn't match a token (edge case) or just plain text
            const urlParts = code.split('/');
            const potentialCode = urlParts[urlParts.length - 1];

            if (potentialCode.startsWith('F-')) {
                type = 'FILE';
                jobIdStr = potentialCode.substring(2); // Remove F-
            } else if (potentialCode.startsWith('S-')) {
                type = 'STATUS';
                jobIdStr = potentialCode.substring(2); // Remove S-
            } else if (code.startsWith('F-')) { // Check original code too
                type = 'FILE';
                jobIdStr = code.substring(2);
            } else if (code.startsWith('S-')) {
                type = 'STATUS';
                jobIdStr = code.substring(2);
            }

            if (jobIdStr) {
                job = await prisma.job.findFirst({
                    where: { jobCode: jobIdStr },
                    include: { order: true }
                });
            }
        }

        if (!job) {
            return NextResponse.json({ error: 'Job not found or Invalid Code' }, { status: 404 });
        }

        if (!type) {
            return NextResponse.json({ error: 'Unable to determine Scan Type (File/Status) from code' }, { status: 400 });
        }


        // --- LOGIC: Process Based on Type ---

        if (type === 'FILE') {
            // FIXED: Always return the File Viewer Page link instead of raw drive link.
            // This ensures all designs (legacy or new JSON format) are accessible.

            let appUrl = process.env.NEXT_PUBLIC_APP_URL || '';

            // Ensure appUrl has protocol
            if (appUrl && !appUrl.startsWith('http://') && !appUrl.startsWith('https://')) {
                appUrl = `https://${appUrl}`;
            }

            let fileViewerUrl = '';

            if (token) {
                // If we found via token, use that token
                fileViewerUrl = `${appUrl}/f/${token}`;
            } else {
                // If found via manual code (Strategy 2), find the FILE token for this job
                const fileTokenObj = await prisma.qrToken.findFirst({
                    where: { jobId: job.id, type: 'FILE' }
                });
                if (fileTokenObj) {
                    fileViewerUrl = `${appUrl}/f/${fileTokenObj.token}`;
                } else {
                    return NextResponse.json({ error: 'No File Viewer token found for this job' }, { status: 404 });
                }
            }

            return NextResponse.json({
                type: 'FILE',
                message: 'Opening File Viewer...',
                link: fileViewerUrl
            });
        }

        if (type === 'STATUS') {
            // Handle Status Transition
            let newStatus = '';
            let messageStr = '';

            // Require Login for Status Updates
            if (!userId) {
                return NextResponse.json({ error: 'Authentication required. Please login as Staff.' }, { status: 401 });
            }

            // Verify User Role (Must be ADMIN or STAFF)
            const staffUser = await prisma.user.findUnique({
                where: { id: userId },
                select: { role: true, email: true }
            });

            if (!staffUser || (staffUser.role !== 'ADMIN' && staffUser.role !== 'STAFF')) {
                return NextResponse.json({ error: 'Unauthorized. Only Staff or Admin can update status.' }, { status: 403 });
            }

            if (job.status === 'RECEIVED' || job.status === 'APPROVED') {
                newStatus = 'IN_PROCESS';
                messageStr = `Job Started by ${staffUser.email}`;

                await prisma.$transaction([
                    prisma.job.update({
                        where: { id: job.id },
                        data: {
                            status: newStatus,
                            assignedStaffId: assignedStaffId ?? undefined
                        }
                    }),
                    // Only decrement stock if moving from RECEIVED/APPROVED to IN_PROCESS (Start Production)
                    // ... (rest of transaction)

                    prisma.inventoryItem.updateMany({
                        where: {
                            sku: job.sku,
                            color: job.color,
                            size: job.size
                        },
                        data: {
                            onHand: { decrement: job.qty },
                            reserved: { decrement: job.qty }
                        }
                    }),
                    prisma.inventoryMovement.create({
                        data: {
                            sku: job.sku,
                            color: job.color,
                            size: job.size,
                            qtyChange: -job.qty,
                            type: 'PRODUCTION_USE',
                            refType: 'JOB',
                            refId: job.id,
                            createdById: userId
                        }
                    })
                ]);

            } else if (['IN_PROCESS', 'PRINTING', 'SEWING'].includes(job.status)) {
                newStatus = 'COMPLETED';
                messageStr = 'Job Completed (Ready for Shipping)';

                await prisma.$transaction(async (tx) => {
                    await tx.job.update({
                        where: { id: job.id },
                        data: {
                            status: newStatus,
                            assignedStaffId: assignedStaffId ?? undefined
                        }
                    });

                    // Check if all jobs for this order are finished (either COMPLETED, SHIPPED, or legacy READY_TO_SHIP)
                    const remainingJobs = await tx.job.count({
                        where: {
                            orderId: job.orderId,
                            status: { notIn: ['COMPLETED', 'SHIPPED', 'READY_TO_SHIP'] }
                        }
                    });

                    if (remainingJobs === 0) {
                        await tx.order.update({
                            where: { id: job.orderId },
                            data: { status: 'COMPLETED' }
                        });
                    }
                });

            } else if (job.status === 'COMPLETED') {
                return NextResponse.json({ error: 'Job is already COMPLETED' }, { status: 400 });
            }

            // Return success response linked to the new status
            return NextResponse.json({
                type: 'STATUS',
                message: messageStr,
                status: newStatus
            });
        }

        return NextResponse.json({ error: 'Unknown Action' }, { status: 400 });

    } catch (error: any) {
        console.error(error);
        return NextResponse.json({ error: error.message || 'Scan failed' }, { status: 500 });
    }
}
