import { PrismaClientType } from "@app/types/database";

import moment from "moment";
import Stripe from "stripe";
import logger from "./../logger";
import { CreditsService } from "./credits";

export class OneTimePaymentWebhookHandler {
  constructor(
    private stripe: Stripe,
    private creditsService: CreditsService,
  ) {}

  async onCheckoutSessionCompleted(data: any) {
    const userId = data.object.client_reference_id;
    const id = data.object.id;
    if (id == null || userId == null) {
      throw new Error(
        "Missing userId, stripeCustomerId, or subscriptionId in checkout.session.completed event",
      );
    }
    logger.info(
      `Received checkout.session.completed event with id ${id} and for user ${userId}`,
    );
    // Retrieve the Checkout Session with expand
    const session = await this.stripe.checkout.sessions.retrieve(id, {
      expand: ["line_items"],
    });
    const permanentPack =
      session?.line_items?.data[0].price?.transform_quantity?.divide_by;
    const quantity = permanentPack || session?.line_items?.data[0].quantity;
    if (!quantity) {
      throw new Error("Missing quantity in checkout.session.completed event");
    }
    logger.info(`Incrementing credits by ${quantity} to user ${userId}`);
    await this.creditsService.incrementCredits(
      userId,
      quantity,
      "permanent",
      `Payment of ${quantity} credits`,
    );
  }
}

export class RecurringPaymentWebhookHandler {
  constructor(
    private prisma: PrismaClientType,
    private creditsService: CreditsService,
  ) {}

  async onCheckoutSessionCompleted(data: any) {
    const user_id = data.object.client_reference_id;
    const stripe_customer_id = data.object.customer;
    const stripe_subscription_id = data.object.subscription;
    if (
      user_id == null ||
      stripe_customer_id == null ||
      stripe_subscription_id == null
    ) {
      throw new Error(
        "Missing user_id, stripe_customer_id, or stripe_subscription_id in checkout.session.completed event",
      );
    }
    const existingSubscription = await this.prisma.subscription.findFirst({
      where: {
        stripe_subscription_id: stripe_subscription_id,
      },
    });
    if (existingSubscription != null && existingSubscription.user_id == null) {
      const customer = await this.prisma.customer.findUnique({
        where: {
          id: user_id,
        },
      });
      if (customer == null) {
        await this.prisma.customer.create({
          data: {
            id: user_id,
            stripe_customer_id: stripe_customer_id,
          },
        });
      } else {
        await this.prisma.customer.update({
          where: {
            id: user_id,
          },
          data: {
            stripe_customer_id: stripe_customer_id,
          },
        });
      }
      await this.prisma.subscription.update({
        where: {
          id: existingSubscription.id,
        },
        data: {
          user_id: user_id,
        },
      });
      const product = await this.prisma.product.findUniqueOrThrow({
        where: {
          lookup_key: existingSubscription.subscription_key,
        },
      });
      if (product.credits_quantity == null)
        throw new Error("Missing credits_quantity in product");
      await this.creditsService.incrementCredits(
        user_id,
        product.credits_quantity,
        "rental",
        "Subscription aquisition",
      );
    }
  }

  async onInvoicePaid(data: any) {
    const subscription = data.object;
    const stripe_customer_id = subscription.customer;
    const subscription_key = subscription.lines.data[0].price.lookup_key;
    const billing_reason = subscription.billing_reason;

    if (!stripe_customer_id || !subscription_key || !billing_reason) {
      throw new Error(
        "Missing stripe_customer_id, subscription_key, or billing_reason in invoice.paid event",
      );
    }

    const planCredits = await this.getSubscriptionCredits(subscription_key);
    switch (billing_reason) {
      case "subscription_create":
        break;
      case "subscription_cycle":
        await this.creditsService.renewCredits(
          stripe_customer_id,
          planCredits,
          "rental",
          "Subscription renewal",
        );
        break;
      case "subscription_update": {
        // The following code handles the case where a user upgrades their plan.
        const lines = subscription.lines.data;
        const oldItem = lines.find(
          (line: any) => line.proration_details.credited_items != null,
        );
        const newItem = lines.find(
          (line: any) => line.proration_details.credited_items == null,
        );
        if (!oldItem || !newItem) {
          throw new Error("Missing oldItem or newItem in invoice.paid event");
        }
        const oldProduct = await this.prisma.product.findUniqueOrThrow({
          where: { lookup_key: oldItem.price.lookup_key },
        });
        const newProduct = await this.prisma.product.findUniqueOrThrow({
          where: { lookup_key: newItem.price.lookup_key },
        });
        if (newProduct.rank > oldProduct.rank) {
          if (!newProduct.credits_quantity || !oldProduct.credits_quantity)
            throw new Error("Missing credits_quantity in product");
          const newCredits =
            newProduct.credits_quantity - oldProduct.credits_quantity;
          await this.creditsService.incrementCredits(
            stripe_customer_id,
            newCredits,
            "rental",
            "Subscription upgrade",
          );
        }
        break;
      }
      default:
        break;
    }
  }

