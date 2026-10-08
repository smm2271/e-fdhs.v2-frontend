// Test-only wire fixtures use the real canonical hashing implementation.
import { layerHash, utcMicros } from './broadcast.hash';
import { BroadcastDto } from './broadcast.api';
import { Layers, LAYERS, SyncResponse, SyncWindow } from './broadcast.sync.types';

export async function syncFixture(
  items: BroadcastDto[],
  week = '2026-W41',
  windowId = 'w1',
): Promise<SyncResponse> {
  const layers: Layers = { broadcasts: [], confirmations: [], replies: [] };
  for (const b of items) {
    layers.broadcasts.push({
      id: b.id,
      author_id: b.author_id ?? 'a1',
      sender_name: b.sender_name,
      content: b.content,
      created_at: utcMicros(b.created_at),
      ack_deadline_at: utcMicros(b.ack_deadline_at),
      targets: b.targets.map((t) => ({
        group_id: t.group_id,
        group_name: t.group_name,
        can_confirm: t.can_confirm,
        can_reply: t.can_reply,
      })),
    });
    for (const t of b.targets) {
      if (t.confirmation)
        layers.confirmations.push({
          broadcast_id: b.id,
          group_id: t.group_id,
          confirmed_by_account_id: t.confirmation.confirmed_by_account_id ?? 's1',
          confirmed_by: t.confirmation.confirmed_by,
          role: t.confirmation.role,
          confirmed_at: utcMicros(t.confirmation.confirmed_at),
        });
      for (const r of t.replies)
        layers.replies.push({
          id: r.id,
          broadcast_id: b.id,
          group_id: t.group_id,
          author_id: r.author_id ?? 's1',
          author_name: r.author_name,
          role: r.role,
          content: r.content,
          ref_id: null,
          created_at: utcMicros(r.created_at),
        });
    }
  }
  const w: SyncWindow = {
    window_id: windowId,
    member_ids: items.map((b) => b.id),
    hashes: { broadcasts: '', confirmations: '', replies: '' },
    layers: {},
  };
  for (const layer of LAYERS) {
    w.hashes[layer] = await layerHash(windowId, layer, layers[layer]);
    w.layers[layer] = {
      records: layers[layer],
      hash: w.hashes[layer],
      offset: 0,
      next_offset: null,
    };
  }
  return {
    schema_version: 1,
    week,
    scope_key: 'scope1',
    current_user: {
      id: 's1',
      name: 'Officer',
      role: 'Officer',
      can_confirm: true,
      can_reply: true,
      can_publish: false,
    },
    reset_required: false,
    reset_reason: null,
    snapshot_version: 'snapshot1',
    windows: items.length ? [w] : [],
    removed_window_ids: [],
    next_after_window_id: null,
  };
}
