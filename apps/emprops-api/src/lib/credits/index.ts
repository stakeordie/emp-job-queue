import { PrismaClientType } from "@app/types/database";
import logger from "../../logger";
import { Prisma, PrismaClient } from '@emp/database';
import { CreditsCalculator } from "./calculator";

export type CreditType = "rental" | "permanent";

export {
  CreditCostV1 as CreditNodeCost,
  CreditsCalculator,
} from "./calculator";

type HasBalanceQueryResponse = {
  credit_type: CreditType;
  has_balance: boolean;
}[];

export class CreditsService {
  private creditsCalculator: CreditsCalculator;

  constructor(private prisma: PrismaClientType) {
    this.creditsCalculator = new CreditsCalculator(prisma);
  }

  async getTotalCredits(userIdOrCustomerId: string) {
    const customer = await this.getCustomer(userIdOrCustomerId);
    if (customer == null) {
      logger.warn(`Customer not found for user ${userIdOrCustomerId}`);
      return 0;
    }
    const result = await this.prisma.credits_balance.aggregate({
      _sum: {
        balance: true,
      },
      where: {
        user_id: customer.id,
      },
    });
    return result._sum.balance || 0;
  }

  async getBalances(userIdOrCustomerId: string) {
    const customer = await this.getCustomer(userIdOrCustomerId);
    if (customer == null) {
      logger.warn(`Customer not found for user ${userIdOrCustomerId}`);
      return [];
    }
    return await this.prisma.credits_balance.findMany({
      where: {
        user_id: customer.id,
      },
    });
  }

  async getCredits(userIdOrCustomerId: string, type?: CreditType) {
    const customer = await this.getCustomer(userIdOrCustomerId);
    if (customer == null) {
      logger.warn(`Customer not found for user ${userIdOrCustomerId}`);
      return 0;
    }
    const result = await this.prisma.credits_balance.aggregate({
      _sum: {
        balance: true,
      },
      where: {
        user_id: customer.id,
        credit_type: type,
      },
    });
    return result._sum.balance || 0;
  }

