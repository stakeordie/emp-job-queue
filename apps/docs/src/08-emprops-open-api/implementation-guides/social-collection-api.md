# Social Collection API

## Overview

The Social Collection API allows third-party applications to fork and manage collections on behalf of social platform users (Farcaster, Twitter, Discord, etc.) without requiring those users to create full system accounts. Collections are held in custody by the API entity on behalf of the social users.

## Key Features

- **Multi-Platform Support**: Works with any social platform (Farcaster, Twitter, Discord, etc.)
- **Custodial Model**: API entity owns collections on behalf of social users
- **Platform-Agnostic**: Single API for all social integrations
- **Future Transfer Ready**: Built-in support for transferring custody to full accounts
- **Access Control**: Custodial collections can only be modified via API, not UI

## API Endpoints

### Fork Collection

**Endpoint**: `POST /collections/:collectionId/remix`

This endpoint supports two modes of operation:

#### Regular User Fork (Existing Behavior)
```http
POST /collections/abc123/remix
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "project_id": "optional-project-id"
}
```

#### Social User Fork (New Feature)
```http
POST /collections/abc123/remix
Content-Type: application/json

{
  "is_custodial": true,
  "social_org": "farcaster",
  "social_identifier": "12345",
  "project_id": "optional-project-id"
}
```

## Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `is_custodial` | boolean | No* | Must be `true` for custodial collections |
| `social_org` | string | No* | Social platform: `farcaster`, `twitter`, `discord`, `lens`, etc. |
| `social_identifier` | string | No* | Platform-specific identifier (FID, Twitter ID, Discord ID, etc.) |
| `project_id` | string | No | Specific project ID to fork into (optional) |

*Either social parameters OR user authentication is required

## How It Works

### 1. Request Processing

When a fork request is made with social parameters:

1. **Validation**: System validates that either social parameters or user authentication is provided
2. **Social Link**: Finds or creates a `social_link` record for the social user
3. **Collection Lookup**: Finds the source collection to be forked
4. **Permission Check**: Verifies the collection is forkable (remixable or already forked)

### 2. Custodial Assignment

**For Social Users:**
- Collections are always owned by the API key holder
- `is_custodial` flag is set to `true`
- `custodied_for` links to the social user's `social_link` record
- Collections remain under API entity custody until transferred

**For Regular Users:**
- Collections are owned directly by the authenticated user
- `is_custodial` is `false`
- No custodial relationship exists

### 3. Collection Creation

The system creates a new collection with:

```javascript
{
  title: "Fork of [Original Collection Name]",
  project_id: "[API Key Holder's Project ID]",
  is_custodial: true,                    // For social users
  custodied_for: "[social_link.id]",     // Reference to social user
  // ... other collection data copied from source
}
```

### 4. Collection Preview Setup

Creates a collection preview with:

```javascript
{
  enabled: false,                    // Disabled by default
  max_generations: 0,               // No generation limit initially
  collection_id: "[New Collection ID]",
  is_remixable: true,              // Allow further forking
  farcaster_collection: true       // Flag when created via Farcaster API
}
```

### 5. Data Processing

- **Component Generation**: Creates new UUIDs for all components
- **Reference Updates**: Updates all internal references to use new IDs
- **Data Copy**: Copies complete workflow data from source collection

## Response Format

### Success Response (200)

```json
{
  "data": {
    "id": "new-collection-uuid",
    "title": "Fork of Original Collection",
    "project_id": "api-key-holder-project-id",
    "is_custodial": true,
    "custodied_for": "social-link-uuid",
    "status": "draft",
    "created_at": "2025-01-01T12:00:00Z",
    "updated_at": "2025-01-01T12:00:00Z"
  },
  "error": null
}
```

### Error Responses

#### 400 - Missing Authentication
```json
{
  "data": null,
  "error": "Either user authentication or farcaster_id is required"
}
```

#### 404 - Collection Not Found
```json
{
  "data": null,
  "error": "Collection not found"
}
```

