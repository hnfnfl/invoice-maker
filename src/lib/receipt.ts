import type { Invoice, Payment, ReceiptOverrides } from '../types';

export const STAMP_DUTY_THRESHOLD = 5_000_000;

export interface ResolvedReceipt {
  number: string;
  receivedFrom: string;
  amount: number;
  purpose: string;
  date: string;
  method: string;
  stampDuty: boolean;
  autoStampDuty: boolean;
  overridden: Set<keyof ReceiptOverrides>;
  amountMismatch: boolean;
}

export function defaultPurpose(inv: Invoice, payment: Payment, fallbackTitle = ''): string {
  const items = inv.items.map((i) => i.description).filter(Boolean).join(', ') || fallbackTitle;
  return `${items} (Invoice ${inv.number})${payment.note ? `. ${payment.note}` : ''}`;
}

export function resolveReceipt(inv: Invoice, payment: Payment, fallbackTitle = ''): ResolvedReceipt {
  const o = payment.receipt ?? {};
  const overridden = new Set<keyof ReceiptOverrides>();
  const pick = <K extends keyof ReceiptOverrides>(key: K, auto: NonNullable<ReceiptOverrides[K]>) => {
    if (o[key] !== undefined) overridden.add(key);
    return (o[key] ?? auto) as NonNullable<ReceiptOverrides[K]>;
  };
  const amount = pick('amount', payment.amount);
  const autoStampDuty = inv.currency === 'IDR' && amount > STAMP_DUTY_THRESHOLD;
  return {
    number: pick('number', payment.receiptNumber ?? ''),
    receivedFrom: pick('receivedFrom', inv.client.name),
    amount,
    purpose: pick('purpose', defaultPurpose(inv, payment, fallbackTitle)),
    date: pick('date', payment.date),
    method: pick('method', payment.method),
    stampDuty: pick('stampDuty', autoStampDuty),
    autoStampDuty,
    overridden,
    amountMismatch: amount !== payment.amount,
  };
}
