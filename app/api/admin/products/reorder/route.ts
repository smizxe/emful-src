import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';

type ReorderPayload = {
  productId?: string;
  direction?: 'up' | 'down';
  position?: number;
  placement?: 'top' | 'bottom';
  orderedIds?: string[];
};

export async function POST(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
  try {
    const body = (await request.json()) as ReorderPayload;
    const { productId, direction, position, placement, orderedIds } = body;

    if (Array.isArray(orderedIds) && orderedIds.length > 0) {
      await prisma.$transaction(
        orderedIds.map((id, index) =>
          prisma.product.update({
            where: { id },
            data: { sortOrder: index + 1 },
          })
        )
      );

      return NextResponse.json({ success: true });
    }

    if (!productId) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
    }

    const orderedProducts = await prisma.product.findMany({
      select: { id: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    const currentIndex = orderedProducts.findIndex((product) => product.id === productId);
    if (currentIndex === -1) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const reordered = [...orderedProducts];

    if (placement === 'top' || placement === 'bottom') {
      const [moved] = reordered.splice(currentIndex, 1);
      reordered.splice(placement === 'top' ? 0 : reordered.length, 0, moved);
    } else if (typeof position === 'number' && Number.isFinite(position)) {
      const targetIndex = Math.max(0, Math.min(reordered.length - 1, Math.floor(position) - 1));
      const [moved] = reordered.splice(currentIndex, 1);
      reordered.splice(targetIndex, 0, moved);
    } else if (direction === 'up' || direction === 'down') {
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= reordered.length) {
        return NextResponse.json({ success: true });
      }

      [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];
    } else {
      return NextResponse.json({ error: 'Direction, position, placement, or ordered IDs are required' }, { status: 400 });
    }

    await prisma.$transaction(
      reordered.map((product, index) =>
        prisma.product.update({
          where: { id: product.id },
          data: { sortOrder: index + 1 },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Product reorder error:', error);
    return NextResponse.json({ error: 'Failed to reorder products' }, { status: 500 });
  }
}