#### 400 - Collection Not Forkable
```json
{
  "data": null,
  "error": "Collection is not remixable"
}
```

## Database Schema

### Social Link Table

A new table to track social platform users:

```sql
CREATE TABLE social_link (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  social_org social_org_enum NOT NULL,
  identifier VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(social_org, identifier)
);

CREATE TYPE social_org_enum AS ENUM ('farcaster', 'twitter', 'discord', 'lens', 'github');
```

### Collection Table Changes

The `collection` table includes custodial fields:

```sql
ALTER TABLE collection ADD COLUMN is_custodial BOOLEAN DEFAULT FALSE;
ALTER TABLE collection ADD COLUMN custodied_for UUID REFERENCES social_link(id);
```

| Column | Type | Description |
|--------|------|-------------|
| `is_custodial` | BOOLEAN | Flag indicating collection is held in custody |
| `custodied_for` | UUID | Reference to social_link record for beneficiary |

### Access Control

Custodial collections have special access rules:
- **UI Access**: Blocked when `is_custodial = true`
- **API Access**: Allowed for API key holder only
- **Transfer**: Future capability to transfer custody to full account

## Usage Examples

### Farcaster Mini-App Integration

```javascript
// Fork a collection for a Farcaster user
const response = await fetch('/collections/abc123/remix', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer <api_key>'  // API key required
  },
  body: JSON.stringify({
    social_org: 'farcaster',
    social_identifier: userFid.toString()
  })
});

const { data: collection } = await response.json();
console.log('Custodial collection created:', collection.id);
```

### Twitter Integration Example

```javascript
// Fork for a Twitter user
const response = await fetch('/collections/abc123/remix', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer <api_key>'
  },
  body: JSON.stringify({
    social_org: 'twitter',
    social_identifier: twitterUserId
  })
});
```

### Discord Bot Integration

```javascript
// Fork for a Discord user
const response = await fetch('/collections/abc123/remix', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer <api_key>'
  },
  body: JSON.stringify({
    social_org: 'discord',
    social_identifier: discordUserId
  })
});
```

## Custody Transfer

When a social user creates a full account and proves ownership, custody can be transferred:

### Transfer Process

1. **Verify Social Account**: User proves ownership of social account
2. **Find Custodial Collections**: Query collections held in custody
3. **Transfer Ownership**: Update collection ownership and remove custodial flag
4. **Maintain Audit Trail**: Keep social_link for historical reference

```typescript
async function transferCustody(
  socialOrg: string, 
  socialIdentifier: string, 
  newUserId: string
) {
  // 1. Find social link
  const socialLink = await findSocialLink(socialOrg, socialIdentifier);
  
  // 2. Find custodial collections
  const collections = await findCustodialCollections(socialLink.id);
  
  // 3. Transfer ownership
  await db.collection.updateMany({
    where: { custodied_for: socialLink.id },
    data: {
      project_id: userProjectId,
      is_custodial: false,
      custodied_for: null
    }
  });
}
```

## Implementation Notes

### Custodial Model

- **Ownership**: API key holder owns all custodial collections
- **Beneficiary**: Social users are beneficiaries via `social_link`
- **Access**: Only API can modify custodial collections, UI access blocked
- **Transfer**: Built-in support for future custody transfer

### Collection Identification

Custodial collections can be identified by:
- `is_custodial: true` on collection table
- Non-null `custodied_for` linking to social_link
- Owned by API key holder's project

### Error Handling

The API maintains existing error handling patterns:
- Always returns HTTP 200 for successful operations
- Returns structured error responses for failures
- Maintains transaction integrity for all database operations

## Security Considerations

### Authentication

- **Regular Users**: Require JWT token authentication
- **Farcaster Users**: No authentication required (anonymous forking)
- **Validation**: System validates Farcaster ID format and collection permissions

### Rate Limiting

Consider implementing rate limiting for anonymous Farcaster API calls:
- Per IP limits for anonymous requests
- Per Farcaster ID limits to prevent abuse

