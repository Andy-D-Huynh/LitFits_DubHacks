import type { Order } from '@fitmirror/shared';

// See docs/checkout-privacy.md. Never handles raw card numbers.
export interface PaymentProvider {
  readonly name: string;
  createSession(order: Order): Promise<{ clientData: unknown }>;
  confirm(
    orderId: string,
    clientData: unknown,
  ): Promise<{ status: 'paid' | 'failed'; ref: string }>;
}