  async incrementCredits(
    userIdOrCustomerId: string,
    amount: number,
    type?: CreditType,
    comment?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const id = this.getCustomerIdQuery(userIdOrCustomerId);
      let customer = await tx.customer.findFirst({
        where: {
          ...id,
        },
      });
      if (customer == null) {
        logger.warn(`Customer not found for user ${userIdOrCustomerId}`);
        customer = await tx.customer.create({
          data: {
            id: userIdOrCustomerId,
          },
        });
        logger.debug(`Creating customer for user ${userIdOrCustomerId}`);
      }
      if (!type) {
        const balances =
          await tx.$queryRaw<HasBalanceQueryResponse>`select credit_type, balance > 0 as has_balance from credits_balance where user_id = ${customer.id}::uuid`;
        type = await this.getCreditTypeBalance(balances);
      }
      await tx.credits_history.create({
        data: {
          flow: "in",
          amount,
          credit_type: type,
          user_id: customer.id,
          comment,
        },
      });
      const result = await tx.credits_balance.findFirst({
        where: {
          user_id: customer.id,
          credit_type: type,
        },
      });
      const fixedAmount = amount.toFixed(4);
      logger.info(`Increasing ${fixedAmount} credits for user ${customer.id}`);
      if (result == null) {
        await tx.credits_balance.create({
          data: {
            user_id: customer.id,
            credit_type: type,
            balance: fixedAmount,
          },
        });
      } else {
        await tx.$executeRaw`update credits_balance set balance = balance + ${fixedAmount}::numeric, updated_at = now() where user_id = ${customer.id}::uuid and credit_type = ${type}`;
      }
    });
  }

  async decrementCredits(
    userIdOrCustomerId: string,
    amount: number,
    comment?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const creditsNeeded = new Prisma.Decimal(amount);
      const id = this.getCustomerIdQuery(userIdOrCustomerId);
      let customer = await tx.customer.findFirst({
        where: {
          ...id,
        },
      });
      if (customer == null) {
        logger.warn(`Customer not found for user ${userIdOrCustomerId}`);
        customer = await tx.customer.create({
          data: {
            id: userIdOrCustomerId,
          },
        });
        logger.debug(`Creating customer for user ${userIdOrCustomerId}`);
      }
      // Get rental balance.
      const rentalCreditsBalance = await tx.credits_balance.findFirst({
        where: {
          user_id: customer.id,
          credit_type: "rental",
        },
      });
      // Get Permanent balance.
      const permanentCreditsBalance = await tx.credits_balance.findFirst({
        where: {
          user_id: customer.id,
          credit_type: "permanent",
        },
      });
      const rentalBalance =
        rentalCreditsBalance == null
          ? new Prisma.Decimal(0)
          : rentalCreditsBalance.balance;
      const permanentBalance =
        permanentCreditsBalance == null
          ? new Prisma.Decimal(0)
          : permanentCreditsBalance.balance;
      if (creditsNeeded.gt(rentalBalance.add(permanentBalance)))
        throw new Error("Insufficient credits");
      if (creditsNeeded.lte(rentalBalance)) {
        logger.info(
          `Decreasing ${creditsNeeded} rental credits for user ${customer.id}`,
        );
        await tx.credits_history.create({
          data: {
            flow: "out",
            amount: creditsNeeded,
            credit_type: "rental",
            user_id: customer.id,
            comment,
          },
        });
        await tx.$executeRaw`update credits_balance set balance = balance - ${creditsNeeded}::numeric, updated_at = now() where user_id = ${customer.id}::uuid and credit_type = 'rental'`;
      } else {
        if (rentalBalance.gt(0)) {
          logger.info(
            `Decreasing ${rentalBalance} rental credits for user ${customer.id}`,
          );
          await tx.credits_history.create({
            data: {
              flow: "out",
              amount: rentalBalance,
              credit_type: "rental",
              user_id: customer.id,
              comment,
            },
          });
          await tx.$executeRaw`update credits_balance set balance = 0, updated_at = now() where user_id = ${customer.id}::uuid and credit_type = 'rental'`;
        }

        const remaining = creditsNeeded.sub(rentalBalance);
        logger.info(
          `Decreasing ${remaining} permanent credits for user ${customer.id}`,
        );
        await tx.credits_history.create({
          data: {
            flow: "out",
            amount: remaining,
            credit_type: "permanent",
            user_id: customer.id,
            comment,
          },
        });
        await tx.$executeRaw`update credits_balance set balance = balance - ${remaining}::numeric, updated_at = now() where user_id = ${customer.id}::uuid and credit_type = 'permanent'`;
      }
    });
  }

  async renewCredits(
    userIdOrCustomerId: string,
    amount: number,
    type: CreditType,
    comment?: string | null,
  ) {
    this.prisma.$transaction(async (tx) => {
      const id = this.getCustomerIdQuery(userIdOrCustomerId);
      const customer = await tx.customer.findFirst({
        where: {
          ...id,
        },
      });
      if (customer == null) {
        logger.warn(`Customer not found for user ${userIdOrCustomerId}`);
        return;
      }
      const currentCredits = await tx.credits_balance.aggregate({
        _sum: {
          balance: true,
        },
        where: {
          user_id: customer.id,
          credit_type: type,
        },
      });
      if (currentCredits._sum.balance == null) return;
      await tx.credits_history.create({
        data: {
          flow: "out",
          amount: currentCredits._sum.balance,
          credit_type: type,
          user_id: customer.id,
          comment,
        },
      });
      const result = await tx.credits_balance.findFirst({
        where: {
          user_id: customer.id,
          credit_type: type,
        },
      });
      const fixedAmount = amount.toFixed(4);
      logger.debug(`Renewing ${fixedAmount} credits for user ${customer.id}`);
      if (result == null) {
        await tx.credits_balance.create({
          data: {
            user_id: customer.id,
            credit_type: type,
            balance: fixedAmount,
          },
        });
      } else {
        await tx.$executeRaw`update credits_balance set balance = ${fixedAmount}::numeric, updated_at = now() where user_id = ${customer.id}::uuid and credit_type = ${type}`;
      }
    });
  }

  async computeCredits<T>(instructionSet: any, metadata?: any): Promise<T> {
    return this.creditsCalculator.calculateCost(instructionSet, metadata) as T;
  }

  async hasEnoughCredits(
    userId: string,
    instructionSet: any,
    numberOfGenerations: number,
  ) {
    const creditsPerGeneration =
      await this.creditsCalculator.calculateCost(instructionSet);
    const currentCredits = await this.getTotalCredits(userId);
    const creditsNeeded = creditsPerGeneration.total_cost * numberOfGenerations;
    return new Prisma.Decimal(currentCredits).gte(creditsNeeded);
  }

  private getCustomerIdQuery(userIdOrCustomerId: string) {
    return userIdOrCustomerId.startsWith("cus_")
      ? { stripe_customer_id: userIdOrCustomerId }
      : { id: userIdOrCustomerId };
  }

  private async getCustomer(userIdOrCustomerId: string) {
    const id = this.getCustomerIdQuery(userIdOrCustomerId);
    return await this.prisma.customer.findFirst({
      where: {
        ...id,
      },
    });
  }

  private async getCreditTypeBalance(res: HasBalanceQueryResponse) {
    const hasRental = res.find((r) => r.credit_type === "rental")?.has_balance;
    return hasRental ? "rental" : "permanent";
  }
}
