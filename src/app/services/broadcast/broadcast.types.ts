export type StudentRole = '一般學生' | '資訊股長' | '班代表';

export interface BroadcastUser {
  id: string;
  name: string;
  role: StudentRole;
  canConfirm: boolean;
  canReply: boolean;
}

export interface BroadcastReply {
  id: string;
  authorName: string;
  createdAt: string;
  content: string;
  replies: BroadcastReply[];
}

export interface Broadcast {
  id: string;
  senderName: string;
  sentAt: string;
  content: string;
  confirmationDueAt: string;
  confirmation: { confirmedAt: string; confirmedBy: string; role: StudentRole } | null;
  replies: BroadcastReply[];
}
