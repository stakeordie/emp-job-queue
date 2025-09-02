# Farcaster Collection API Build Plan

## Overview

This plan outlines the implementation of the Template-Based Collection Creation API with Farcaster user support. The API allows third parties to fork existing collections and customize them for Farcaster users without requiring those users to have full system accounts.

## Core Features

### 1. Collection Discovery (`GET /feed`)
- ✅ **Status**: Already implemented
- **Purpose**: Browse public, forkable collections that can serve as templates
- **Current Implementation**: `src/routes/feed/index.ts`

### 2. Collection Forking (`POST /collections/:collectionId/remix`) 
- ✅ **Status**: Already implemented (basic forking)
- 🔧 **Needs Enhancement**: Add farcaster_id support
- **Purpose**: Create editable copies of existing collections
- **Current Implementation**: `src/routes/remix/index.ts`

### 3. Collection Editing (`PUT /projects/:projectId/collections/:collectionId`)
- ✅ **Status**: Already implemented
- **Purpose**: Modify forked collections (prompts, settings, variables, etc.)
- **Current Implementation**: `src/lib/collections.ts` - `update()` method

### 4. Collection Generation (`POST /collections/:id/generations`)
- ✅ **Status**: Already implemented 
- **Purpose**: Execute customized collections with runtime variables
- **Current Implementation**: `src/routes/generator/v2.ts`

## Implementation Tasks

### Phase 1: Farcaster User Support (High Priority)

#### Task 1.1: Update Fork Endpoint
**File**: `src/routes/remix/index.ts`
**Changes Needed**:
```typescript
// Add to remixCreationSchema
const remixCreationSchema = z.object({
  project_id: z.string().optional(),
  farcaster_id: z.string().optional(),  // New field
});

// Update createFork function logic
if (body.farcaster_id) {
  // Find or create miniapp_user
  const farcasterUser = await findOrCreateFarcasterUser(body.farcaster_id, tx);
  // Create collection owned by farcaster user
  // Set farcaster_collection flag to true
}
```

#### Task 1.2: Farcaster User Management
**File**: `src/lib/farcaster-users.ts` (new file)
**Functions Needed**:
```typescript
export async function findOrCreateFarcasterUser(
  farcaster_id: string, 
  tx: PrismaTransactionClient
): Promise<miniapp_user> {
  // Check if miniapp_user exists with farcaster_id
  // If not, create new record
  // Return user record
}

export async function linkFarcasterToRealUser(
  farcaster_id: string,
  real_user_id: string,
  tx: PrismaTransactionClient
): Promise<void> {
  // Transfer collection ownership
  // Update user associations
  // Merge data as needed
}
```

#### Task 1.3: Database Schema Verification
**Status**: ✅ Already complete
- `miniapp_user` table exists with `farcaster_id`, `farcaster_username`, `farcaster_pfp`
- `collection` table has `farcaster_collection` boolean flag
- No additional migrations needed

#### Task 1.4: Collection Ownership Logic
**File**: `src/lib/collections.ts`
**Changes Needed**:
```typescript
// Update collection creation to handle farcaster users
// Ensure proper project association
// Set farcaster_collection flag when appropriate
```

### Phase 2: API Enhancements (Medium Priority)

#### Task 2.1: Enhanced Feed Response
**File**: `src/routes/feed/index.ts`
**Enhancements**:
- Include variable definitions in response
- Add sample images
- Better pagination support
- Filter by collection type/category

#### Task 2.2: Validation Improvements
**File**: `src/lib/collections.ts`
**Enhancements**:
- Better validation for workflow data
- Validate variable types and constraints
- Check model availability
- Validate image dimensions/settings

#### Task 2.3: Error Handling
**Files**: All route handlers
**Improvements**:
- Consistent error response format
- Better error messages for API consumers
- Proper HTTP status codes
- Detailed validation errors

### Phase 3: Security & Permissions (High Priority)

#### Task 3.1: Access Control
**File**: `src/middleware/farcaster-auth.ts` (new file)
**Purpose**: 
- Validate farcaster user ownership
- Prevent unauthorized collection edits
- Mini-app specific authentication logic

#### Task 3.2: Rate Limiting
**File**: `src/middleware/rate-limiting.ts` (new file)
**Limits**:
- Template browsing: 1000/hour per IP
- Forking: 100/hour per user
- Editing: 100/hour per user  
- Generation: 10/hour per user

