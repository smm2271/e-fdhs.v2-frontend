export type Layer = 'broadcasts' | 'confirmations' | 'replies';
export const LAYERS: Layer[] = ['broadcasts', 'confirmations', 'replies'];
export interface TargetProjection {
  group_id: string;
  group_name: string;
  can_confirm: boolean;
  can_reply: boolean;
}
export interface BroadcastProjection {
  id: string;
  author_id: string;
  sender_name: string;
  content: string;
  created_at: string;
  ack_deadline_at: string;
  targets: TargetProjection[];
}
export interface ConfirmationProjection {
  broadcast_id: string;
  group_id: string;
  confirmed_by_account_id: string;
  confirmed_by: string;
  role: string;
  confirmed_at: string;
}
export interface ReplyProjection {
  id: string;
  broadcast_id: string;
  group_id: string;
  author_id: string;
  author_name: string;
  role: string;
  content: string;
  ref_id: string | null;
  created_at: string;
}
export interface Layers {
  broadcasts: BroadcastProjection[];
  confirmations: ConfirmationProjection[];
  replies: ReplyProjection[];
}
export type Hashes = Record<Layer, string>;
export interface LayerChunk {
  records: (BroadcastProjection | ConfirmationProjection | ReplyProjection)[];
  hash: string;
  offset: number;
  next_offset: number | null;
  activity?: { event_count: number; last_changed_at: string | null } | null;
}
export interface SyncWindow {
  window_id: string;
  member_ids: string[];
  hashes: Hashes;
  layers: Partial<Record<Layer, LayerChunk>>;
}
export interface SyncUser {
  id: string;
  name: string;
  role: string;
  can_confirm: boolean;
  can_reply: boolean;
  can_publish: boolean;
}
export interface SyncRequest {
  week: string;
  schema_version: number;
  scope_key: string | null;
  after_window_id: string | null;
  windows: { window_id: string; hashes: Hashes }[];
}
export interface SyncResponse {
  schema_version: number;
  week: string;
  scope_key: string;
  current_user: SyncUser;
  reset_required: boolean;
  reset_reason: string | null;
  snapshot_version: string;
  windows: SyncWindow[];
  removed_window_ids: string[];
  next_after_window_id: string | null;
}
export interface ChunkResponse extends LayerChunk {
  schema_version: number;
  scope_key: string;
}
