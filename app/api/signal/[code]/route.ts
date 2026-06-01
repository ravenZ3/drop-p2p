import kv from '@/lib/kv';
import { NextResponse } from 'next/server';

type Session = { offer: string; answer?: string };

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await kv.get(`signal:${code}`) as Session | null;
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(session);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { answer } = await req.json();
  if (!answer) return NextResponse.json({ error: 'missing answer' }, { status: 400 });

  const session = await kv.get(`signal:${code}`) as Session | null;
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await kv.set(`signal:${code}`, { ...session, answer }, { ex: 600 });
  return NextResponse.json({ ok: true });
}
