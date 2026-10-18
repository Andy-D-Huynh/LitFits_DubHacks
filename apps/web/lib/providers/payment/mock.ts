import type { Order } from '@fitmirror/shared';
import type { PaymentProvider } from './types';

// Always succeeds, so the demo checkout completes with no network.
export class MockPayment implements PaymentProvider {
  readonly name = 'mock';

  async createSession(order: Order): Promise<{ clientData: unknown }> {
    return { clientData: { provider: 'mock', orderId: order.id } };
  }

  async confirm(orderId: string): Promise<{ status: 'paid' | 'failed'; ref: string }> {
    return { status: 'paid', ref: `mock_${orderId}` };
  }
}
