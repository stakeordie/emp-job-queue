import { PrismaClientType } from "@app/types/database";

import { WalletLinkedBody } from "./types";

export async function onWalletLinked(
  prisma: PrismaClientType,
  body: WalletLinkedBody,
) {
  const address = body.data.publicKey;
  const userId = body.data.userId;

  // STEP 1: Verify the wallet link does not exist in DB
  const walletExist = await prisma.wallet.findFirst({
    where: {
      address: {
        equals: address,
        mode: "insensitive",
      },
    },
  });
  // STEP 2: If does not exist then creates it
  if (!walletExist) {
    await prisma.wallet.create({
      data: {
        address,
        user_id: userId,
      },
    });
  } else {
    // STEP 3: If it exists then updates it
    await prisma.wallet.update({
      data: {
        user_id: userId,
        created_at: body.data.createdAt,
      },
      where: {
        id: walletExist.id,
      },
    });
  }
}