#### Task 3.3: API Key Management
**Status**: ✅ Database schema exists
**File**: Extend existing API key system
**Purpose**: Allow third-party access with proper authentication

### Phase 4: Testing & Documentation (Medium Priority)

#### Task 4.1: Unit Tests
**Files**: `__tests__/routes/` (new files)
**Coverage**:
- Fork endpoint with farcaster_id
- Farcaster user creation
- Collection editing validation
- Error handling scenarios

#### Task 4.2: Integration Tests
**Files**: `__tests__/integration/` (new files)
**Scenarios**:
- Complete fork-edit-generate flow
- Farcaster user account linking
- Multi-user collection management

#### Task 4.3: API Documentation
**Status**: ✅ Already documented in job queue docs
**Location**: `/08-emprops-open-api/implementation-guides/collection-generation-api.md`

## Database Impact

### Existing Tables Used
- ✅ `miniapp_user` - Farcaster user records
- ✅ `collection` - Collection storage with farcaster flag
- ✅ `project` - Project organization
- ✅ `collection_remix` - Fork relationships
- ✅ `collection_preview` - Public collection metadata

### New Tables Needed
- ❌ None - existing schema is sufficient

## API Endpoints Summary

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|---------|
| `/feed` | GET | Browse forkable collections | ✅ Complete |
| `/collections/:id/remix` | POST | Fork collection (+ farcaster support) | 🔧 Needs farcaster_id |
| `/projects/:pid/collections/:id` | PUT | Edit forked collection | ✅ Complete |
| `/collections/:id/generations` | POST | Generate from collection | ✅ Complete |

## Deployment Plan

### Development Phase
1. **Local Testing**: Test farcaster user creation and collection forking
2. **Unit Tests**: Ensure all new functionality is tested
3. **Integration Tests**: Test complete workflows

### Staging Phase  
1. **Deploy Changes**: Deploy fork endpoint updates
2. **API Testing**: Test with real farcaster IDs
3. **Load Testing**: Verify rate limiting and performance

### Production Phase
1. **Feature Flag**: Deploy behind feature flag
2. **Gradual Rollout**: Enable for mini-app first
3. **Monitor**: Track usage, errors, and performance
4. **Full Release**: Enable for all API consumers

## Success Metrics

### Technical Metrics
- Fork endpoint response time < 500ms
- Farcaster user creation time < 200ms  
- Collection edit success rate > 99%
- API error rate < 1%

### Business Metrics
- Number of collections created for farcaster users
- Conversion rate from farcaster users to full users
- API usage growth over time
- Third-party integration adoption

## Risk Mitigation

### Data Consistency
- **Risk**: Farcaster user data conflicts during account linking
- **Mitigation**: Atomic transactions, proper error handling

### Performance
- **Risk**: High volume of farcaster user creation
- **Mitigation**: Database indexing, caching, rate limiting

### Security
- **Risk**: Unauthorized access to collections
- **Mitigation**: Proper authentication, ownership validation

## Timeline Estimate

### Phase 1 (Farcaster Support): 1-2 weeks
- Fork endpoint enhancement: 2-3 days
- Farcaster user management: 2-3 days  
- Testing and validation: 2-3 days

### Phase 2 (API Enhancements): 1 week
- Feed improvements: 2 days
- Validation enhancements: 2 days
- Error handling: 1 day

### Phase 3 (Security): 1 week
- Access control: 3 days
- Rate limiting: 2 days
- API key integration: 2 days

### Phase 4 (Testing): 1 week
- Unit tests: 3 days
- Integration tests: 2 days
- Documentation updates: 2 days

**Total Estimated Time: 4-5 weeks**

## Next Steps

1. **Immediate**: Start with Task 1.1 (Update Fork Endpoint)
2. **This Week**: Complete Phase 1 (Farcaster Support)  
3. **Next Week**: Begin Phase 3 (Security & Permissions)
4. **Following**: Phases 2 & 4 in parallel

## Questions & Decisions Needed

1. **Farcaster ID Format**: Use FID number or username? (Recommend FID for consistency)
2. **Project Assignment**: Default project per farcaster user or shared project?
3. **Account Linking**: Automatic or manual process when user signs up?
4. **Collection Limits**: Max collections per farcaster user?
5. **Public Display**: How to show farcaster user attribution in UI?