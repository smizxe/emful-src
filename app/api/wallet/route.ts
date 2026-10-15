import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notifyTopup } from '@/lib/notifications';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const userId = cookieStore.get('userId')?.value;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        seller: {
          select: {
            id: true,
            wallet: {
              select: {
                balance: true
              }
            }
          }
        }
      }
    });

    if (!user || !user.seller) {
      return NextResponse.json({ error: 'Seller account not found' }, { status: 404 });
    }

    const sellerId = user.seller.id;
    const balance = user.seller.wallet?.balance || 0;

    if (searchParams.get('summary') === 'true') {
      const response = NextResponse.json({
        balance,
        currency: 'USD',
        sellerId,
        userId: user.id
      });
      response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=120');
      response.headers.set('Vary', 'Cookie');
      return response;
    }

    const [ledger, pending] = await Promise.all([
      prisma.walletLedger.findMany({
        where: { sellerId },
        orderBy: { createdAt: 'desc' },
        take: 20
      }),
      prisma.topupRequest.findMany({
        where: { sellerId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    // Normalize transactions for frontend
    const transactions = [
      ...pending.map(p => ({
        id: p.id,
        type: 'TOP_UP_REQUEST',
        amount: p.amount,
        status: 'PENDING',
        createdAt: p.createdAt,
        note: p.transferContent
      })),
      ...ledger.map(l => ({
        id: l.id,
        type: l.type, // CREDIT, DEBIT
        amount: l.amount,
        status: 'COMPLETED',
        createdAt: l.createdAt,
        note: l.note
      }))
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const response = NextResponse.json({
      balance,
      transactions,
      email: user.email,
      sellerId,
      userId: user.id
    });
    response.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=30');
    response.headers.set('Vary', 'Cookie');
    return response;

  } catch (error) {
    console.error('Wallet API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch wallet data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const userId = cookieStore.get('userId')?.value;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { amount, transferContent, evidenceUrl, currency, paymentMethodId } = body;

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { seller: true }
    });

    if (!user || !user.seller) {
      return NextResponse.json({ error: 'Seller not found' }, { status: 404 });
    }

    // Determine currency type
    const isVND = currency === 'VND';

    // Fetch Rate only if VND
    let rate: number | null = null;
    let amountReceived: number;

    if (isVND) {
      const setting = await prisma.systemSetting.findUnique({ where: { key: 'VND_USD_RATE' } });
      rate = setting ? parseFloat(setting.value) : 25000;
      amountReceived = parseFloat(amount) / rate;
    } else {
      // USD direct - no conversion needed
      amountReceived = parseFloat(amount);
    }

    // Check Minimum Top-up ($100 USD)
    const MIN_TOPUP_USD = 100;
    // If currency is VND, convert to USD to check. Rate is usually > 20000.
    // Logic: amountReceived is already calculated. Use that for USD.
    // If currency is VND, usage: amountReceived = amount / rate (which results in USD value if logic above holds)
    // Looking at line 108: `amountReceived = parseFloat(amount) / rate;` (VND -> USD) or `parseFloat(amount)` (USD)
    // So amountReceived IS the USD value (or base currency value). Assumed Base Currency is USD.

    if (amountReceived < MIN_TOPUP_USD) {
      return NextResponse.json({
        error: `Minimum top-up is $${MIN_TOPUP_USD}. Your amount: $${amountReceived.toFixed(2)}`
      }, { status: 400 });
    }

    // Create Topup Request
    const topup = await prisma.topupRequest.create({
      data: {
        sellerId: user.seller.id,
        amount: parseFloat(amount),
        currency: currency || 'VND',
        exchangeRate: rate,
        amountReceived: amountReceived,
        transferContent: transferContent || `Topup from ${user.email}`,
        status: 'PENDING',
        evidenceUrl: evidenceUrl || null,
        paymentMethodId: paymentMethodId || null,
      }
    });

    // Notify Admin
    await notifyTopup(user.email, parseFloat(amount), currency || 'VND', 'REQUEST');

    return NextResponse.json(topup);

  } catch (error) {
    console.error('Topup Request Error:', error);
    return NextResponse.json({ error: 'Transaction failed' }, { status: 500 });
  }
}

