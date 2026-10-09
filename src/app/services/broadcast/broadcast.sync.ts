import { BroadcastApi, BroadcastDto, ReplyDto } from './broadcast.api';
import { layerHash, utcMicros } from './broadcast.hash';
import { Broadcast, BroadcastReply, BroadcastUser } from './broadcast.types';
import { Layer, Layers, LAYERS, Hashes, SyncUser } from './broadcast.sync.types';

interface WindowState {
  windowId: string;
  layers: Layers;
}
const emptyLayers = (): Layers => ({ broadcasts: [], confirmations: [], replies: [] });

export class BroadcastSyncClient {
  private windows = new Map<string, WindowState>();
  scope: string | null = null;
  week: string | null = null;
  snapshotVersion = '';

  clear(): void {
    this.windows.clear();
    this.scope = null;
    this.week = null;
    this.snapshotVersion = '';
  }
  async hashes(window: WindowState): Promise<Hashes> {
    const hashes = {} as Hashes;
    for (const layer of LAYERS)
      hashes[layer] = await layerHash(window.windowId, layer, window.layers[layer]);
    return hashes;
  }

  async synchronize(
    api: BroadcastApi,
    week: string,
    signal: AbortSignal,
    onScopeChange: () => void,
  ): Promise<{ rows: Broadcast[]; user: BroadcastUser; changed: boolean }> {
    let stage = new Map(this.week === week ? this.windows : []);
    let scope = this.week === week ? this.scope : null;
    let after: string | null = null;
    let user: SyncUser | undefined;
    let version = '';
    let changed = this.week !== week;
    const seen = new Set<string>();
    const cursors = new Set<string>();
    let restarts = 0;
    do {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const order = [...stage.keys()];
      const start = after ? Math.max(0, order.indexOf(after) + 1) : 0;
      const claims = [];
      for (const id of order.slice(start, start + 20))
        claims.push({ window_id: id, hashes: await this.hashes(stage.get(id)!) });
      const response = await api.sync(
        { week, schema_version: 1, scope_key: scope, after_window_id: after, windows: claims },
        signal,
      );
      if (response.schema_version !== 1 || response.week !== week)
        throw new Error('Unsupported synchronization schema');
      if (response.scope_key !== scope || response.reset_required) {
        if (scope !== null && response.scope_key !== scope) onScopeChange();
        if (++restarts > 3) throw new Error('Synchronization keeps resetting');
        stage = new Map();
        seen.clear();
        cursors.clear();
        changed = true;
      }
      scope = response.scope_key;
      user = response.current_user;
      version = response.snapshot_version;
      for (const id of response.removed_window_ids) {
        if (stage.delete(id)) changed = true;
      }
      for (const remote of response.windows) {
        seen.add(remote.window_id);
        const previous = stage.get(remote.window_id);
        const layers = { ...(previous?.layers ?? emptyLayers()) };
        for (const layer of LAYERS) {
          const first = remote.layers[layer];
          if (!first) continue;
          if (first.offset !== 0 || first.hash !== remote.hashes[layer])
            throw new Error('Invalid layer snapshot');
          const records = [...first.records];
          let next = first.next_offset;
          const offsets = new Set<number>();
          while (next !== null) {
            if (offsets.has(next) || next !== records.length)
              throw new Error('Invalid layer paging');
            offsets.add(next);
            const page = await api.chunk(
              remote.window_id,
              layer,
              week,
              remote.hashes[layer],
              next,
              scope,
              signal,
            );
            if (
              page.hash !== remote.hashes[layer] ||
              page.scope_key !== scope ||
              page.schema_version !== 1 ||
              page.offset !== next
            )
              throw new Error('Layer snapshot changed');
            records.push(...page.records);
            next = page.next_offset;
          }
          if (
            (await layerHash(remote.window_id, layer, records as Layers[Layer])) !==
            remote.hashes[layer]
          )
            throw new Error('Invalid server layer hash');
          Object.assign(layers, { [layer]: records });
          changed = true;
        }
        if (
          layers.broadcasts
            .map((b) => b.id)
            .sort()
            .join() !== [...remote.member_ids].sort().join()
        )
          throw new Error('Window membership mismatch');
        for (const layer of LAYERS) {
          if ((await layerHash(remote.window_id, layer, layers[layer])) !== remote.hashes[layer])
            throw new Error('Incomplete window synchronization');
        }
        stage.set(remote.window_id, { windowId: remote.window_id, layers });
      }
      after = response.next_after_window_id;
      if (after && cursors.has(after)) throw new Error('Repeated window cursor');
      if (after) cursors.add(after);
    } while (after);
    for (const id of stage.keys()) {
      if (!seen.has(id)) {
        stage.delete(id);
        changed = true;
      }
    }
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const rows = this.render(stage);
    this.windows = stage;
    this.scope = scope;
    this.week = week;
    this.snapshotVersion = version;
    const current = user!;
    return {
      rows,
      user: {
        id: current.id,
        name: current.name,
        role: current.role,
        canConfirm: current.can_confirm,
        canReply: current.can_reply,
        canPublish: current.can_publish,
      },
      changed,
    };
  }