### Data Privacy

- Farcaster IDs are stored as plain text for future linking
- No personal information beyond Farcaster ID is collected
- Collections remain private until explicitly published

## Testing

### Manual Testing

```bash
# Test Farcaster fork (custodial)
curl -X POST http://localhost:8080/collections/[collection-id]/remix \
  -H "Authorization: Bearer [api-key]" \
  -H "Content-Type: application/json" \
  -d '{"social_org": "farcaster", "social_identifier": "12345"}'

# Test Twitter fork (custodial)  
curl -X POST http://localhost:8080/collections/[collection-id]/remix \
  -H "Authorization: Bearer [api-key]" \
  -H "Content-Type: application/json" \
  -d '{"social_org": "twitter", "social_identifier": "user123"}'

# Test regular fork (existing behavior)
curl -X POST http://localhost:8080/collections/[collection-id]/remix \
  -H "Authorization: Bearer [jwt-token]" \
  -H "Content-Type: application/json" \
  -d '{"project_id": "[project-id]"}'
```

### Database Verification

```sql
-- Check custodial collections
SELECT c.id, c.title, c.is_custodial, c.custodied_for, 
       sl.social_org, sl.identifier, c.created_at 
FROM collection c
JOIN social_link sl ON c.custodied_for = sl.id
WHERE c.is_custodial = true;

-- Check social links
SELECT social_org, identifier, COUNT(*) as collection_count
FROM social_link sl
JOIN collection c ON c.custodied_for = sl.id
GROUP BY social_org, identifier;

-- Find all collections for a specific social user
SELECT c.* FROM collection c
JOIN social_link sl ON c.custodied_for = sl.id
WHERE sl.social_org = 'farcaster' 
  AND sl.identifier = '12345';
```

## Limitations

1. **API Required**: All custodial collections require API key authentication
2. **UI Restrictions**: Custodial collections cannot be edited through the UI
3. **Manual Transfer**: Custody transfer requires manual verification
4. **Single Beneficiary**: Each collection can only have one social link beneficiary

## Edit Custodial Collections

**Endpoint**: `PUT /collections/:id/edit`

This endpoint allows updating custodial collections with component form values, variable values, settings, and publish/hide functionality.

### Basic Edit Request
```http
PUT /collections/abc123/edit
Content-Type: application/json
Authorization: Bearer <api_key>

{
  "social_org": "farcaster",
  "social_identifier": "12345",
  "title": "Updated Collection Title",
  "description": "New description",
  "status": "published"
}
```

### Edit Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `social_org` | string | Yes* | Social platform for custodial collections |
| `social_identifier` | string | Yes* | Platform-specific identifier |
| `title` | string | No | Collection title |
| `description` | string | No | Collection description |
| `blockchain` | string | No | Target blockchain |
| `cover_image_url` | string | No | Cover image URL |
| `editions` | number | No | Number of editions |
| `price` | number | No | Price per edition |
| `data` | object | No | Workflow data containing components and variables |
| `status` | string | No | "draft" or "published" |
| `collection_preview` | object | No | Preview settings |

*Required for custodial collections, standard collections use user authentication

### Updating Component Form Values

Components are stored in the `data.steps` array. Each component has `nodePayload` containing form values:

```json
{
  "data": {
    "steps": [
      {
        "id": 123,
        "nodePayload": {
          "prompt": "A beautiful sunset over mountains",
          "width": 1024,
          "height": 1024,
          "num_inference_steps": 50,
          "guidance_scale": 7.5,
          "seed": 42
        }
      }
    ]
  }
}
```

**Example**: Update an image generation component's prompt and settings:
```http
PUT /collections/abc123/edit
Content-Type: application/json
Authorization: Bearer <api_key>

{
  "social_org": "farcaster",
  "social_identifier": "12345",
  "data": {
    "steps": [
      {
        "id": 123,
        "nodePayload": {
          "prompt": "A serene lake at dawn with mist",
          "width": 1536,
          "height": 1024,
          "num_inference_steps": 75,
          "guidance_scale": 8.0
        }
      }
    ]
  }
}
```