  async onInvoicePaymentFailed(data: any) {
    const stripe_subscription_id = data.object.subscription;
    const status = data.object.status;

    if (!stripe_subscription_id) {
      throw new Error(
        "Missing stripe_subscription_id in invoice.payment_failed event",
      );
    }

    await this.prisma.subscription.update({
      where: {
        stripe_subscription_id: stripe_subscription_id,
      },
      data: {
        status,
      },
    });
  }

  async getSubscriptionCredits(lookup_key: string) {
    const result = await this.prisma.product.findFirstOrThrow({
      where: {
        lookup_key: lookup_key,
      },
    });
    if (result.credits_quantity == null)
      throw new Error(`Missing credits_quantity for plan ${lookup_key}`);
    return result.credits_quantity;
  }

  async onCustomerSubscriptionCreated(data: any) {
    const subscription = data.object;
    const stripe_product_id = subscription.items.data[0].price.product;
    const subscription_key = subscription.items.data[0].price.lookup_key;
    const status = subscription.status;
    const cancel_at_period_end = subscription.cancel_at_period_end;
    const current_period_end = subscription.current_period_end;
    const current_period_start = subscription.current_period_start;

    await this.prisma.subscription.create({
      data: {
        stripe_subscription_id: subscription.id,
        stripe_product_id: stripe_product_id,
        subscription_key: subscription_key,
        status: status,
        cancel_at_period_end: cancel_at_period_end,
        current_period_end: moment.unix(current_period_end).toDate(),
        current_period_start: moment.unix(current_period_start).toDate(),
      },
    });
  }

  /**
   * Updates the subscription status, the product and the subscription key.
   */
  async onCustomerSubscriptionUpdated(data: any) {
    const subscription = data.object;
    const status = subscription.status;
    const stripe_subscription_id = subscription.id;
    const stripe_customer_id = subscription.customer;
    const stripe_product_id = subscription.items.data[0].price.product;
    const subscription_key = subscription.items.data[0].price.lookup_key;
    const cancel_at_period_end = subscription.cancel_at_period_end;
    const current_period_end = subscription.current_period_end;
    const current_period_start = subscription.current_period_start;

    if (
      !stripe_subscription_id ||
      !stripe_customer_id ||
      !stripe_product_id ||
      !subscription_key
    ) {
      throw new Error(
        "Missing stripe_subscription_id, stripe_customer_id, stripe_product_id, or subscription_key in customer.subscription.updated event",
      );
    }

    await this.prisma.subscription.update({
      where: {
        stripe_subscription_id,
      },
      data: {
        status,
        stripe_product_id,
        subscription_key,
        cancel_at_period_end,
        current_period_end: moment.unix(current_period_end).toDate(),
        current_period_start: moment.unix(current_period_start).toDate(),
      },
    });
  }

  /**
   * When cancelling a subscription, update the status to `cancelled` and
   * remove all credits form their balance. He no longer has access to the
   * membership at this point.
   */
  async onCustomerSubscriptionDeleted(data: any) {
    const subscription = data.object;
    const status = subscription.status;
    const stripe_subscription_id = subscription.id;
    const stripe_customer_id = subscription.customer;

    if (!stripe_subscription_id || !stripe_customer_id) {
      throw new Error(
        "Missing stripe_subscription_id or stripe_customer_id in customer.subscription.deleted event",
      );
    }

    // Update status to `cancelled`.
    await this.prisma.subscription.update({
      where: {
        stripe_subscription_id,
      },
      data: {
        status,
      },
    });

    // Remove all credits.
    await this.creditsService.renewCredits(
      stripe_customer_id,
      0,
      "rental",
      "Subscription cancellation",
    );
  }
}
