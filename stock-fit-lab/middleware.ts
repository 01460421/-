import { NextResponse, type NextRequest } from 'next/server';

/** 首次造訪時發放匿名使用者 id cookie（一年，httpOnly） */
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  if (!req.cookies.get('sfl_uid')) {
    res.cookies.set('sfl_uid', crypto.randomUUID(), { httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365, path: '/', secure: process.env.NODE_ENV === 'production' });
  }
  return res;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
