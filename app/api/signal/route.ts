import kv from '@/lib/kv';
import { NextResponse } from 'next/server';
import { randomCode } from '@/lib/words';

const TTL = 600;

export async function POST(req: Request) {
  const { offer } = await req.json();
  if (!offer) return NextResponse.json({ error: 'missing offer' }, { status: 400 });

  const code = randomCode();
  await kv.set(`signal:${code}`, { offer }, { ex: TTL });

  return NextResponse.json({ code });
}
