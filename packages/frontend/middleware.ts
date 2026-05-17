import { NextRequest, NextResponse } from 'next/server';

const protectedRoutes = ['/explore', '/vision'];

export function middleware(request: NextRequest) {
  const token = request.cookies.get('firebaseToken')?.value;

  // Check if route is protected
  const isProtectedRoute = protectedRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route)
  );

  if (isProtectedRoute && !token) {
    // Redirect to login if no token
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Allow public routes
  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
