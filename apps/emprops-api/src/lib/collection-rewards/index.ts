import { PrismaClientType } from "@app/types/database";
import DynamicClient from "../../clients/dynamic-client";
import { PlatformApiClient, Project, Token } from "../../clients/platform-client";

import { TezosToolkit } from "@taquito/taquito";

export class CollectionRewardService {
  private prisma;
  private platformClient;
  private rpcRegistry: Record<string, string> = {};
  constructor(
    prisma: PrismaClientType,
    private dynamicClient: DynamicClient,
    platformClient: PlatformApiClient,
    rpcRegistry: Record<string, string>,
  ) {
    this.prisma = prisma;
    this.platformClient = platformClient;
    this.rpcRegistry = rpcRegistry;
  }

  async getCollectionRewards(chainId?: string) {
    // Get collection_reward enabled
    const collectionsEnabled = await this.prisma.collection_reward.findMany({
      where: {
        enabled: true,
      },
    });
    const collectionIds = collectionsEnabled.map((c) => c.collection_id);

    if (!chainId) return collectionsEnabled;

    // Query projects in Platform
    const projects = await this.platformClient.getProjects({
      universalId: collectionIds.toString(),
    });
    // Filter projects for chainId
    const activeProjects =
      projects?._embedded?.projectModelList
        ?.filter((p: Project) => p.chainId == chainId)
        .map((p: Project) => p.id) || [];

    return collectionsEnabled.filter((c) =>
      activeProjects.includes(c.collection_id),
    );
  }

  async getCollectionReward(rewardId: number) {
    return this.prisma.collection_reward.findUnique({
      where: {
        id: rewardId,
      },
    });
  }
  async getRedemptions(rewardId: number, walletAddress?: string) {
    const redemptions = await this.prisma.collection_reward_redemption.findMany(
      {
        where: {
          collection_reward_id: rewardId,
          wallet_address: walletAddress,
        },
      },
    );

    return redemptions;
  }

  async getWalletRewardsInfo(
    userId: string,
    rewardId: number,
    walletAddress: string,
  ): Promise<{
    reward: Reward;
    pending_rewards: PendingReward[];
    redemptions: any[];
  }> {
    if (walletAddress.startsWith("0x")) {
      const response = await this.dynamicClient.getAllUsersForEnvironment({
        filterColumn: "walletPublicKey",
        filterValue: walletAddress,
      });
      if (response.users.length === 0) {
        throw Error("Invalid wallet");
      }
    } else {
      const wallet = this.prisma.wallet.findFirst({
        where: {
          user_id: userId,
          address: walletAddress,
        },
      });

      if (!wallet) throw Error("Invalid wallet");
    }
    const reward = await this.getCollectionReward(rewardId);
    if (!reward) throw Error("Reward does not exits");

    const collection = await this.platformClient.getProject(
      reward.collection_id,
    );

    if (!collection) throw Error("Collection does not exist");
    const redemptions = await this.getRedemptions(rewardId, walletAddress);
    const tokensResponse = await this.platformClient.getTokens({
      owner: walletAddress,
      "project-id": reward.collection_id,
      size: 100,
    });
    const tokens = tokensResponse?._embedded?.tokenModelList || [];
    const tokensUsed = redemptions.map((r) => r.token_id);
    const tokensOwned = await this.verifyTokenOwnership(
      collection.chainId,
      collection.tokenContractAddress,
      walletAddress,
      tokens,
    );
    const pending_rewards = tokensOwned
      .filter((t) => !tokensUsed.includes(t.id))
      .map((t) => ({ token_id: t.tokenId, universal_id: t.id }));

    return {
      reward,
      pending_rewards,
      redemptions,
    };
  }

  async redeemRewards(userId: string, rewardId: number, walletAddress: string) {
    if (!userId) throw Error("Invalid user id");
    const info = await this.getWalletRewardsInfo(
      userId,
      rewardId,
      walletAddress,
    );

    const { pending_rewards, reward } = info;

    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < pending_rewards.length; i++) {
        const r = pending_rewards[i];
        await tx.collection_reward_redemption.create({
          data: {
            user_id: userId,
            wallet_address: walletAddress,
            token_id: r.universal_id,
            collection_reward_id: reward.id,
          },
        });
      }
    });

    return info;
  }

  async verifyTokenOwnership(
    chainId: string,
    tokenContractAddress: string,
    ownerAddress: string,
    tokens: Token[],
  ): Promise<Token[]> {
    const availableChainIds: string[] = Object.keys(this.rpcRegistry);
    if (!availableChainIds.includes(chainId))
      throw Error("chain id not support");

    if (!this.rpcRegistry[chainId]) throw Error(`RPC not found for ${chainId}`);
    const rpc = this.rpcRegistry[chainId];

    const tezos = new TezosToolkit(rpc);
    const contract = await tezos.contract.at(tokenContractAddress);
    const list = tokens.map((t) => ({
      token_id: t.tokenId,
      owner: ownerAddress,
    }));

    const balance: Balance[] = await contract.contractViews
      .get_balance_of(list)
      .executeView({ viewCaller: tokenContractAddress });
    const ownedTokens = balance
      .filter((e) => Number(e.balance) > 0)
      .map((e) => Number(e.request.token_id));

    return tokens.filter((t) => ownedTokens.includes(Number(t.tokenId)));
  }
}

interface PendingReward {
  token_id: string;
  universal_id: string;
}

export interface Reward {
  id: number;
  collection_id: string;
  tag: string;
  credits: number;
  enabled: boolean | null;
  created_at: Date;
  updated_at: Date | null;
}

export interface Balance {
  request: {
    owner: string;
    token_id: string;
  };
  balance: string;
}
