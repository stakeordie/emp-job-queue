# SERVICE_KEY Analysis - Complete Usage Map

## Current SERVICE_KEY Value
```
SERVICE_KEY=18445c8-2ds3-4xz0-adsc-f1d5763l3hj35
```

## Services That Use SERVICE_KEY

### 1. **emprops-open-api** (This API Service)
**Location:** `/Users/the_dusky/code/emprops/emprops-open-api`

#### Where it's defined:
- `.env.local.dev` - Contains the SERVICE_KEY environment variable
- `src/globals.d.ts:26` - TypeScript type definition

#### Where it's used for authentication:

##### **Credits System**
- `src/routes/credits/index.ts:9`
  - Allows service-to-service calls to manage credits
  - If no user_id header, checks SERVICE_KEY for authentication
  - Falls back to query param `user_id` if SERVICE_KEY is valid

- `src/routes/users/[id]/credits.ts:64`
  - Protects user credit operations
  - Allows SERVICE_KEY auth for internal services

- `src/routes/collections/[id]/credits.ts:22`
  - Collection credit management
  - Requires SERVICE_KEY for API access

##### **Rewards System**
- `src/routes/collection-rewards/[id]/claim.ts:19`
  - Claims rewards on behalf of users
  - SERVICE_KEY allows bypassing user auth

- `src/routes/collection-rewards/[id]/rewards.ts:10`
  - Lists rewards for collections
  - SERVICE_KEY enables service-level access

##### **Utility Functions**
- `src/utils/index.ts:90` - `isServiceKeyAuth()` function
  - Helper to check if request is using SERVICE_KEY auth
  - Used throughout the codebase for auth checks

##### **Setup Scripts**
- `scripts/setup.js:4`
  - Uses SERVICE_KEY for initial setup operations
  - Makes authenticated requests during system configuration

##### **Other Services**
- `src/clients/azure-upload-service-client.ts:12`
  - References `AZURE_UPLOAD_SERVICE_KEY` (different key)
  - This is for Azure upload service, not the main SERVICE_KEY

### 2. **emprops-open-interface** (UI Service)
**Location:** `/Users/the_dusky/code/emprops/core-services/emprops-open-interface`

Based on your file navigation, this service also has a `.env.local.dev` file that likely contains SERVICE_KEY for making authenticated API calls to emprops-open-api.

## Authentication Pattern

The SERVICE_KEY is used in the `Authorization` header as a Bearer token:

```javascript
// Standard pattern across all endpoints
const isAuthorized = req.headers.authorization?.split(" ")[1] === process.env.SERVICE_KEY;
```

## Services That SHOULD Have Matching SERVICE_KEY

1. **emprops-open-api** ✓ (Confirmed)
   - Has SERVICE_KEY in environment
   - Uses it to validate incoming requests

2. **emprops-open-interface** (UI) - Needs verification
   - Should have same SERVICE_KEY to make API calls
   - Located at: `core-services/emprops-open-interface/.env.local.dev`

3. **Any Background Services/Workers**
   - If you have job processors, they need SERVICE_KEY
   - Cron jobs or scheduled tasks need it

4. **Component Library** (if it makes API calls)
   - `ai_infra/emprops_component_library` 
   - May need SERVICE_KEY if it directly calls the API

## Purpose of SERVICE_KEY

SERVICE_KEY serves as **internal service authentication** for:

1. **Service-to-Service Communication**
   - UI → API calls
   - Background workers → API calls
   - Admin scripts → API calls

2. **Bypassing User Authentication**
   - Allows operations on behalf of users
   - Used when `user_id` is passed as query param instead of header

3. **Protected Operations**
   - Credit management
   - Reward claims
   - Collection operations

## Security Considerations

1. **Format**: The current SERVICE_KEY is NOT a valid UUID
   - Contains invalid characters: `d`, `s`, `x`, `z`, `l`
   - This is intentional - it's a custom key format

2. **Usage**: Never expose SERVICE_KEY to:
   - Client-side JavaScript
   - Public repositories
   - End users

3. **Rotation**: Should be rotated periodically
   - Update in all services simultaneously
   - Use environment variables, never hardcode

## Verification Checklist

To ensure all services are properly configured:

### Check these files have matching SERVICE_KEY:
- [ ] `/Users/the_dusky/code/emprops/emprops-open-api/.env.local.dev`
- [ ] `/Users/the_dusky/code/emprops/core-services/emprops-open-interface/.env.local.dev`
- [ ] Any worker/background service `.env` files
- [ ] Any admin tool configurations

### Test endpoints:
1. Test credit endpoint with SERVICE_KEY:
```bash
curl -H "Authorization: Bearer 18445c8-2ds3-4xz0-adsc-f1d5763l3hj35" \
     "http://localhost:8080/users/{userId}/credits?user_id={actualUserId}"
```

2. Test without SERVICE_KEY (should fail):
```bash
curl "http://localhost:8080/collections/{id}/credits"
# Should return 401 Unauthorized
```

## Summary

**SERVICE_KEY is used by:**
1. **emprops-open-api** - To validate incoming requests
2. **emprops-open-interface** (UI) - To make authenticated API calls
3. **Setup scripts** - For initial configuration
4. **Potentially other services** - Any that need to call the API

**Main purposes:**
- Internal service authentication
- Bypassing user auth for service operations
- Protecting sensitive endpoints (credits, rewards)

**Action items:**
1. Verify all services have the same SERVICE_KEY value
2. Check no service is mistakenly using SERVICE_KEY as data (like a workflow ID)
3. Consider rotating the key if it hasn't been changed recently