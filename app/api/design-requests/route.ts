import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-guard';
import { getUserAccessStatus } from '@/lib/userAccess';
import { hasAnyRole, hasRole } from '@/lib/roles';
import { promoteDesignRequestIfComplete } from '@/lib/promoteDesignRequest';
import { DEFAULT_POSITION } from '@/lib/positions';

// Design requests: artwork the shop needs a designer to create or fix.
// Admin/staff raise them from Production Release; the designer works them in the
// designer portal, where they can only touch their own fields (price, finished
// file, status). This route is not under /api/admin because designers use it too,
// so it does its own role check.

const ADMIN_ROLES = ['ADMIN', 'STAFF'];
const ALL_ROLES = [...ADMIN_ROLES, 'DESIGNER'];

/**
 * Resolve the caller, or the response to send back instead. Switching a designer
 * account off in admin has to actually shut the door, so this checks isActive as
 * well as the usual ban/suspension.
 */
type AuthUser = NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>;
type Authorized = { user: AuthUser; deny: null } | { user: null; deny: NextResponse };

async function authorize(roles: string[]): Promise<Authorized> {
    const user = await getAuthenticatedUser();
    if (!user || !hasAnyRole(user, roles)) {
        return { user: null, deny: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }
    if (!user.isActive) {
        return { user: null, deny: NextResponse.json({ error: 'This account is disabled.' }, { status: 403 }) };
    }
    const access = getUserAccessStatus(user as any);
    if (access.blocked) {
        return { user: null, deny: NextResponse.json({ error: access.message, code: access.code }, { status: 403 }) };
    }
    return { user, deny: null };
}

/**
 * Jobs carry free text in `mockup` as often as a link (a store name, a dash, a
 * note), so only something that is actually openable counts as a reference.
 */
function asUrl(value: unknown): string {
    const text = String(value ?? '').trim();
    return /^https?:\/\//i.test(text) ? text : '';
}

function parseDesigns(raw: string | null | undefined): any[] {
    try {
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * Put the finished artwork onto the job so it shows on the order and is there
 * when the label is printed — that is the whole point of the round trip.
 */
type PositionLink = { index: number; position: string; link: string };

function parseFileLinks(raw: string | null | undefined): PositionLink[] {
    try {
        const parsed = JSON.parse(raw || '[]');
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((p: any) => ({
                index: Number(p?.index),
                position: String(p?.position || ''),
                link: String(p?.link || '').trim(),
            }))
            .filter((p) => Number.isInteger(p.index) && p.index >= 0);
    } catch {
        return [];
    }
}

/**
 * Put the finished artwork onto the job so it shows on the order and is there
 * when the label is printed -- that is the whole point of the round trip.
 *
 * Each position gets its own file: a centre chest and a sleeve are two pieces
 * of artwork, and writing one link into the first slot left the sleeve with
 * nothing. `fallback` is the single link older requests carry.
 */
async function applyFileLinksToJob(jobId: string, links: PositionLink[], fallback: string) {
    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, designs: true } });
    if (!job) return;

    const designs = parseDesigns(job.designs);
    const usable = links.filter((l) => l.link);

    if (usable.length > 0 && designs.length > 0) {
        for (const { index, link } of usable) {
            if (index < designs.length) designs[index] = { ...designs[index], url: link };
        }
    } else if (fallback) {
        if (designs.length > 0) {
            // A revision replaces the artwork that was already on the job.
            designs[0] = { ...designs[0], url: fallback };
        } else {
            designs.push({ url: fallback, location: DEFAULT_POSITION, position: DEFAULT_POSITION, mockup: '', type: 'Embroidery' });
        }
    } else {
        return;
    }

    // Artwork that arrives for a design with no position goes where its mockup
    // shows, the same default the import uses, so the order can move on.
    for (const d of designs) {
        if (String(d?.url || '').trim() && !String(d?.position || d?.location || '').trim()) {
            d.location = DEFAULT_POSITION;
            d.position = DEFAULT_POSITION;
        }
    }

    await prisma.job.update({ where: { id: job.id }, data: { designs: JSON.stringify(designs) } });
}

