'use client';

import { useCallback, useState, type FormEvent } from 'react';
import { CircleCheck, CircleX, LoaderCircle, Send, Terminal, Wand2 } from 'lucide-react';

import { Badge, Panel } from '@/components/primitives';

interface IngestSuccess {
  readonly ok: true;
  readonly eventId: string;
  readonly sequence: string | null;
  readonly latencyMs: number;
}

interface IngestFailure {
  readonly ok: false;
  readonly status: number;
  readonly message: string;
  readonly fieldErrors: readonly string[];
  readonly latencyMs: number;
}

type IngestOutcome = IngestSuccess | IngestFailure;

interface RecentAttempt {
  readonly key: number;
  readonly outcome: IngestOutcome;
  readonly eventType: string;
}

interface Preset {
  readonly label: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly payload: (aggregateId: string) => Record<string, unknown>;
}

const PRESETS: readonly Preset[] = [
  {
    label: 'order.created',
    eventType: 'order.created',
    aggregateType: 'order',
    payload: (aggregateId) => ({
      orderId: aggregateId,
      total: Math.round(Math.random() * 49_000 + 1_000) / 100,
      currency: 'EUR',
      itemCount: 1 + Math.floor(Math.random() * 5),
    }),
  },
  {
    label: 'payment.settled',
    eventType: 'payment.settled',
    aggregateType: 'payment',
    payload: (aggregateId) => ({
      paymentId: aggregateId,
      orderId: `order-${Math.random().toString(36).slice(2, 8)}`,
      amount: Math.round(Math.random() * 90_000 + 1_000) / 100,
      processor: 'stripe',
    }),
  },
  {
    label: 'user.signed_up',
    eventType: 'user.signed_up',
    aggregateType: 'user',
    payload: (aggregateId) => ({
      userId: aggregateId,
      email: `${aggregateId}@example.com`,
      plan: Math.random() > 0.5 ? 'pro' : 'free',
    }),
  },
  {
    label: 'shipment.dispatched',
    eventType: 'shipment.dispatched',
    aggregateType: 'shipment',
    payload: (aggregateId) => ({
      shipmentId: aggregateId,
      carrier: 'DHL',
      trackingCode: `DHL-${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
    }),
  },
];

function randomAggregateId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function fieldErrorLines(details: unknown): string[] {
  if (typeof details !== 'object' || details === null) {
    return [];
  }
  const fieldErrors = (details as { fieldErrors?: unknown }).fieldErrors;
  if (typeof fieldErrors !== 'object' || fieldErrors === null) {
    return [];
  }
  const lines: string[] = [];
  for (const [field, messages] of Object.entries(fieldErrors as Record<string, unknown>)) {
    if (Array.isArray(messages)) {
      for (const message of messages) {
        if (typeof message === 'string') {
          lines.push(`${field}: ${message}`);
        }
      }
    }
  }
  return lines;
}

export function IngestionSimulator({ disabled }: { readonly disabled: boolean }) {
  const [eventType, setEventType] = useState<string>('order.created');
  const [aggregateType, setAggregateType] = useState<string>('order');
  const [aggregateId, setAggregateId] = useState<string>(randomAggregateId('order'));
  const [payloadText, setPayloadText] = useState<string>(
    JSON.stringify(PRESETS[0]?.payload(aggregateId) ?? { value: 1 }, null, 2),
  );
  const [source, setSource] = useState<string>('dashboard-simulator');
  const [correlationId, setCorrelationId] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [outcome, setOutcome] = useState<IngestOutcome | null>(null);
  const [recent, setRecent] = useState<RecentAttempt[]>([]);

  const applyPreset = useCallback((preset: Preset) => {
    const nextId = randomAggregateId(preset.aggregateType);
    setEventType(preset.eventType);
    setAggregateType(preset.aggregateType);
    setAggregateId(nextId);
    setPayloadText(JSON.stringify(preset.payload(nextId), null, 2));
  }, []);

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      if (sending || disabled) {
        return;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(payloadText);
      } catch {
        setOutcome({
          ok: false,
          status: 0,
          message: 'Payload is not valid JSON.',
          fieldErrors: [],
          latencyMs: 0,
        });
        return;
      }
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        setOutcome({
          ok: false,
          status: 0,
          message: 'Payload must be a JSON object (e.g. { "amount": 42 }).',
          fieldErrors: [],
          latencyMs: 0,
        });
        return;
      }

      const metadata: Record<string, string> = {};
      if (source.trim().length > 0) {
        metadata['source'] = source.trim();
      }
      if (correlationId.trim().length > 0) {
        metadata['correlationId'] = correlationId.trim();
      }

      const startedAt = performance.now();
      setSending(true);
      setOutcome(null);
      try {
        const response = await fetch('/api/events', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            eventType: eventType.trim(),
            aggregateType: aggregateType.trim(),
            aggregateId: aggregateId.trim(),
            payload,
            ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
          }),
          cache: 'no-store',
        });
        const latencyMs = Math.round(performance.now() - startedAt);
        const body: unknown = await response.json();

        if (response.ok) {
          const successBody = body as { id?: unknown; sequence?: unknown };
          const result: IngestSuccess = {
            ok: true,
            eventId: typeof successBody.id === 'string' ? successBody.id : 'unknown',
            sequence: typeof successBody.sequence === 'string' ? successBody.sequence : null,
            latencyMs,
          };
          setOutcome(result);
          setRecent((previous) =>
            [{ key: Date.now(), outcome: result, eventType: eventType.trim() }, ...previous].slice(0, 6),
          );
        } else {
          const errorBody = body as { message?: unknown; details?: unknown };
          const result: IngestFailure = {
            ok: false,
            status: response.status,
            message: typeof errorBody.message === 'string' ? errorBody.message : `Request failed (${response.status})`,
            fieldErrors: fieldErrorLines(errorBody.details),
            latencyMs,
          };
          setOutcome(result);
          setRecent((previous) =>
            [{ key: Date.now(), outcome: result, eventType: eventType.trim() }, ...previous].slice(0, 6),
          );
        }
      } catch {
        const result: IngestFailure = {
          ok: false,
          status: 502,
          message: 'Dashboard backend unreachable — is the engine running?',
          fieldErrors: [],
          latencyMs: Math.round(performance.now() - startedAt),
        };
        setOutcome(result);
        setRecent((previous) =>
          [{ key: Date.now(), outcome: result, eventType: eventType.trim() }, ...previous].slice(0, 6),
        );
      } finally {
        setSending(false);
      }
    },
    [aggregateId, aggregateType, correlationId, disabled, eventType, payloadText, sending, source],
  );

  const inputClass =
    'w-full rounded-lg border border-edge bg-canvas px-3 py-2 font-mono text-xs text-ink placeholder:text-faint outline-none transition-colors focus:border-accent/60 focus:ring-1 focus:ring-accent/40';
  const labelClass = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted';

  return (
    <Panel
      title="Ingestion Simulator"
      icon={Terminal}
      bodyClassName="p-4"
      actions={<Badge tone="accent">POST /v1/events</Badge>}
    >
      <div className="mb-4 flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => applyPreset(preset)}
            className="inline-flex items-center gap-1 rounded-full border border-edge bg-panel-elevated px-2.5 py-1 font-mono text-[11px] text-muted transition-colors hover:border-accent/50 hover:text-accent"
          >
            <Wand2 className="h-3 w-3" aria-hidden />
            {preset.label}
          </button>
        ))}
      </div>

      <form onSubmit={(event) => void submit(event)} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="sim-event-type" className={labelClass}>
              Event type
            </label>
            <input
              id="sim-event-type"
              value={eventType}
              onChange={(changeEvent) => setEventType(changeEvent.target.value)}
              className={inputClass}
              placeholder="order.created"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="sim-aggregate-type" className={labelClass}>
              Aggregate type
            </label>
            <input
              id="sim-aggregate-type"
              value={aggregateType}
              onChange={(changeEvent) => setAggregateType(changeEvent.target.value)}
              className={inputClass}
              placeholder="order"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="col-span-2">
            <label htmlFor="sim-aggregate-id" className={labelClass}>
              Aggregate ID
            </label>
            <input
              id="sim-aggregate-id"
              value={aggregateId}
              onChange={(changeEvent) => setAggregateId(changeEvent.target.value)}
              className={inputClass}
              placeholder="order-42"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>

        <div>
          <label htmlFor="sim-payload" className={labelClass}>
            Payload (JSON object)
          </label>
          <textarea
            id="sim-payload"
            value={payloadText}
            onChange={(changeEvent) => setPayloadText(changeEvent.target.value)}
            className={`${inputClass} h-36 resize-y leading-relaxed`}
            spellCheck={false}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="sim-source" className={labelClass}>
              Metadata source
            </label>
            <input
              id="sim-source"
              value={source}
              onChange={(changeEvent) => setSource(changeEvent.target.value)}
              className={inputClass}
              placeholder="optional"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div>
            <label htmlFor="sim-correlation" className={labelClass}>
              Correlation ID
            </label>
            <input
              id="sim-correlation"
              value={correlationId}
              onChange={(changeEvent) => setCorrelationId(changeEvent.target.value)}
              className={inputClass}
              placeholder="optional uuid"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={sending || disabled}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent/15 px-4 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
          {sending ? 'Sending…' : 'Send event'}
        </button>
      </form>

      {outcome !== null ? (
        <div
          className={`mt-4 rounded-lg border px-3 py-2.5 text-xs ${
            outcome.ok ? 'border-ok/30 bg-ok/10 text-ok' : 'border-danger/30 bg-danger/10 text-danger'
          }`}
          role="status"
        >
          {outcome.ok ? (
            <div className="flex items-start gap-2">
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold">201 Created · {outcome.latencyMs} ms</p>
                <p className="mt-0.5 truncate font-mono text-[11px]" title={outcome.eventId}>
                  id {outcome.eventId}
                </p>
                {outcome.sequence !== null ? (
                  <p className="font-mono text-[11px] text-muted">sequence {outcome.sequence}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <CircleX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold">
                  {outcome.status === 0 ? 'Invalid payload' : `HTTP ${outcome.status}`} · {outcome.latencyMs} ms
                </p>
                <p className="mt-0.5">{outcome.message}</p>
                {outcome.fieldErrors.length > 0 ? (
                  <ul className="mt-1 list-inside list-disc space-y-0.5 font-mono text-[11px] opacity-90">
                    {outcome.fieldErrors.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {recent.length > 0 ? (
        <div className="mt-4 border-t border-edge pt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Recent attempts</p>
          <ul className="space-y-1">
            {recent.map((attempt) => (
              <li key={attempt.key} className="flex items-center justify-between gap-2 font-mono text-[11px]">
                <span className="truncate text-muted">{attempt.eventType}</span>
                <span className={attempt.outcome.ok ? 'text-ok' : 'text-danger'}>
                  {attempt.outcome.ok ? '201' : `ERR ${attempt.outcome.status === 0 ? 400 : attempt.outcome.status}`} ·{' '}
                  {attempt.outcome.latencyMs}ms
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}
