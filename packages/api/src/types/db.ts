export type MessageStatus = 'sent' | 'draft';
export type MessageDirection = 'inbound' | 'outbound';

export interface Company {
  id: string;
  name: string;
  created_at: Date;
}

export interface User {
  id: string;
  user_id: string;
  added_at: Date;
  is_active: boolean;
}

export interface UserCompany {
  id: string;
  user_id: string;
  company_id: string;
}

export interface NumberEntry {
  id: string;
  company_id: string;
  number: string;
  created_at: Date;
  label: string;
}

export interface Contact {
  id: string;
  number: string;
  created_at: Date | null;
  company_id: string;
  label: string;
}

export interface Inbox {
  id: string;
  number_id: string;
  contact_id: string;
  last_message_id: string | null;
  last_call_id: string | null;
}

export interface Message {
  id: string;
  number_id: string;
  message: string | null;
  created_at: Date | null;
  contact_id: string;
  inbox_id: string;
  meta: Record<string, unknown> | null;
  status: MessageStatus | null;
  direction: MessageDirection;
}

export interface Call {
  id: string;
  number_id: string;
  contact_id: string;
  initiated_at: Date | null;
  duration: number | null;
  meta: Record<string, unknown> | null;
}

export type Notification = {
  id: string;
  message: string;
  created_at: Date;
  meta: Record<string, unknown>;
  viewed: boolean;
  user_id: string | null;
  viewed_at: Date | null;
  type: string;
};