/**
 * Remember the corrected artwork against the seller's own SKU, so that seller
 * can look it up next time. Lookup only: nothing is applied to an order by
 * itself, and one seller never sees another's fixes.
 */
async function rememberSellerFix(request: { sellerId: string; sellerSku: string; fileLink: string; sku: string; orderCode: string; jobId: string; note: string }) {
    const sellerSku = (request.sellerSku || '').trim();
    if (!request.sellerId || !sellerSku || !request.fileLink) return;

    await prisma.sellerDesignFix.upsert({
        where: { sellerId_sellerSku: { sellerId: request.sellerId, sellerSku } },
        create: {
            sellerId: request.sellerId,
            sellerSku,
            fileLink: request.fileLink,
            sku: request.sku || '',
            orderCode: request.orderCode || '',
            jobId: request.jobId || '',
            note: request.note || '',
        },
        // A later fix for the same SKU replaces the older one.
        update: {
            fileLink: request.fileLink,
            sku: request.sku || '',
            orderCode: request.orderCode || '',
            jobId: request.jobId || '',
            note: request.note || '',
        },
    });
}

export async function GET(request: Request) {
    const { user, deny } = await authorize(ALL_ROLES);
    if (deny) return deny;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = (searchParams.get('search') || '').trim();

    const where: any = {};
    if (status && status !== 'ALL') where.status = status;

    // A designer sees the sellers they look after, plus anything not routed to
    // anyone yet so nothing can go unnoticed. Admin and staff see everything.
    const isAdminSide = hasAnyRole(user, ADMIN_ROLES);
    if (!isAdminSide) {
        where.assignedDesignerId = { in: [user.id, ''] };
    }

    const sellerId = searchParams.get('sellerId');
    if (sellerId && sellerId !== 'ALL') where.sellerId = sellerId;

    // Date range, for settling up with the designer over a month.
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const createdAt: any = {};
    if (from && !Number.isNaN(Date.parse(from))) createdAt.gte = new Date(from);
    if (to && !Number.isNaN(Date.parse(to))) createdAt.lte = new Date(to);
    if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;
    if (search) {
        where.OR = [
            { orderCode: { contains: search, mode: 'insensitive' } },
            { customerName: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
            { sellerSku: { contains: search, mode: 'insensitive' } },
            { sellerName: { contains: search, mode: 'insensitive' } },
        ];
    }

    // Production Release only needs to know which jobs are already in the queue,
    // so it can mark those rows.
    if (searchParams.get('fields') === 'jobIds') {
        const rows = await prisma.designRequest.findMany({ select: { jobId: true, status: true } });
        return NextResponse.json({ jobIds: rows.map((r) => r.jobId), rows });
    }

    // The sidebar badge only needs a number.
    if (searchParams.get('count') === 'true') {
        const count = await prisma.designRequest.count({ where });
        return NextResponse.json({ count });
    }

    const requests = await prisma.designRequest.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: 500,
    });

    // The sheet can carry up to four positions, each with its own mockup. The
    // designer needs all of them, not just the first -- one price covers the lot.
    const jobs = await prisma.job.findMany({
        where: { id: { in: requests.map((r) => r.jobId) } },
        select: { id: true, designs: true, notes: true },
    });
    const jobById = new Map(jobs.map((job) => [job.id, job]));

    const withPositions = requests.map((request) => {
        const job = jobById.get(request.jobId);
        const finished = parseFileLinks(request.fileLinks);
        const positions = parseDesigns(job?.designs)
            .map((design: any, index: number) => ({
                index,
                fileLink: finished.find((f) => f.index === index)?.link || '',
                position: String(design?.position || design?.location || '').trim(),
                mockup: String(design?.mockup || '').trim(),
                link: String(design?.url || '').trim(),
                type: String(design?.type || '').trim(),
            }))
            // A row with nothing in it is not worth showing the designer.
            .filter((p) => p.position || p.mockup || p.link);
        return { ...request, positions, sheetNote: job?.notes || '' };
    });

    return NextResponse.json({ requests: withPositions, role: user.role, canDesign: hasRole(user, 'DESIGNER') });
}

