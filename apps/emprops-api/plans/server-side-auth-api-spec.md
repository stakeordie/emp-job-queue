# Server-Side Authentication API Specification

## Overview

This document specifies the authentication API endpoints needed to support the EmProps OpenStudio frontend's server-side authentication system. The frontend has been refactored to use server-side auth instead of client-side Dynamic Labs authentication.

## Base URL

The API should be accessible from the Next.js backend at: `http://localhost:3000/api/auth/`

## Authentication Flow

1. User authentication is handled server-side via JWT tokens stored in HTTP-only cookies
2. The frontend makes requests to Next.js API routes (`/api/auth/*`)
3. These Next.js API routes proxy to your backend authentication service
4. JWT tokens are validated against your user database
5. User profile and credits data come from your database, not from Dynamic Labs

## Required API Endpoints

### 1. Get Current User (`GET /api/auth/me`)

**Current Implementation:** `/pages/api/auth/me.ts` (currently mocked)

**Purpose:** Retrieve the currently authenticated user's profile and auth status

**Request:**
```http
GET /api/auth/me
Cookie: dynamic_authentication_token=<jwt_token>
```

**Response Format:**
```typescript
interface AuthResponse {
  isAuthenticated: boolean;
  user: {
    id: string;           // Unique user identifier
    email: string;        // User's email address  
    credits: number;      // User's current credit balance from your DB
    userId: string;       // Alias for id (for backward compatibility)
  } | null;
}
```

**Success Response (200):**
```json
{
  "isAuthenticated": true,
  "user": {
    "id": "user_123456",
    "email": "user@example.com", 
    "credits": 2195.9958,
    "userId": "user_123456"
  }
}
```

**Unauthenticated Response (200):**
```json
{
  "isAuthenticated": false,
  "user": null
}
```

**Error Response (500):**
```json
{
  "isAuthenticated": false,
  "user": null
}
```

## Implementation Requirements

### JWT Token Handling

The frontend expects JWT tokens to be stored in HTTP cookies with names starting with `dynamic_authentication_token`. The current implementation looks for:

- `dynamic_authentication_token` (primary)
- `dynamic_authentication_token0` 
- `dynamic_authentication_token1`
- `dynamic_authentication_token2`
- `dynamic_authentication_token3`
- `dynamic_authentication_token4'`

### Backend Integration Points

Your backend authentication service should provide:

1. **User Profile Endpoint** - Return user data including credits from your database
2. **JWT Validation** - Validate tokens using JWKS or your auth system
3. **Credits Data** - User credit balances should come from your DB, not Dynamic Labs

### Current Mock Implementation

The current mocked implementation in `/pages/api/auth/me.ts`:

```typescript
// MOCKED: For testing, always return logged-in state
return res.status(200).json({
  isAuthenticated: true,
  user: {
    id: 'user_123456',
    email: 'test@example.com',
    credits: 25.5, // This should come from your database
    userId: 'user_123456',
  }
});
```

### Integration Steps

1. **Replace Mock Implementation:** Update `/pages/api/auth/me.ts` to call your backend instead of returning mocked data

2. **Example Implementation:**
```typescript
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const token = req.cookies.dynamic_authentication_token;
    
    if (!token) {
      return res.status(200).json({
        isAuthenticated: false,
        user: null
      });
    }

    // Call your backend authentication service
    const response = await fetch(`${BACKEND_URL}/api/users/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      return res.status(200).json({
        isAuthenticated: false,
        user: null
      });
    }

    const userData = await response.json();
    
    return res.status(200).json({
      isAuthenticated: true,
      user: {
        id: userData.id,
        email: userData.email,
        credits: userData.credits, // From your database
        userId: userData.id
      }
    });

  } catch (error) {
    console.error('Auth API error:', error);
    return res.status(200).json({
      isAuthenticated: false,
      user: null
    });
  }
}
```

### Environment Variables Needed

```bash
# Backend API URL for authentication
BACKEND_URL=http://your-backend-api-url

# Any other auth-related config
AUTH_JWT_SECRET=your-jwt-secret
```

## Frontend Usage

The frontend uses this API through:

- **Hook:** `useAuth()` from `/hooks/useAuth.ts`
- **SWR Configuration:** 5-minute cache, revalidates on focus
- **Components:** Header, all authenticated pages

## Testing

Test the implementation by:

1. Visiting any page (should show login state)
2. Checking browser dev tools → Network tab for `/api/auth/me` calls
3. Verifying credits display correctly in header
4. Confirming auth state persists across page refreshes

## Notes

- Credits data MUST come from your database, not Dynamic Labs
- JWT validation should use your existing authentication system
- The `/api/auth/me` endpoint should never return sensitive data
- All responses use 200 status code with error details in JSON body
- Authentication failures are not treated as HTTP errors by the frontend