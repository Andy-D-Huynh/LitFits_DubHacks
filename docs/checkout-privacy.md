# Checkout and privacy

Spec sections 13 and 14.

## Payment provider

```ts
interface PaymentProvider {
  createSession(order: Order): Promise<{ clientData: unknown }>;
  confirm(orderId: string, clientData: unknown): Promise<{ status: 'paid' | 'failed'; ref: string }>;
}
```

Implementations: `MockPayment` and `VisaSandboxPayment`. The Visa shape is a **placeholder** until the track's real API list is known (open question 2 in `build-plan.md`).

- Never handle raw card numbers. Use tokenized credentials or the provider's hosted fields, sandbox only.

## Checkout flow

1. User confirms the outfit.
2. App creates an order with one line per retailer item.
3. One payment confirmation covers the whole outfit.
4. Each retailer line shows its fulfillment status, simulated in sandbox.

Be honest in the pitch: real multi-merchant purchase requires merchant integration, so the hackathon demo is sandbox, with the extension adapters (tier 3) showing the real-world path.

## Privacy and security

- Private storage buckets; signed URLs expiring in 10 minutes; RLS on all tables.
- Strip EXIF on upload. Delete raw capture photos after measurement unless the user opts in to keep a model photo.
- Face is excluded from try-on by default.
- A **Delete my data** button removes profile, photos, renders, and orders.
- **No user body data or photos ever go to the LLM.** Disclose that the try-on provider receives the head-cropped model photo.
- Validate and rate-limit the ingest endpoint. Treat page text as untrusted input to the LLM and never execute anything it returns.
