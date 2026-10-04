import type { FastifyInstance } from "fastify";

type PaymentProvider = {
  id: string;
  name: string;
  enabled: boolean;
  mode: "external-link";
  url: string | null;
};

export function paymentProviders(): PaymentProvider[] {
  const providers: PaymentProvider[] = [
    { id: "kofi", name: "Ko-fi", enabled: Boolean(process.env.KOFI_URL), mode: "external-link", url: process.env.KOFI_URL ?? null },
    { id: "paypal", name: "PayPal", enabled: Boolean(process.env.PAYPAL_PAYMENT_URL), mode: "external-link", url: process.env.PAYPAL_PAYMENT_URL ?? null },
    { id: "stripe", name: "Stripe Payment Link", enabled: Boolean(process.env.STRIPE_PAYMENT_URL), mode: "external-link", url: process.env.STRIPE_PAYMENT_URL ?? null },
  ];
  return providers.filter((provider) => provider.enabled);
}

export async function registerPaymentAdapterRoutes(app: FastifyInstance) {
  app.get("/api/v1/public/payment-providers", async (_request, reply) => {
    reply.header("cache-control", "public, max-age=60");
    return { providers: paymentProviders() };
  });
}
