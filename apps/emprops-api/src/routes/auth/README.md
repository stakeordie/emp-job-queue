# Authentication Routes

## `/api/auth/me` - Server-Side Auth Endpoint

This endpoint supports the refactored Studio v2 frontend that uses server-side authentication instead of client-side Dynamic Labs authentication.

### Usage

The frontend expects JWT tokens in HTTP cookies and calls this endpoint to get user profile data including credits from our database.

### Request Format

```http
GET /api/auth/me
Authorization: Bearer <jwt_token>
```

### Response Format

**Authenticated User:**
```json
{
  "isAuthenticated": true,
  "user": {
    "id": "user_123456",
    "email": "user@example.com",
    "credits": 2195.9958,
    "userId": "user_123456",
    "scope": "user"
  }
}
```

**Unauthenticated:**
```json
{
  "isAuthenticated": false,
  "user": null
}
```

### Implementation Notes

- Uses existing JWT middleware for token validation
- Fetches credits from database via `CreditsService`
- Always returns 200 status code (frontend expects this)
- Handles Decimal to number conversion for credits
- Graceful error handling - continues with credits=0 if credits fetch fails

### Frontend Integration

The frontend (Studio v2) uses this endpoint through:
- Next.js API route at `/pages/api/auth/me.ts` 
- SWR hook with 5-minute cache
- Automatic revalidation on focus

### Testing

Test the endpoint by making a request with a valid JWT token:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     http://localhost:3000/api/auth/me
```