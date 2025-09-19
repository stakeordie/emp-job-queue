// Simple authentication using cookies and environment variables
import { cookies } from 'next/headers';
import { createHash } from 'crypto';

export interface User {
  id: string;
  email: string;
  name: string;
}

// Simple hardcoded users for development
const USERS: User[] = [
  { id: '1', email: 'sandy@emprops.ai', name: 'Sandy' },
  { id: '2', email: 'admin@emprops.ai', name: 'Admin' },
];

// Hashed passwords using AUTH_BYPASS as salt
// Pre-computed hashes for: sandy@emprops.ai:Ne1h810s, admin@emprops.ai:admin123
const PASSWORD_HASHES: Record<string, string> = {
  'sandy@emprops.ai': 'd3ff7c45387f1fd905c996d502f2e47b32201a825fc45a5b17c495abb2445b7d',
  'admin@emprops.ai': 'e6facbe3483c7e08a2dc8bd51562d409d1b5a54d9783c2f63d169cce10c5ef54',
};

const AUTH_COOKIE = 'auth-token';

function hashPassword(email: string, password: string): string {
  const salt = process.env.AUTH_BYPASS || 'fallback-salt';
  return createHash('sha256').update(`${email}:${password}:${salt}`).digest('hex');
}

export function validateCredentials(email: string, password: string): User | null {
  const hashedAttempt = hashPassword(email, password);
  if (PASSWORD_HASHES[email] === hashedAttempt) {
    return USERS.find(u => u.email === email) || null;
  }
  return null;
}

export function createAuthToken(user: User): string {
  // Simple token (in production, use JWT or secure session)
  return Buffer.from(JSON.stringify(user)).toString('base64');
}

export function verifyAuthToken(token: string): User | null {
  try {
    const userJson = Buffer.from(token, 'base64').toString();
    return JSON.parse(userJson) as User;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;

  if (!token) {
    return null;
  }

  return verifyAuthToken(token);
}

export function setAuthCookie(user: User) {
  const token = createAuthToken(user);
  return {
    name: AUTH_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  };
}

export function clearAuthCookie() {
  return {
    name: AUTH_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 0,
  };
}
