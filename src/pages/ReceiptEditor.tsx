import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ensureReceipt, findReceiptDuplicates, getTemplate, saveReceipt } from '../db';
import { useReceiptPdf, useSettings, useWide } from '../hooks';
import { displayDecimals, formatMoney } from '../lib/money';
import { downloadFile, safeFileName, shareOrDownload } from '../lib/files';
import { resolveReceipt } from '../lib/receipt';
import type { ReceiptOverrides, TemplateConfig } from '../types';
import { PageHeader } from '../components/layout';
import { Button, Card, EmptyState, Field, Loading, NumberInput, Segmented, TextArea, TextInput } from '../components/ui';
import { PdfPreview } from '../components/PdfPreview';
import { IconDownload, IconShare } from '../components/icons';

type Stamp = 'auto' | 'on' | 'off';

// Keyed so moving straight from one receipt to another starts with fresh state.
export function ReceiptEditor() {
  const { invoiceId, paymentId } = useParams();
  return <ReceiptForm key={`${invoiceId}/${paymentId}`} />;
}

function ReceiptForm() {
  const { invoiceId, paymentId } = useParams();
  const settings = useSettings();
  const wide = useWide();
  const inv = useLiveQuery(() => db.invoices.get(invoiceId!).then((r) => r ?? null), [invoiceId]);
  const payment = inv?.payments.find((p) => p.id === paymentId);
  const [tpl, setTpl] = useState<TemplateConfig>();
  const [ov, setOv] = useState<ReceiptOverrides | null>(null);
  const [tab, setTab] = useState<'form' | 'preview'>('form');
  const touched = useRef(false);
  const latest = useRef(ov);
  latest.current = ov;

  useEffect(() => {
    if (inv) getTemplate(inv.templateId).then(setTpl);
  }, [inv?.templateId]);

  // A payment opened without a receipt gets its automatic number here.
  useEffect(() => {
    if (invoiceId && paymentId && payment && !payment.receiptNumber) ensureReceipt(invoiceId, paymentId);
  }, [invoiceId, paymentId, !!payment, payment?.receiptNumber]);

  // Local copy of the overrides so typing is instant; it is only seeded once.
  useEffect(() => {
    if (payment && ov === null) setOv(payment.receipt ?? {});
  }, [payment, ov]);

  useEffect(() => {
    if (!touched.current || !invoiceId || !paymentId || ov === null) return;
    const t = setTimeout(() => saveReceipt(invoiceId, paymentId, ov), 400);
    return () => clearTimeout(t);
  }, [ov]);

  // The debounce above is cancelled on unmount, so whatever is still pending is written here.
  useEffect(
    () => () => {
      if (touched.current && invoiceId && paymentId && latest.current) saveReceipt(invoiceId, paymentId, latest.current);
    },
    [invoiceId, paymentId],
  );

  const draft = useMemo(() => (payment && ov ? { ...payment, receipt: ov } : undefined), [payment, ov]);
  const pdf = useReceiptPdf(inv ?? undefined, draft, tpl, settings);

  const r = inv && draft ? resolveReceipt(inv, draft, titleOf(inv, tpl)) : null;
  const duplicates = useLiveQuery(
    () => (r && invoiceId && paymentId ? findReceiptDuplicates(r.number, { invoiceId, paymentId }) : []),
    [r?.number, invoiceId, paymentId],
  );

  if (inv === undefined || !settings) return <Loading />;
  if (inv === null || !payment)
    return (
      <EmptyState
        title="Kwitansi tidak ditemukan"
        body="Pembayarannya mungkin sudah dihapus."
        action={
          <Link to="/kwitansi" className="rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-bg">
            Ke daftar kwitansi
          </Link>
        }
      />
    );
  if (!r) return <Loading />;

  const set = (patch: ReceiptOverrides) => {
    touched.current = true;
    setOv((cur) => ({ ...cur, ...patch }));
  };
  const reset = (key: keyof ReceiptOverrides) => set({ [key]: undefined });
  const label = (text: string, key: keyof ReceiptOverrides) => (
    <span className="flex items-center justify-between gap-2">
      {text}
      {r.overridden.has(key) && (
        <button type="button" onClick={() => reset(key)} className="text-xs font-semibold text-clay hover:underline">
          Kembalikan ke otomatis
        </button>
      )}
    </span>
  );

  const stamp: Stamp = ov?.stampDuty === undefined ? 'auto' : ov.stampDuty ? 'on' : 'off';
  const fileOf = () => new File([pdf.blob!], `${safeFileName(r.number || 'kwitansi')}.pdf`, { type: 'application/pdf' });
  const dec = displayDecimals(inv.currency);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,480px)] xl:grid-cols-[minmax(0,1.25fr)_minmax(0,540px)] lg:gap-8">
      <div className="min-w-0">
        <PageHeader
          back={`/invoice/${inv.id}`}
          title={<span className="font-mono text-lg font-bold md:text-xl">{r.number || 'Kwitansi'}</span>}
          sub={`Invoice ${inv.number}`}
          actions={
            <>
              <Button disabled={!pdf.blob} onClick={() => downloadFile(fileOf())}>
                <IconDownload size={18} /> Unduh
              </Button>
              <Button variant="primary" disabled={!pdf.blob} onClick={() => shareOrDownload(fileOf())}>
                <IconShare size={18} /> Bagikan
              </Button>
            </>
          }
        />

        {!wide && (
          <div className="mb-4">
            <Segmented
              label="Tampilan editor"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'form', label: 'Isi data' },
                { value: 'preview', label: 'Preview PDF' },
              ]}
            />
          </div>
        )}

        {tab === 'preview' && !wide ? (
          <PdfPreview blob={pdf.blob} busy={pdf.busy} error={pdf.error} />
        ) : (
          <Card className="flex flex-col gap-4">
            <Field
              label={label('Nomor kwitansi', 'number')}
              htmlFor="rc-number"
              hint={
                duplicates && duplicates.length > 0 ? (
                  <span className="font-semibold text-danger">Nomor ini juga dipakai kwitansi di invoice {duplicates.map((d) => d.number).join(', ')}.</span>
                ) : undefined
              }
            >
              <TextInput id="rc-number" className="font-mono" value={r.number} onChange={(e) => set({ number: e.target.value })} />
            </Field>
            <Field label={label('Telah terima dari', 'receivedFrom')} htmlFor="rc-from">
              <TextInput id="rc-from" value={r.receivedFrom} onChange={(e) => set({ receivedFrom: e.target.value })} />
            </Field>
            <Field
              label={label('Nominal', 'amount')}
              htmlFor="rc-amount"
              hint={
                r.amountMismatch ? (
                  <span className="font-semibold text-warn">Beda dari pembayaran tercatat ({formatMoney(payment.amount, inv.currency, inv.lang)}). Saldo invoice dan Laporan tidak berubah.</span>
                ) : undefined
              }
            >
              <NumberInput id="rc-amount" lang={inv.lang} decimals={dec} value={r.amount} onChange={(v) => set({ amount: v })} />
            </Field>
            <Field label={label('Untuk pembayaran', 'purpose')} htmlFor="rc-purpose">
              <TextArea id="rc-purpose" rows={3} value={r.purpose} onChange={(e) => set({ purpose: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={label('Tanggal', 'date')} htmlFor="rc-date">
                <TextInput id="rc-date" type="date" value={r.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
              </Field>
              <Field label={label('Metode', 'method')} htmlFor="rc-method">
                <TextInput id="rc-method" value={r.method} onChange={(e) => set({ method: e.target.value })} />
              </Field>
            </div>
            <Field
              label="Kotak meterai"
              hint={`Otomatis tampil kalau nominal lebih dari Rp5.000.000. Saat ini: ${r.stampDuty ? 'tampil' : 'tidak tampil'}.`}
            >
              <Segmented<Stamp>
                label="Kotak meterai"
                value={stamp}
                onChange={(v) => set({ stampDuty: v === 'auto' ? undefined : v === 'on' })}
                options={[
                  { value: 'auto', label: 'Otomatis' },
                  { value: 'on', label: 'Tampil' },
                  { value: 'off', label: 'Sembunyikan' },
                ]}
              />
            </Field>
          </Card>
        )}
      </div>

      {wide && (
        <aside className="sticky top-20 hidden self-start pb-6 lg:block" aria-label="Preview PDF">
          <PdfPreview blob={pdf.blob} busy={pdf.busy} error={pdf.error} />
        </aside>
      )}
      <div className="h-20 lg:hidden" />
    </div>
  );
}

function titleOf(inv: { title: string; lang: 'id' | 'en' }, tpl?: TemplateConfig) {
  const raw = inv.title || tpl?.titles[inv.lang] || '';
  return tpl?.style.titleCase === 'upper' ? raw.toUpperCase() : raw;
}