/** Raise a design request for a job (admin/staff only). */
export async function POST(request: Request) {
    const { user, deny } = await authorize(ADMIN_ROLES);
    if (deny) return deny;

    try {
        const { jobId, type, designLink, note } = await request.json();
        if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 });

        const requestType = String(type || 'NEW').toUpperCase() === 'REVISION' ? 'REVISION' : 'NEW';

        const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: {
                id: true, orderId: true, sellerId: true, sku: true, shippingLabel: true,
                recipientName: true, designs: true, notes: true,
                order: { select: { orderCode: true } },
                seller: { select: { name: true } },
            },
        });
        if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

        const existing = await prisma.designRequest.findUnique({ where: { jobId } });
        if (existing) {
            return NextResponse.json({ error: `This job already has a design request (${existing.status}).` }, { status: 409 });
        }

        // Route it to whoever looks after this seller.
        const assignment = await prisma.designerAssignment.findUnique({
            where: { sellerId: job.sellerId },
            select: { designerId: true },
        });
        let assignedDesignerId = '';
        let assignedDesignerName = '';
        if (assignment?.designerId) {
            const designer = await prisma.user.findUnique({
                where: { id: assignment.designerId },
                select: { id: true, name: true, email: true, isActive: true },
            });
            // A switched-off account must not have work parked on it.
            if (designer?.isActive) {
                assignedDesignerId = designer.id;
                assignedDesignerName = designer.name || designer.email;
            }
        }

        // Hand the designer whatever artwork reference the job already carries.
        const firstDesign = parseDesigns(job.designs)[0] || {};
        const reference = asUrl(designLink) || asUrl(firstDesign.mockup) || asUrl(firstDesign.url);

        const created = await prisma.designRequest.create({
            data: {
                jobId: job.id,
                orderId: job.orderId,
                orderCode: job.order?.orderCode || '',
                sellerId: job.sellerId,
                sellerName: job.seller?.name || '',
                customerName: job.recipientName || '',
                sku: job.sku || '',
                sellerSku: job.shippingLabel || '',
                type: requestType,
                designLink: reference,
                // Whatever the seller typed in the NOTE column of the import file is
                // what the designer needs to read. Still editable on either side.
                note: String(note ?? job.notes ?? '').trim(),
                createdBy: user.email || user.role,
                assignedDesignerId,
                assignedDesignerName,
            },
        });

        // Asking for a brand new design means emfulfill is making it, so the
        // order's Design column should say so. A revision is a fix to artwork that
        // already exists, so it leaves the answer alone.
        if (requestType === 'NEW') {
            await prisma.job.update({ where: { id: job.id }, data: { designBy: 'EM' } });
        }

        return NextResponse.json({ success: true, request: created });
    } catch (error: any) {
        console.error('Create design request error:', error);
        return NextResponse.json({ error: error.message || 'Failed to create design request' }, { status: 500 });
    }
}

