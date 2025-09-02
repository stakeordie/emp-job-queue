import { social_org_enum, PrismaClient } from '@emp/database';

/**
 * Social Link Management Utilities
 *
 * Manages social_link records for the custodial collection model.
 * Social links represent users from various platforms (Farcaster, Twitter, etc.)
 * who have collections held in custody by API entities.
 */

export type PrismaTransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Find an existing social link or create a new one
 * @param socialOrg - The social platform (farcaster, twitter, etc.)
 * @param identifier - Platform-specific identifier (FID, Twitter ID, etc.)
 * @param tx - Prisma transaction client
 * @returns The social_link record
 */
export async function findOrCreateSocialLink(
  socialOrg: social_org_enum,
  identifier: string,
  tx: PrismaTransactionClient,
): Promise<any> {
  // Try to find existing social link
  let socialLink = await tx.social_link.findUnique({
    where: {
      social_org_identifier: {
        social_org: socialOrg,
        identifier: identifier,
      },
    },
  });

  // Create new social link if not found
  if (!socialLink) {
    socialLink = await tx.social_link.create({
      data: {
        social_org: socialOrg,
        identifier: identifier,
      },
    });
  }

  return socialLink;
}

/**
 * Find all collections held in custody for a social user
 * @param socialOrg - The social platform
 * @param identifier - Platform-specific identifier
 * @param tx - Prisma transaction client
 * @returns Array of custodial collections
 */
export async function findCustodialCollections(
  socialOrg: social_org_enum,
  identifier: string,
  tx: PrismaTransactionClient,
): Promise<any> {
  const socialLink = await tx.social_link.findUnique({
    where: {
      social_org_identifier: {
        social_org: socialOrg,
        identifier: identifier,
      },
    },
    include: {
      custodial_collections: {
        include: {
          project: true,
          collection_preview: true,
        },
      },
    },
  });

  return socialLink?.custodial_collections || [];
}

/**
 * Transfer custody of collections from social user to a real user account
 * This function is used when a social user creates a full account and proves ownership
 * @param socialOrg - The social platform
 * @param identifier - Platform-specific identifier
 * @param newUserId - The new real user's ID
 * @param newProjectId - The target project ID
 * @param tx - Prisma transaction client
 */
export async function transferCustody(
  socialOrg: social_org_enum,
  identifier: string,
  newUserId: string,
  newProjectId: string,
  tx: PrismaTransactionClient,
): Promise<void> {
  // Find the social link
  const socialLink = await tx.social_link.findUnique({
    where: {
      social_org_identifier: {
        social_org: socialOrg,
        identifier: identifier,
      },
    },
  });

  if (!socialLink) {
    throw new Error(`Social link not found for ${socialOrg}:${identifier}`);
  }

  // Transfer all custodial collections
  await tx.collection.updateMany({
    where: {
      custodied_for: socialLink.id,
      is_custodial: true,
    },
    data: {
      project_id: newProjectId,
      is_custodial: false,
      custodied_for: null,
    },
  });

  // Note: We keep the social_link record for audit trail purposes
  // It can be referenced for historical tracking even after transfer
}

/**
 * Get social link statistics
 * @param tx - Prisma transaction client
 * @returns Statistics about social links and custodial collections
 */
export async function getSocialLinkStats(tx: PrismaTransactionClient) {
  const stats = await tx.social_link.groupBy({
    by: ["social_org"],
    _count: {
      id: true,
    },
  });

  const custodialCollectionCount = await tx.collection.count({
    where: {
      is_custodial: true,
    },
  });

  return {
    platformStats: stats,
    totalCustodialCollections: custodialCollectionCount,
  };
}

/**
 * Validate social organization enum value
 * @param socialOrg - The social platform string to validate
 * @returns True if valid social_org_enum value
 */
export function isValidSocialOrg(
  socialOrg: string,
): socialOrg is social_org_enum {
  return Object.values(social_org_enum).includes(socialOrg as social_org_enum);
}
