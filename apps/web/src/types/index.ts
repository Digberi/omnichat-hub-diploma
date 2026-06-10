export type ChannelType = 'olx' | 'prom' | 'rozetka';
export type PaymentStatus = 'pending' | 'paid' | 'partial' | 'refunded';
export type ShippingStatus = 'not_shipped' | 'shipped' | 'delivered' | 'returned';

export interface Channel {
  id: string;
  type: ChannelType;
  name: string;
  color: string;
  icon: string;
  connected: boolean;
}

export interface Account {
  id: string;
  channelId: string;
  alias: string;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  currency: string;
  description: string;
  imageUrl: string;
  channelType: ChannelType;
  accountId: string;
  externalUrl: string;
  externalId: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export interface Status {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'error';
export type MessageDirection = 'in' | 'out';
export type AttachmentType = 'image' | 'video' | 'document';

export interface Attachment {
  id: string;
  type: AttachmentType;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  // Short-link landing URL (relative or absolute). Created on demand.
  url?: string;
  // 7-day presigned download URL for IMAGE / VIDEO kinds — populated by
  // the API at list time so the bubble can render <img> / <video> inline
  // without a per-bubble round-trip. Null for DOCUMENT.
  previewUrl?: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  text: string;
  timestamp: string;
  status: MessageStatus;
  attachments?: Attachment[];
  replyTo?: string;
  metadata?: unknown;
  clientMessageId?: string;
}

export interface BuyerHistory {
  totalOrders: number;
  totalSpent: number;
  lastOrderDate?: string;
  rating?: number; // 1-5
  previousProducts: string[];
  isRepeatBuyer: boolean;
}

export interface Conversation {
  id: string;
  buyerName: string;
  buyerAvatar?: string;
  buyerPhone?: string;
  channelType: ChannelType;
  accountId: string;
  accountAlias?: string;
  // Context (listing/product/order)
  contextType?: string;
  contextTitle?: string;
  contextPrice?: number;
  contextCurrency?: string;
  contextThumbUrl?: string;
  contextExternalUrl?: string;
  contextExternalId?: string;
  contextStatusId?: string;
  contextStatusName?: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  needsReply: boolean;
  isPinned: boolean;
  isSnoozed: boolean;
  snoozedUntil?: string;
  isArchived: boolean;
  statusId?: string;
  tagIds: string[];
  // Seller features
  paymentStatus?: PaymentStatus;
  shippingStatus?: ShippingStatus;
  ttn?: string;
  orderAmount?: number;
  sellerNote?: string;
  followUpAt?: string;
  buyerHistory?: BuyerHistory;
  isOnline?: boolean;
  lastSeen?: string;
}

export type TemplateScope = 'global' | 'olx' | 'prom';
export type TemplateCategory = 'payment' | 'delivery' | 'upsell' | 'issues' | 'custom';

export interface Template {
  id: string;
  title: string;
  text: string;
  scope: TemplateScope;
  category: TemplateCategory;
  categoryId?: string;
  categoryName?: string;
}

export interface QuickShortcut {
  id: string;
  label: string;
  text: string;
  icon: string;
}

export interface NotificationSettings {
  messages: boolean;
  errors: boolean;
  reminders: boolean;
  system: boolean;
  // Per-channel delivery toggles for inbound message events:
  //   sound = WebAudio beep
  //   osPopup = Notification API banner (gated by browser permission)
  //   inAppToast = Sonner toast inside the tab
  // All default to true; the master `messages` switch above gates the
  // whole pipeline (off = neither sound nor popup nor toast fire).
  sound: boolean;
  osPopup: boolean;
  inAppToast: boolean;
}

export interface AppSettings {
  darkMode: boolean;
  autoArchiveDays: number;
  openOnPlatform: boolean;
  notifications: NotificationSettings;
  density: 'compact' | 'comfortable';
  autoReplyEnabled: boolean;
  autoReplyText: string;
}