### Updating Variable Values

Variables are stored in the `data.variables` object:

```json
{
  "data": {
    "variables": {
      "theme": "nature",
      "style": "photorealistic",
      "color_palette": ["green", "blue", "brown"],
      "intensity": 0.8
    }
  }
}
```

**Example**: Update theme and style variables:
```http
PUT /collections/abc123/edit
Content-Type: application/json

{
  "social_org": "farcaster", 
  "social_identifier": "12345",
  "data": {
    "variables": {
      "theme": "urban",
      "style": "cyberpunk",
      "color_palette": ["neon", "purple", "blue"],
      "intensity": 0.95
    }
  }
}
```

### Publishing and Visibility Settings

Control collection visibility and generation settings:

```http
PUT /collections/abc123/edit
Content-Type: application/json

{
  "social_org": "farcaster",
  "social_identifier": "12345",
  "status": "published",
  "collection_preview": {
    "enabled": true,
    "max_generations": 100,
    "access_level": "PUBLIC",
    "is_remixable": true,
    "farcaster_collection": true
  }
}
```

### Complex Update Example

Update multiple aspects of a collection simultaneously:

```http
PUT /collections/abc123/edit
Content-Type: application/json

{
  "social_org": "farcaster",
  "social_identifier": "12345",
  "title": "My Custom Art Collection",
  "description": "AI-generated art with custom parameters",
  "status": "published",
  "data": {
    "variables": {
      "artist_style": "van_gogh",
      "mood": "melancholic",
      "time_period": "evening"
    },
    "steps": [
      {
        "id": 123,
        "nodePayload": {
          "prompt": "A {mood} landscape in the style of {artist_style} during {time_period}",
          "width": 1024,
          "height": 1024,
          "guidance_scale": 8.5,
          "num_inference_steps": 50
        }
      },
      {
        "id": 124,
        "nodePayload": {
          "strength": 0.7,
          "denoise": 0.8
        }
      }
    ]
  },
  "collection_preview": {
    "enabled": true,
    "max_generations": 50,
    "access_level": "PUBLIC"
  }
}
```

### Edit Response Format

**Success Response (200)**:
```json
{
  "data": {
    "id": "abc123",
    "title": "My Custom Art Collection",
    "description": "AI-generated art with custom parameters", 
    "status": "published",
    "is_custodial": true,
    "custodied_for": "social-link-uuid",
    "data": {
      "variables": { /* updated variables */ },
      "steps": [ /* updated components */ ]
    },
    "collection_preview": {
      "enabled": true,
      "max_generations": 50,
      "access_level": "PUBLIC"
    },
    "updated_at": "2025-01-01T12:30:00Z"
  },
  "error": null
}
```

**Error Responses**:

**403 - Invalid Social Credentials**:
```json
{
  "data": null,
  "error": "Social credentials do not match this custodial collection"
}
```

**400 - Missing Social Parameters**:
```json
{
  "data": null,
  "error": "Custodial collections require social_org and social_identifier for editing"
}
```

### Edit Constraints

- **No Component Addition/Removal**: Cannot add new components or delete existing ones
- **No Variable Addition/Removal**: Cannot create new variables or remove existing ones
- **Update Only**: Can only modify values of existing components and variables
- **Selective Updates**: Only explicitly provided fields are changed
- **Custodial Authentication**: Must provide matching social credentials for custodial collections

## Next Steps

For full Farcaster integration, consider implementing:

1. **User Management**: Create `miniapp_user` records for Farcaster users
2. **Automatic Linking**: Link collections when users create accounts
3. **Enhanced Metadata**: Store Farcaster usernames and profile pictures
4. **Access Control**: Implement Farcaster-specific authentication middleware
5. **Rate Limiting**: Add protection against API abuse

---

**Last Updated**: January 2025  
**Version**: 1.0  
**Status**: Implemented