/** Update a design request. Designers may only touch their own fields. */
export async function PATCH(request: Request) {
    const { user, deny } = await authorize(ALL_ROLES);
    if (deny) return deny;

    try {
        const body = await request.json();
        const { id } = body;
        if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

        const existing = await prisma.designRequest.findUnique({ where: { id } });
        if (!existing) return NextResponse.json({ error: 'Design request not found' }, { status: 404 });

        const isAdmin = hasAnyRole(user, ADMIN_ROLES);
        const isDesigner = hasRole(user, 'DESIGNER');
        const data: any = {};

        // Designer-owned fields.
        if (body.price !== undefined) data.price = body.price === null || body.price === '' ? null : Number(body.price);
        if (body.fileLink !== undefined) data.fileLink = String(body.fileLink || '');

        // One link per position. Merged by index, so saving the sleeve does not
        // wipe the chest, and the first link is mirrored into fileLink for the
        // places that still read a single file.
        if (Array.isArray(body.fileLinks)) {
            const merged = parseFileLinks(existing.fileLinks);
            for (const incoming of body.fileLinks) {
                const index = Number(incoming?.index);
                if (!Number.isInteger(index) || index < 0) continue;
                const entry = {
                    index,
                    position: String(incoming?.position || ''),
                    link: String(incoming?.link || '').trim(),
                };
                const at = merged.findIndex((m) => m.index === index);
                if (at === -1) merged.push(entry); else merged[at] = entry;
            }
            merged.sort((a, b) => a.index - b.index);
            data.fileLinks = JSON.stringify(merged);
            data.fileLink = merged.find((m) => m.link)?.link || '';
        }

        // Whether the artwork is done is the designer's call alone -- admin asks for
        // the work, the designer says when it is finished.
        if (body.status !== undefined) {
            if (!isDesigner) {
                return NextResponse.json({ error: 'Only a designer can change the status.' }, { status: 403 });
            }
            const next = String(body.status).toUpperCase() === 'FINISHED' ? 'FINISHED' : 'PENDING';
            data.status = next;
            data.finishedAt = next === 'FINISHED' ? new Date() : null;
        }

        // The note is the back-and-forth between admin and designer, so both write it.
        if (body.note !== undefined) data.note = String(body.note || '');

        // Admin-only fields.
        if (isAdmin) {
            if (body.type !== undefined) data.type = String(body.type).toUpperCase() === 'REVISION' ? 'REVISION' : 'NEW';
            if (body.designLink !== undefined) data.designLink = String(body.designLink || '');
            if (body.assignedDesignerId !== undefined) {
                const nextId = String(body.assignedDesignerId || '');
                if (!nextId) {
                    data.assignedDesignerId = '';
                    data.assignedDesignerName = '';
                } else {
                    const designer = await prisma.user.findUnique({
                        where: { id: nextId },
                        select: { id: true, name: true, email: true, role: true, roles: true },
                    });
                    const holdsDesigner = designer
                        && (designer.role === 'DESIGNER' || (designer.roles || []).includes('DESIGNER'));
                    if (!holdsDesigner) {
                        return NextResponse.json({ error: 'That account is not a designer' }, { status: 400 });
                    }
                    data.assignedDesignerId = designer.id;
                    data.assignedDesignerName = designer.name || designer.email;
                }
            }
        }

        const updated = await prisma.designRequest.update({ where: { id }, data });

        // Once the artwork is finished, push it onto the job so it rides along with
        // the order and the printed label.
        const fileLink = (updated.fileLink || '').trim();
        const positionLinks = parseFileLinks(updated.fileLinks);
        let promotion: Awaited<ReturnType<typeof promoteDesignRequestIfComplete>> | null = null;
        if (updated.status === 'FINISHED' && fileLink) {
            await applyFileLinksToJob(updated.jobId, positionLinks, fileLink);
            // Delivering the artwork can be the last thing an order was waiting on,
            // so it prices itself and moves to Pending Approval without the seller
            // having to open it.
            promotion = await promoteDesignRequestIfComplete(updated.orderId);
        }

        if (updated.status === 'FINISHED' && fileLink) {
            await rememberSellerFix({
                sellerId: updated.sellerId,
                sellerSku: updated.sellerSku,
                fileLink,
                sku: updated.sku,
                orderCode: updated.orderCode,
                jobId: updated.jobId,
                note: updated.note,
            });
        }

        return NextResponse.json({ success: true, request: updated, promotion });
    } catch (error: any) {
        console.error('Update design request error:', error);
        return NextResponse.json({ error: error.message || 'Failed to update design request' }, { status: 500 });
    }
}

/** Remove a design request (admin only) — e.g. raised by mistake. */
export async function DELETE(request: Request) {
    const { deny } = await authorize(['ADMIN']);
    if (deny) return deny;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    await prisma.designRequest.deleteMany({ where: { id } });
    return NextResponse.json({ success: true });
}
