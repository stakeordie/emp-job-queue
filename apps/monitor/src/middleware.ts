import { NextRequest, NextResponse } from 'next/server'
import { verifyAuthToken } from '@/lib/auth'

const publicPaths = ['/login', '/api/auth/login', '/miniapp-gen-mock', '/api/user_notified', '/api/health', '/api/metrics']

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // Allow public paths
  if (publicPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  // Check for bypass auth query parameter
  const bypassAuth = searchParams.get('auth')
  const expectedBypass = process.env.AUTH_BYPASS
  if (expectedBypass && bypassAuth === expectedBypass) {
    return NextResponse.next()
  }

  // Check for auth token
  const token = request.cookies.get('auth-token')?.value

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Verify token
  const user = verifyAuthToken(token)
  if (!user) {
    const response = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.delete('auth-token')
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}