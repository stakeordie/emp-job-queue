import {
  OneTimePaymentWebhookHandler,
  RecurringPaymentWebhookHandler,
} from "../../../lib/payments";
import logger from "../../../logger";
import { Request, Response } from "express";
import Stripe from "stripe";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export default function (
  oneTimePaymentWebhookHandler: OneTimePaymentWebhookHandler,
  recurringPaymentWebhookHandler: RecurringPaymentWebhookHandler,
  stripe: Stripe,
) {
  return async function (req: Request, res: Response) {
    let data;
    let eventType;

    // Check if webhook signing is configured.
    if (webhookSecret) {
      // Retrieve the event by verifying the signature using the raw body and secret.
      let event;
      const signature = req.headers["stripe-signature"];

      if (!signature) {
        console.warn(`⚠️  Webhook signature missing.`);
        return res.sendStatus(400);
      }

      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          signature,
          webhookSecret,
        );
      } catch (err) {
        console.warn(`⚠️  Webhook signature verification failed.`);
        return res.sendStatus(400);
      }
      // Extract the object from the event.
      data = event.data;
      eventType = event.type;
    } else {
      // Webhook signing is recommended, but if the secret is not configured in `config.js`,
      // retrieve the event data directly from the request body.
      data = req.body.data;
      eventType = req.body.type;
    }

    logger.info(`Received ${eventType} event`);
    logger.debug(JSON.stringify(data));

    try {
      switch (eventType) {
        case "checkout.session.completed":
          // Payment is successful and the subscription is created.
          // You should provision the subscription and save the customer ID to your database.
          if (data.object.mode === "payment") {
            await oneTimePaymentWebhookHandler.onCheckoutSessionCompleted(data);
          } else if (data.object.mode === "subscription") {
            await recurringPaymentWebhookHandler.onCheckoutSessionCompleted(
              data,
            );
          }
          break;
        case "invoice.paid":
          // Continue to provision the subscription as payments continue to be made.
          // Store the status in your database and check when a user accesses your service.
          // This approach helps you avoid hitting rate limits.
          await recurringPaymentWebhookHandler.onInvoicePaid(data);
          break;
        case "invoice.payment_failed":
          // The payment failed or the customer does not have a valid payment method.
          // The subscription becomes past_due. Notify your customer and send them to the
          // customer portal to update their payment information.
          await recurringPaymentWebhookHandler.onInvoicePaymentFailed(data);
          break;
        case "customer.subscription.created":
          await recurringPaymentWebhookHandler.onCustomerSubscriptionCreated(
            data,
          );
          break;
        case "customer.subscription.updated":
          await recurringPaymentWebhookHandler.onCustomerSubscriptionUpdated(
            data,
          );
          break;
        case "customer.subscription.deleted":
          await recurringPaymentWebhookHandler.onCustomerSubscriptionDeleted(
            data,
          );
          break;
        default:
        // Unhandled event type
      }
    } catch (e) {
      logger.error(`Error handling ${eventType} event`, e);
      const message = e instanceof Error ? e.message : "Unknown error";
      return res.status(500).json({
        message,
      });
    }

    res.sendStatus(200);
  };
}
