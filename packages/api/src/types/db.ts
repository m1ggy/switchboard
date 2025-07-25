export type MessageStatus = 'sent' | 'draft';
export type MessageDirection = 'inbound' | 'outbound';

export interface Company {
  id: string;
  name: string;
  created_at?: Date;
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
  call_sid: string;
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

export type InboxWithDetails = {
  id: string;
  numberId: string;
  contactId: string;
  lastMessageId: string | null;
  lastCallId: string | null;

  contact: {
    id: string;
    number: string;
    label: string;
    company_id: string;
    created_at: string | null;
  };

  lastMessage: {
    id: string;
    number_id: string;
    contact_id: string;
    inbox_id: string;
    message: string | null;
    created_at: string | null;
    meta: any;
    status: 'sent' | 'draft' | null;
    direction: 'inbound' | 'outbound';
  } | null;

  lastCall: {
    id: string;
    number_id: string;
    contact_id: string;
    initiated_at: string | null;
    duration: number | null;
    meta: any;
  } | null;

  lastViewedAt: string | null;
};

export type CombinedActivity = {
  type: 'message' | 'call';
  id: string;
  numberId: string;
  createdAt: string;
  direction?: 'inbound' | 'outbound' | null;
  message?: string | null;
  status?: 'sent' | 'draft' | null;
  duration?: number | null;
  meta: any;
};

export type CallNote = {
  id: string;
  call_sid: string | null;
  room_id: string | null;
  note: string;
  contact_id: string;
  number_id: string;
  company_id: string;
};

export type UserOnboardingProgress = {
  user_id: string;
  company_setup_complete: boolean;
  number_added: boolean;
  onboarding_completed: boolean;
  last_step: string | null;
  updated_at: Date;
};

export type MediaAttachment = {
  id: string;
  message_id: string;
  media_url: string;
  content_type: string;
  file_name?: string | null;
  created_at: string;
};
