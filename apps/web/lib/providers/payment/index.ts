import 'server-only';
import { env } from '../../env';
import { MockPayment } from './mock';
import type { PaymentProvider } from './types';

export type { PaymentProvider } from './types';

export function getPaymentProvider(demo: boolean): PaymentProvider {
  const provider = env().PAYMENT_PROVIDER;
  if (demo || provider === 'mock') return new MockPayment();
  throw new Error(`Payment provider "${provider}" is not implemented yet (M5)`);
}
