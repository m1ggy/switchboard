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
  first_name: string;
  last_name: string;
  stripe_customer_id: string;
  onboarding_step: number;
  onboarding_completed: boolean;
  stripe_subscription_id: string;
  subscription_status: string;
  selected_plan: string;
  plan_started_at: string;
  plan_ends_at: string;
  email: string;
  cancel_at_period_end: boolean;
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
  message: string;
  contact_id: string;
  inbox_id: string;
  meta?: Record<string, unknown>;
  status?: MessageStatus;
  direction: MessageDirection;
  type: MessageType;
  created_at: string;
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

  // Replaces lastCallId
  lastCallSid: string | null;

  /** @deprecated use lastCallSid instead */
  lastCallId?: string | null;

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
    meta: Record<string, string>;
    status: 'sent' | 'draft' | null;
    direction: 'inbound' | 'outbound';
  } | null;

  lastCall: {
    /** optional legacy DB id; prefer call_sid */
    id?: string;
    call_sid: string; // <-- new
    number_id: string;
    contact_id: string;
    initiated_at: string | null;
    duration: number | null;
    meta: Record<string, string>;
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
  meta: Record<string, string>;
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

export interface FaxForwardLog {
  id: string;
  call_sid: string;
  from_number: string;
  to_number: string;
  forwarded_to_fax_at: Date;
  status: 'forwarded' | 'confirmed';
}

export type MessageType = 'message' | 'fax';

export interface Fax {
  id: string;
  number_id: string;
  contact_id: string;
  direction: 'inbound' | 'outbound';
  status: string;
  initiated_at: Date;
  pages: number | null;
  media_url: string | null;
  fax_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: Date;
}

export interface Usage {
  id: string;
  subscription_id: string;
  user_id: string;
  amount: number;
  type: 'fax' | 'mms' | 'sms' | 'call';
}

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  stripe_price_id: string;
  monthly_price: number;
  created_at: Date;
}

export interface Feature {
  id: string;
  key: string;
  name: string;
  description: string | null;
}

export interface PlanFeature {
  plan_id: string;
  feature_id: string;
  name?: string; // populated when joining with features table
  key?: string; // populated when joining with features table
  description?: string | null;
}

export interface UsageMetric {
  id: string;
  key: string;
  name: string;
  unit: string;
}

export interface PlanUsageLimit {
  id: string;
  plan_id: string;
  metric_id: string;
  included_quantity: number;
  metric_key?: string; // populated from join
  metric_name?: string; // populated from join
  unit?: string; // populated from join
}