  acceptMutation(dto: BroadcastDto): void {
    for (const [id, window] of this.windows) {
      const original = window.layers.broadcasts.find((b) => b.id === dto.id);
      if (!original) continue;
      const groups = new Set(dto.targets.map((t) => t.group_id));
      const layers = {
        ...window.layers,
        broadcasts: window.layers.broadcasts.map((b) =>
          b.id !== dto.id
            ? b
            : {
                ...b,
                author_id: dto.author_id ?? b.author_id,
                sender_name: dto.sender_name,
                content: dto.content,
                created_at: utcMicros(dto.created_at),
                ack_deadline_at: utcMicros(dto.ack_deadline_at),
                targets: b.targets.map((t) => {
                  const target = dto.targets.find((next) => next.group_id === t.group_id);
                  return target
                    ? {
                        group_id: target.group_id,
                        group_name: target.group_name,
                        can_confirm: target.can_confirm,
                        can_reply: target.can_reply,
                      }
                    : t;
                }),
              },
        ),
        confirmations: window.layers.confirmations.filter(
          (c) => c.broadcast_id !== dto.id || !groups.has(c.group_id),
        ),
        replies: window.layers.replies.filter(
          (r) => r.broadcast_id !== dto.id || !groups.has(r.group_id),
        ),
      };
      const flatten = (nodes: ReplyDto[], groupId: string, parent: string | null = null): void => {
        for (const r of nodes) {
          layers.replies.push({
            id: r.id,
            broadcast_id: dto.id,
            group_id: groupId,
            author_id: r.author_id ?? '',
            author_name: r.author_name,
            role: r.role,
            content: r.content,
            ref_id: r.ref_id ?? parent,
            created_at: utcMicros(r.created_at),
          });
          flatten(r.replies, groupId, r.id);
        }
      };
      for (const t of dto.targets) {
        if (t.confirmation)
          layers.confirmations.push({
            broadcast_id: dto.id,
            group_id: t.group_id,
            confirmed_by_account_id: t.confirmation.confirmed_by_account_id ?? '',
            confirmed_by: t.confirmation.confirmed_by,
            role: t.confirmation.role,
            confirmed_at: utcMicros(t.confirmation.confirmed_at),
          });
        flatten(t.replies, t.group_id);
      }
      this.windows.set(id, { ...window, layers });
    }
  }

  render(windows = this.windows): Broadcast[] {
    const rows: Broadcast[] = [];
    for (const window of windows.values()) {
      for (const b of window.layers.broadcasts) {
        for (const t of b.targets) {
          const confirmation = window.layers.confirmations.find(
            (c) => c.broadcast_id === b.id && c.group_id === t.group_id,
          );
          const records = window.layers.replies
            .filter((r) => r.broadcast_id === b.id && r.group_id === t.group_id)
            .sort((a, b) =>
              a.created_at < b.created_at
                ? -1
                : a.created_at > b.created_at
                  ? 1
                  : a.id < b.id
                    ? -1
                    : 1,
            );
          const nodes = new Map(
            records.map((r) => [
              r.id,
              {
                id: r.id,
                authorName: `${r.author_name} \u00b7 ${r.role}`,
                createdAt: r.created_at,
                content: r.content,
                replies: [],
              } as BroadcastReply,
            ]),
          );
          const roots: BroadcastReply[] = [];
          for (const r of records) {
            if (r.ref_id === null) roots.push(nodes.get(r.id)!);
            else {
              const parent = nodes.get(r.ref_id);
              if (!parent) throw new Error('Invalid reply parent');
              parent.replies.push(nodes.get(r.id)!);
            }
          }
          rows.push({
            id: `${b.id}:${t.group_id}`,
            broadcastId: b.id,
            groupId: t.group_id,
            senderName: `${b.sender_name} \u00b7 ${t.group_name}`,
            sentAt: b.created_at,
            content: b.content,
            confirmationDueAt: b.ack_deadline_at,
            canConfirm: t.can_confirm,
            canReply: t.can_reply,
            confirmation: confirmation
              ? {
                  confirmedAt: confirmation.confirmed_at,
                  confirmedBy: confirmation.confirmed_by,
                  role: confirmation.role,
                }
              : null,
            replies: roots,
          });
        }
      }
    }
    return rows;
  }
}
