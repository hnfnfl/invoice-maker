import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatMoney } from '../lib/money';
import { formatDate } from '../lib/labels';
import { resolveReceipt } from '../lib/receipt';
import type { Invoice, Payment } from '../types';
import { PageHeader } from '../components/layout';
import { Card, EmptyState, Loading, TextInput } from '../components/ui';
import { IconSearch } from '../components/icons';

interface Row {
  inv: Invoice;
  payment: Payment;
  number: string;
  receivedFrom: string;
  amount: number;
  date: string;
}

const rowOf = (inv: Invoice, payment: Payment): Row => {
  const r = resolveReceipt(inv, payment);
  return { inv, payment, number: r.number, receivedFrom: r.receivedFrom, amount: r.amount, date: r.date };
};

export function ReceiptList() {
  const [q, setQ] = useState('');
  // Invoices replaced by a revision are skipped: the revision holds copies of the same payments.
  const invoices = useLiveQuery(() => db.invoices.filter((i) => !i.supersededBy).toArray(), []);
  if (invoices === undefined) return <Loading />;

  const all = invoices.flatMap((inv) => inv.payments.map((p) => rowOf(inv, p)));
  const needle = q.trim().toLowerCase();
  const match = (r: Row) => !needle || `${r.number} ${r.receivedFrom} ${r.inv.number}`.toLowerCase().includes(needle);
  const receipts = all.filter((r) => r.payment.receiptNumber && match(r)).sort((a, b) => b.date.localeCompare(a.date));
  const pending = all.filter((r) => !r.payment.receiptNumber && match(r)).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <PageHeader title="Kwitansi" sub="Semua kwitansi dari pembayaran invoice" />

      {all.length === 0 ? (
        <EmptyState title="Belum ada pembayaran" body="Kwitansi dibuat dari pembayaran. Catat pembayaran di sebuah invoice dulu." action={<Link to="/" className="rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-bg">Ke daftar invoice</Link>} />
      ) : (
        <>
          <div className="relative mb-4">
            <IconSearch size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <TextInput type="search" aria-label="Cari kwitansi" placeholder="Cari nomor, penerima, atau invoice..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-10 text-sm" />
          </div>

          {pending.length > 0 && (
            <Card className="mb-4">
              <h2 className="mb-2 text-[15px] font-bold">Pembayaran belum ada kwitansi</h2>
              <ul className="divide-y divide-line">
                {pending.map((r) => (
                  <li key={`${r.inv.id}-${r.payment.id}`} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="num font-bold">{formatMoney(r.amount, r.inv.currency, r.inv.lang)}</p>
                      <p className="truncate text-xs text-muted">
                        {r.receivedFrom || '-'} · {r.inv.number} · {formatDate(r.date, 'id', 'short')}
                      </p>
                    </div>
                    <Link to={`/kwitansi/${r.inv.id}/${r.payment.id}`} className="inline-flex min-h-9 items-center rounded-xl bg-ink px-3 text-sm font-semibold text-bg">
                      Buat kwitansi
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {receipts.length === 0 ? (
            <EmptyState title={needle ? 'Kwitansi tidak ditemukan' : 'Belum ada kwitansi'} body={needle ? `Tidak ada yang cocok dengan "${q}".` : 'Buat dari pembayaran di atas.'} />
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {receipts.map((r) => (
                <li key={`${r.inv.id}-${r.payment.id}`}>
                  <Link to={`/kwitansi/${r.inv.id}/${r.payment.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-sunken">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-sm font-bold">{r.number}</span>
                      <span className="block truncate text-xs text-muted">
                        {r.receivedFrom || '-'} · {r.inv.number} · {formatDate(r.date, 'id', 'short')}
                        {r.inv.status === 'void' && <span className="ml-1 font-bold text-danger">· Batal</span>}
                      </span>
                    </span>
                    <span className="num shrink-0 text-sm font-bold">{formatMoney(r.amount, r.inv.currency, r.inv.lang)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
