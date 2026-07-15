import { NextResponse } from 'next/server';
import { updateSession } from './lib/supabase/middleware';

export const runtime = 'nodejs';

export async function middleware(request) {
  const { response, user } = await updateSession(request);

  const { pathname } = request.nextUrl;

  // Public routes
  if (pathname === '/' || pathname.startsWith('/login') || pathname.startsWith('/signup') || pathname.startsWith('/auth')) {
    return response;
  }

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
