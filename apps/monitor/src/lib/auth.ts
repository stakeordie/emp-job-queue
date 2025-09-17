// Simple authentication using cookies and environment variables
import { cookies } from 'next/headers'

export interface User {
  id: string;
  email: string;
  name: string;
}

// Simple hardcoded users for development
const USERS: User[] = [
  { id: '1', email: 'sandy@emprops.ai', name: 'Sandy' },
  { id: '2', email: 'admin@emprops.ai', name: 'Admin' },
]

const PASSWORDS: Record<string, string> = {
  'sandy@emprops.ai': '***REMOVED***',
  'admin@emprops.ai': '***REMOVED***',
}

const AUTH_COOKIE = 'auth-token'

export function validateCredentials(email: string, password: string): User | null {
  if (PASSWORDS[email] === password) {
    return USERS.find(u => u.email === email) || null
  }
  return null
}

export function createAuthToken(user: User): string {
  // Simple token (in production, use JWT or secure session)
  return Buffer.from(JSON.stringify(user)).toString('base64')
}

export function verifyAuthToken(token: string): User | null {
  try {
    const userJson = Buffer.from(token, 'base64').toString()
    return JSON.parse(userJson) as User
  } catch {
    return null
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE)?.value

  if (!token) {
    return null
  }

  return verifyAuthToken(token)
}

export function setAuthCookie(user: User) {
  const token = createAuthToken(user)
  return {
    name: AUTH_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  }
}

export function clearAuthCookie() {
  return {
    name: AUTH_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 0,
  }
}