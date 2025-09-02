import { PrismaClientType } from "@app/types/database";

import { UserUpdatedBody, VerifiedCredential } from "./types";

export async function onUserUpdated(
  prisma: PrismaClientType,
  body: UserUpdatedBody,
) {
  const userId = body.data?.id;
  const username = body.data?.username;
  const profileExist = await prisma.profile.findUnique({
    where: {
      id: userId,
    },
  });

  // STEP 1: Update dynamic username in DB
  // Create a profile in case it does not exist
  // Update profile user name with dynamic
  if (!profileExist) {
    await prisma.profile.create({
      data: {
        id: userId,
        profile_username: username,
        profile_image: "",
        profile_preference: "COLLECTOR",
      },
    });
  } else {
    await prisma.profile.update({
      data: {
        profile_username: username,
      },
      where: {
        id: userId,
      },
    });
  }

  //STEP 2: Update wallets linked with DB
  // Make sure all verified wallets exist in `wallet` table
  // Save any verified wallet missing in wallet table
  const userWallets = await prisma.wallet.findMany({
    where: {
      user_id: userId,
    },
  });
  const userWalletsFlat = userWallets.map((w) => w.address);

  const dynamicWallets = body.data.verifiedCredentials?.filter(
    (c: VerifiedCredential) => c.format === "blockchain",
  );
  // Filter dynamic wallets to get the missing to save in DB
  const missingWallets = dynamicWallets.filter(
    (w: VerifiedCredential) =>
      w?.address && !userWalletsFlat.includes(w.address),
  );
  if (missingWallets.length > 0) {
    // Build query to batch insert missing wallets
    const createMissingWalletsQuery = missingWallets.map((w) => {
      return {
        address: w.address as string,
        user_id: userId,
      };
    });
    await prisma.wallet.createMany({
      data: createMissingWalletsQuery,
    });
  }
}
