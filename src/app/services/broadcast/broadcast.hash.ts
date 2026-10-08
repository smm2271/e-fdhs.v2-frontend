import { Layer, Layers } from './broadcast.sync.types';

export function canonicalJson(value: unknown): string {
  const validate = (item: unknown): void => {
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'string') {
      for (const char of item) {
        const code = char.codePointAt(0)!;
        if (code >= 0xd800 && code <= 0xdfff) throw new Error('Invalid canonical Unicode');
      }
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(validate);
      return;
    }
    throw new Error('Canonical values are strings, booleans, null or arrays');
  };
  validate(value);
  return JSON.stringify(value);
}

export async function digest(value: unknown): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalJson(value)),
  );
  return (
    'sha256:' + Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
  );
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function projection(layer: Layer, records: Layers[Layer]): unknown[] {
  if (layer === 'broadcasts')
    return [...(records as Layers['broadcasts'])]
      .sort((a, b) => compare(a.id, b.id))
      .map((r) => [
        r.id,
        r.author_id,
        r.sender_name,
        r.content,
        r.created_at,
        r.ack_deadline_at,
        [...r.targets]
          .sort((a, b) => compare(a.group_id, b.group_id))
          .map((t) => [t.group_id, t.group_name, t.can_confirm, t.can_reply]),
      ]);
  if (layer === 'confirmations')
    return [...(records as Layers['confirmations'])]
      .sort((a, b) => compare(a.broadcast_id, b.broadcast_id) || compare(a.group_id, b.group_id))
      .map((r) => [
        r.broadcast_id,
        r.group_id,
        r.confirmed_by_account_id,
        r.confirmed_by,
        r.role,
        r.confirmed_at,
      ]);
  return [...(records as Layers['replies'])]
    .sort(
      (a, b) =>
        compare(a.broadcast_id, b.broadcast_id) ||
        compare(a.group_id, b.group_id) ||
        compare(a.created_at, b.created_at) ||
        compare(a.id, b.id),
    )
    .map((r) => [
      r.id,
      r.broadcast_id,
      r.group_id,
      r.author_id,
      r.author_name,
      r.role,
      r.content,
      r.ref_id,
      r.created_at,
    ]);
}
export const layerHash = (windowId: string, layer: Layer, records: Layers[Layer]) =>
  digest(['broadcast-sync-v1', layer, windowId, projection(layer, records)]);

export function isoWeek(date: Date): string {
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  const thursday = new Date(local + 'T00:00:00Z');
  thursday.setUTCDate(thursday.getUTCDate() + 3 - ((thursday.getUTCDay() + 6) % 7));
  const year = thursday.getUTCFullYear();
  const first = new Date(Date.UTC(year, 0, 4));
  first.setUTCDate(first.getUTCDate() + 3 - ((first.getUTCDay() + 6) % 7));
  return `${year}-W${String(1 + Math.round((thursday.getTime() - first.getTime()) / 604800000)).padStart(2, '0')}`;
}

export function utcMicros(value: string): string {
  const normalized = value.replace('+00:00', 'Z');
  const match = /^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z$/.exec(normalized);
  if (!match) throw new Error('Expected UTC timestamp');
  return `${match[1]}.${(match[2] ?? '').padEnd(6, '0')}Z`;
}
