import { PrismaClient } from "@prisma/client"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

function loadEnvFile(envPath: string): void {
  if (!existsSync(envPath)) return
  const content = readFileSync(envPath, "utf8")
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const idx = line.indexOf("=")
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    if (!key) continue
    let value = line.slice(idx + 1).trim()
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

function ensureEnvLoaded(): void {
  if (process.env.DATABASE_URL) return

  const repoRoot = resolve(__dirname, "../../..")
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(repoRoot, ".env"),
    resolve(repoRoot, "apps/api/.env"),
    resolve(repoRoot, "apps/workers/.env"),
  ]
  for (const p of candidates) {
    loadEnvFile(p)
    if (process.env.DATABASE_URL) return
  }
}

ensureEnvLoaded()

const prisma = new PrismaClient()

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

function formatSeedDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function formatSeedDateTime(date: Date): string {
  return `${formatSeedDate(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

function atDaysAgo(days: number, hours: number, minutes: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hours, minutes, 0, 0)
  return formatSeedDateTime(date)
}

function atDaysFromNow(days: number, hours: number, minutes: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(hours, minutes, 0, 0)
  return formatSeedDateTime(date)
}

function dateDaysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(0, 0, 0, 0)
  return formatSeedDate(date)
}

type ChannelType = "olx" | "prom"
type PaymentStatus = "pending" | "paid" | "partial" | "refunded"
type ShippingStatus = "not_shipped" | "shipped" | "delivered" | "returned"
type TemplateCategory = "payment" | "delivery" | "upsell" | "issues" | "custom"
type TemplateScope = "global" | "olx" | "prom"

type BuyerHistory = {
  totalOrders: number
  totalSpent: number
  lastOrderDate?: string
  rating?: number
  previousProducts: string[]
  isRepeatBuyer: boolean
}

type SeedConversation = {
  id: string
  buyerName: string
  buyerPhone?: string
  channelType: ChannelType
  accountId: string
  productId: string
  lastMessage: string
  lastMessageTime: string
  unreadCount: number
  needsReply: boolean
  isPinned: boolean
  isSnoozed: boolean
  snoozedUntil?: string
  isArchived: boolean
  statusId?: string
  tagIds: string[]
  paymentStatus?: PaymentStatus
  shippingStatus?: ShippingStatus
  ttn?: string
  orderAmount?: number
  sellerNote?: string
  followUpAt?: string
  buyerHistory?: BuyerHistory
  isOnline?: boolean
  lastSeen?: string
}

type SeedMessageStatus = "sending" | "sent" | "delivered" | "read" | "error"

type SeedMessage = {
  id: string
  conversationId: string
  direction: "in" | "out"
  text: string
  timestamp: string
  status: SeedMessageStatus
}

type SeedTag = { id: string; name: string; color: string; icon: string }
type SeedStatus = { id: string; name: string; color: string; icon: string }

type SeedTemplate = { id: string; title: string; text: string; scope: TemplateScope; category: TemplateCategory }

type SeedAccount = { id: string; channelType: ChannelType; alias: string; active: boolean }

type SeedProduct = {
  id: string
  name: string
  price: number
  currency: string
  description: string
  imageUrl: string
  channelType: ChannelType
  accountId: string
  externalUrl: string
  externalId: string
}

const seedTags: SeedTag[] = [
  { id: "tag-1", name: "VIP", color: "45 93% 47%", icon: "⭐" },
  { id: "tag-2", name: "Повернення", color: "0 84% 60%", icon: "🔄" },
  { id: "tag-3", name: "Оптовик", color: "262 83% 58%", icon: "📦" },
  { id: "tag-4", name: "Постійний", color: "142 71% 45%", icon: "💚" },
  { id: "tag-5", name: "Проблемний", color: "25 95% 53%", icon: "⚠️" },
  { id: "tag-6", name: "Нова Пошта", color: "0 72% 51%", icon: "📮" },
  { id: "tag-7", name: "Укрпошта", color: "217 91% 60%", icon: "✉️" },
]

const seedStatuses: SeedStatus[] = [
  { id: "st-1", name: "Новий", color: "217 91% 60%", icon: "🆕" },
  { id: "st-2", name: "В обробці", color: "45 93% 47%", icon: "⏳" },
  { id: "st-3", name: "Очікує оплати", color: "25 95% 53%", icon: "💳" },
  { id: "st-4", name: "Відправлено", color: "142 71% 45%", icon: "🚚" },
  { id: "st-5", name: "Завершено", color: "142 71% 45%", icon: "✅" },
  { id: "st-6", name: "Скасовано", color: "0 84% 60%", icon: "❌" },
]

const seedAccounts: SeedAccount[] = [
  { id: "acc-olx-1", channelType: "olx", alias: "Магазин Техніка", active: true },
  { id: "acc-olx-2", channelType: "olx", alias: "Побутова техніка", active: true },
  { id: "acc-prom-1", channelType: "prom", alias: "ТехноМаркет", active: true },
  { id: "acc-prom-2", channelType: "prom", alias: "ГаджетШоп", active: false },
]

const seedProducts: SeedProduct[] = [
  {
    id: "prod-1",
    name: "iPhone 15 Pro Max 256GB",
    price: 52999,
    currency: "грн",
    description: "Новий Apple iPhone 15 Pro Max, 256GB, колір Титановий синій. Гарантія 12 місяців.",
    imageUrl: "https://placehold.co/400x400/1a1a2e/e0e0e0?text=iPhone+15",
    channelType: "olx",
    accountId: "acc-olx-1",
    externalUrl: "https://olx.ua/item/123",
    externalId: "OLX-123456",
  },
  {
    id: "prod-2",
    name: "Samsung Galaxy S24 Ultra",
    price: 47999,
    currency: "грн",
    description: "Samsung Galaxy S24 Ultra 12/256GB Titanium Black. Офіційна гарантія.",
    imageUrl: "https://placehold.co/400x400/1a1a2e/e0e0e0?text=Galaxy+S24",
    channelType: "olx",
    accountId: "acc-olx-1",
    externalUrl: "https://olx.ua/item/124",
    externalId: "OLX-123457",
  },
  {
    id: "prod-3",
    name: "MacBook Air M3 15\"",
    price: 59999,
    currency: "грн",
    description: "Apple MacBook Air 15 M3 8/256GB Midnight. Нова модель 2024 року.",
    imageUrl: "https://placehold.co/400x400/1a1a2e/e0e0e0?text=MacBook+Air",
    channelType: "prom",
    accountId: "acc-prom-1",
    externalUrl: "https://prom.ua/item/125",
    externalId: "PROM-789012",
  },
  {
    id: "prod-4",
    name: "AirPods Pro 2 USB-C",
    price: 9499,
    currency: "грн",
    description: "Apple AirPods Pro 2-го покоління з USB-C. Активне шумоподавлення.",
    imageUrl: "https://placehold.co/400x400/1a1a2e/e0e0e0?text=AirPods",
    channelType: "olx",
    accountId: "acc-olx-2",
    externalUrl: "https://olx.ua/item/126",
    externalId: "OLX-123458",
  },
  {
    id: "prod-5",
    name: "Dyson V15 Detect",
    price: 28999,
    currency: "грн",
    description: "Бездротовий пилосос Dyson V15 Detect Absolute. Лазерне виявлення пилу.",
    imageUrl: "https://placehold.co/400x400/1a1a2e/e0e0e0?text=Dyson+V15",
    channelType: "prom",
    accountId: "acc-prom-1",
    externalUrl: "https://prom.ua/item/127",
    externalId: "PROM-789013",
  },
  {
    id: "prod-6",
    name: "Sony WH-1000XM5",
    price: 12999,
    currency: "грн",
    description: "Навушники Sony WH-1000XM5 з активним шумоподавленням. Чорний колір.",
    imageUrl: "https://placehold.co/400x400/1a1a2e/e0e0e0?text=Sony+XM5",
    channelType: "olx",
    accountId: "acc-olx-1",
    externalUrl: "https://olx.ua/item/128",
    externalId: "OLX-123459",
  },
  {
    id: "prod-7",
    name: "iPad Pro M4 11\"",
    price: 49999,
    currency: "грн",
    description: "Apple iPad Pro 11 M4 256GB Wi-Fi. OLED дисплей.",
    imageUrl: "https://placehold.co/400x400/1a1a2e/e0e0e0?text=iPad+Pro",
    channelType: "prom",
    accountId: "acc-prom-1",
    externalUrl: "https://prom.ua/item/129",
    externalId: "PROM-789014",
  },
  {
    id: "prod-8",
    name: "Робот-пилосос Roborock S8 Pro",
    price: 22999,
    currency: "грн",
    description: "Roborock S8 Pro Ultra з базою самоочищення. Розумна навігація.",
    imageUrl: "https://placehold.co/400x400/1a1a2e/e0e0e0?text=Roborock",
    channelType: "olx",
    accountId: "acc-olx-2",
    externalUrl: "https://olx.ua/item/130",
    externalId: "OLX-123460",
  },
]

const seedConversations: SeedConversation[] = [
  {
    id: "conv-1",
    buyerName: "Олександр Петренко",
    buyerPhone: "+380671234567",
    channelType: "olx",
    accountId: "acc-olx-1",
    productId: "prod-1",
    lastMessage: "Добре, оплачу зараз. Скиньте реквізити.",
    lastMessageTime: atDaysAgo(0, 14, 35),
    unreadCount: 2,
    needsReply: true,
    isPinned: true,
    isSnoozed: false,
    isArchived: false,
    statusId: "st-3",
    tagIds: ["tag-1", "tag-4"],
    paymentStatus: "pending",
    shippingStatus: "not_shipped",
    orderAmount: 53799,
    isOnline: true,
    buyerHistory: {
      totalOrders: 3,
      totalSpent: 125000,
      lastOrderDate: dateDaysAgo(28),
      rating: 5,
      previousProducts: ["prod-2", "prod-4"],
      isRepeatBuyer: true,
    },
  },
  {
    id: "conv-2",
    buyerName: "Марія Коваленко",
    channelType: "prom",
    accountId: "acc-prom-1",
    productId: "prod-3",
    lastMessage: "А є в кольорі Starlight?",
    lastMessageTime: atDaysAgo(0, 14, 20),
    unreadCount: 1,
    needsReply: true,
    isPinned: false,
    isSnoozed: false,
    isArchived: false,
    statusId: "st-1",
    tagIds: [],
    isOnline: true,
    lastSeen: atDaysAgo(0, 14, 18),
    buyerHistory: {
      totalOrders: 0,
      totalSpent: 0,
      previousProducts: [],
      isRepeatBuyer: false,
    },
  },
  {
    id: "conv-3",
    buyerName: "Дмитро Шевченко",
    buyerPhone: "+380509876543",
    channelType: "olx",
    accountId: "acc-olx-1",
    productId: "prod-6",
    lastMessage: "Дякую, чекаю на ТТН",
    lastMessageTime: atDaysAgo(0, 13, 45),
    unreadCount: 0,
    needsReply: false,
    isPinned: true,
    isSnoozed: false,
    isArchived: false,
    statusId: "st-4",
    tagIds: ["tag-6"],
    paymentStatus: "paid",
    shippingStatus: "shipped",
    ttn: "20450000123456",
    orderAmount: 12999,
    isOnline: false,
    lastSeen: atDaysAgo(0, 13, 50),
    sellerNote: "Повторний клієнт, надавати знижку 5%",
    buyerHistory: {
      totalOrders: 5,
      totalSpent: 89000,
      lastOrderDate: dateDaysAgo(11),
      rating: 5,
      previousProducts: ["prod-1", "prod-4", "prod-8"],
      isRepeatBuyer: true,
    },
  },
  {
    id: "conv-4",
    buyerName: "Анна Бондаренко",
    channelType: "prom",
    accountId: "acc-prom-1",
    productId: "prod-5",
    lastMessage: "Можна забрати самовивозом з Києва?",
    lastMessageTime: atDaysAgo(0, 12, 10),
    unreadCount: 1,
    needsReply: true,
    isPinned: false,
    isSnoozed: false,
    isArchived: false,
    statusId: "st-1",
    tagIds: ["tag-3"],
    isOnline: false,
    lastSeen: atDaysAgo(0, 12, 15),
    buyerHistory: {
      totalOrders: 1,
      totalSpent: 28999,
      lastOrderDate: dateDaysAgo(84),
      rating: 4,
      previousProducts: ["prod-5"],
      isRepeatBuyer: true,
    },
  },
  {
    id: "conv-5",
    buyerName: "Ігор Мельник",
    channelType: "olx",
    accountId: "acc-olx-2",
    productId: "prod-4",
    lastMessage: "Вже 3 дні як не працює правий навушник!",
    lastMessageTime: atDaysAgo(0, 11, 30),
    unreadCount: 3,
    needsReply: true,
    isPinned: false,
    isSnoozed: false,
    isArchived: false,
    statusId: "st-2",
    tagIds: ["tag-2", "tag-5"],
    paymentStatus: "paid",
    shippingStatus: "delivered",
    orderAmount: 9499,
    followUpAt: atDaysFromNow(1, 10, 0),
    sellerNote: "⚠️ Гарантійний випадок. Перевірити серійний номер.",
    isOnline: true,
    buyerHistory: {
      totalOrders: 1,
      totalSpent: 9499,
      lastOrderDate: dateDaysAgo(3),
      rating: 2,
      previousProducts: [],
      isRepeatBuyer: false,
    },
  },
  {
    id: "conv-6",
    buyerName: "Наталія Кравченко",
    channelType: "prom",
    accountId: "acc-prom-1",
    productId: "prod-7",
    lastMessage: "Оплата пройшла, чекаю відправку",
    lastMessageTime: atDaysAgo(0, 10, 15),
    unreadCount: 0,
    needsReply: false,
    isPinned: false,
    isSnoozed: false,
    isArchived: false,
    statusId: "st-4",
    tagIds: ["tag-4"],
    paymentStatus: "paid",
    shippingStatus: "not_shipped",
    orderAmount: 49999,
    isOnline: false,
    lastSeen: atDaysAgo(0, 10, 20),
    followUpAt: atDaysAgo(0, 16, 0),
    buyerHistory: {
      totalOrders: 2,
      totalSpent: 78998,
      lastOrderDate: dateDaysAgo(69),
      rating: 5,
      previousProducts: ["prod-3"],
      isRepeatBuyer: true,
    },
  },
  {
    id: "conv-7",
    buyerName: "Василь Ткаченко",
    channelType: "olx",
    accountId: "acc-olx-1",
    productId: "prod-2",
    lastMessage: "Скажіть, а trade-in можливий?",
    lastMessageTime: atDaysAgo(0, 9, 45),
    unreadCount: 1,
    needsReply: true,
    isPinned: false,
    isSnoozed: true,
    snoozedUntil: atDaysAgo(0, 18, 0),
    isArchived: false,
    statusId: "st-1",
    tagIds: [],
    isOnline: false,
    lastSeen: atDaysAgo(0, 9, 50),
    buyerHistory: {
      totalOrders: 0,
      totalSpent: 0,
      previousProducts: [],
      isRepeatBuyer: false,
    },
  },
  {
    id: "conv-8",
    buyerName: "Олена Сидоренко",
    buyerPhone: "+380631112233",
    channelType: "olx",
    accountId: "acc-olx-2",
    productId: "prod-8",
    lastMessage: "Добре, замовляю! Нова пошта відділення №5 Львів",
    lastMessageTime: atDaysAgo(1, 20, 30),
    unreadCount: 0,
    needsReply: false,
    isPinned: false,
    isSnoozed: false,
    isArchived: false,
    statusId: "st-3",
    tagIds: ["tag-6"],
    paymentStatus: "paid",
    shippingStatus: "not_shipped",
    orderAmount: 22999,
    isOnline: false,
    lastSeen: atDaysAgo(1, 20, 35),
    buyerHistory: {
      totalOrders: 1,
      totalSpent: 22999,
      lastOrderDate: dateDaysAgo(1),
      rating: 4,
      previousProducts: [],
      isRepeatBuyer: false,
    },
  },
  {
    id: "conv-9",
    buyerName: "Андрій Лисенко",
    channelType: "prom",
    accountId: "acc-prom-1",
    productId: "prod-3",
    lastMessage: "Все працює ідеально, дякую!",
    lastMessageTime: atDaysAgo(1, 16, 0),
    unreadCount: 0,
    needsReply: false,
    isPinned: false,
    isSnoozed: false,
    isArchived: false,
    statusId: "st-5",
    tagIds: ["tag-4"],
    paymentStatus: "paid",
    shippingStatus: "delivered",
    orderAmount: 59999,
    isOnline: false,
    lastSeen: atDaysAgo(1, 16, 5),
    buyerHistory: {
      totalOrders: 2,
      totalSpent: 108998,
      lastOrderDate: dateDaysAgo(7),
      rating: 5,
      previousProducts: ["prod-1"],
      isRepeatBuyer: true,
    },
  },
  {
    id: "conv-10",
    buyerName: "Тетяна Романенко",
    channelType: "olx",
    accountId: "acc-olx-1",
    productId: "prod-1",
    lastMessage: "Чи є знижка при покупці 2 штук?",
    lastMessageTime: atDaysAgo(1, 14, 20),
    unreadCount: 1,
    needsReply: true,
    isPinned: false,
    isSnoozed: true,
    snoozedUntil: atDaysFromNow(1, 9, 0),
    isArchived: false,
    statusId: "st-1",
    tagIds: ["tag-3"],
    isOnline: false,
    lastSeen: atDaysAgo(1, 14, 25),
    buyerHistory: {
      totalOrders: 0,
      totalSpent: 0,
      previousProducts: [],
      isRepeatBuyer: false,
    },
  },
  {
    id: "conv-11",
    buyerName: "Юрій Козлов",
    channelType: "prom",
    accountId: "acc-prom-1",
    productId: "prod-5",
    lastMessage: "Замовлення скасовую, знайшов дешевше",
    lastMessageTime: atDaysAgo(2, 18, 45),
    unreadCount: 0,
    needsReply: false,
    isPinned: false,
    isSnoozed: false,
    isArchived: true,
    statusId: "st-6",
    tagIds: [],
    paymentStatus: "refunded",
    shippingStatus: "not_shipped",
    orderAmount: 28999,
    buyerHistory: {
      totalOrders: 0,
      totalSpent: 0,
      previousProducts: [],
      isRepeatBuyer: false,
    },
  },
  {
    id: "conv-12",
    buyerName: "Катерина Мороз",
    channelType: "olx",
    accountId: "acc-olx-1",
    productId: "prod-6",
    lastMessage: "Отримала, все ок. Дякую!",
    lastMessageTime: atDaysAgo(2, 12, 0),
    unreadCount: 0,
    needsReply: false,
    isPinned: false,
    isSnoozed: false,
    isArchived: true,
    statusId: "st-5",
    tagIds: ["tag-4"],
    paymentStatus: "paid",
    shippingStatus: "delivered",
    orderAmount: 12999,
    buyerHistory: {
      totalOrders: 1,
      totalSpent: 12999,
      lastOrderDate: dateDaysAgo(2),
      rating: 5,
      previousProducts: [],
      isRepeatBuyer: false,
    },
  },
  {
    id: "conv-13",
    buyerName: "Сергій Павленко",
    channelType: "olx",
    accountId: "acc-olx-2",
    productId: "prod-8",
    lastMessage: "Коли буде знову в наявності?",
    lastMessageTime: atDaysAgo(2, 9, 30),
    unreadCount: 0,
    needsReply: false,
    isPinned: false,
    isSnoozed: false,
    isArchived: true,
    statusId: "st-6",
    tagIds: [],
    buyerHistory: {
      totalOrders: 0,
      totalSpent: 0,
      previousProducts: [],
      isRepeatBuyer: false,
    },
  },
  {
    id: "conv-14",
    buyerName: "Вікторія Гончаренко",
    channelType: "prom",
    accountId: "acc-prom-1",
    productId: "prod-7",
    lastMessage: "Підкажіть, чи підходить Apple Pencil 2?",
    lastMessageTime: atDaysAgo(0, 8, 15),
    unreadCount: 1,
    needsReply: true,
    isPinned: true,
    isSnoozed: false,
    isArchived: false,
    statusId: "st-2",
    tagIds: ["tag-1"],
    isOnline: true,
    buyerHistory: {
      totalOrders: 1,
      totalSpent: 49999,
      lastOrderDate: dateDaysAgo(115),
      rating: 4,
      previousProducts: ["prod-7"],
      isRepeatBuyer: true,
    },
  },
  {
    id: "conv-15",
    buyerName: "Buyer Микола Захарченко",
    channelType: "olx",
    accountId: "acc-olx-1",
    productId: "prod-2",
    lastMessage: "Надішліть фото реального телефону, будь ласка",
    lastMessageTime: atDaysAgo(1, 22, 0),
    unreadCount: 0,
    needsReply: false,
    isPinned: false,
    isSnoozed: false,
    isArchived: false,
    statusId: "st-2",
    tagIds: [],
    isOnline: false,
    lastSeen: atDaysAgo(1, 22, 5),
    buyerHistory: {
      totalOrders: 0,
      totalSpent: 0,
      previousProducts: [],
      isRepeatBuyer: false,
    },
  },
]

const seedMessages: Record<string, SeedMessage[]> = {
  "conv-1": [
    {
      id: "m1-1",
      conversationId: "conv-1",
      direction: "in",
      text: "Доброго дня! Цікавить iPhone 15 Pro Max. Є в наявності?",
      timestamp: atDaysAgo(0, 13, 0),
      status: "read",
    },
    {
      id: "m1-2",
      conversationId: "conv-1",
      direction: "out",
      text: "Вітаю, Олександре! Так, є в наявності. Колір Титановий синій, 256GB. Ціна 52 999 грн.",
      timestamp: atDaysAgo(0, 13, 5),
      status: "read",
    },
    {
      id: "m1-3",
      conversationId: "conv-1",
      direction: "in",
      text: "Супер! А можна трохи знижку? Беру одразу з чохлом.",
      timestamp: atDaysAgo(0, 13, 15),
      status: "read",
    },
    {
      id: "m1-4",
      conversationId: "conv-1",
      direction: "out",
      text: "Можу запропонувати чохол зі знижкою 20%. Тоді разом 53 799 грн замість 54 498 грн.",
      timestamp: atDaysAgo(0, 13, 20),
      status: "read",
    },
    {
      id: "m1-5",
      conversationId: "conv-1",
      direction: "in",
      text: "Добре, оплачу зараз. Скиньте реквізити.",
      timestamp: atDaysAgo(0, 14, 35),
      status: "delivered",
    },
  ],
  "conv-2": [
    {
      id: "m2-1",
      conversationId: "conv-2",
      direction: "in",
      text: "Incoming: Доброго дня, цікавить MacBook Air M3 15\"",
      timestamp: atDaysAgo(0, 14, 0),
      status: "read",
    },
    {
      id: "m2-2",
      conversationId: "conv-2",
      direction: "out",
      text: "Вітаю! Так, є в наявності. Midnight, 8/256GB — 59 999 грн.",
      timestamp: atDaysAgo(0, 14, 5),
      status: "read",
    },
    {
      id: "m2-3",
      conversationId: "conv-2",
      direction: "in",
      text: "А є в кольорі Starlight?",
      timestamp: atDaysAgo(0, 14, 20),
      status: "delivered",
    },
  ],
  "conv-3": [
    {
      id: "m3-1",
      conversationId: "conv-3",
      direction: "in",
      text: "Привіт! Замовляв навушники Sony, коли відправите?",
      timestamp: atDaysAgo(0, 12, 0),
      status: "read",
    },
    {
      id: "m3-2",
      conversationId: "conv-3",
      direction: "out",
      text: "Доброго дня! Відправили сьогодні. ТТН: 20450000123456. Очікуйте завтра-післязавтра.",
      timestamp: atDaysAgo(0, 13, 30),
      status: "read",
    },
    {
      id: "m3-3",
      conversationId: "conv-3",
      direction: "in",
      text: "Дякую, чекаю на ТТН",
      timestamp: atDaysAgo(0, 13, 45),
      status: "read",
    },
  ],
  "conv-5": [
    {
      id: "m5-1",
      conversationId: "conv-5",
      direction: "out",
      text: "Доброго дня! Дякуємо за покупку AirPods Pro 2.",
      timestamp: atDaysAgo(3, 10, 0),
      status: "read",
    },
    {
      id: "m5-2",
      conversationId: "conv-5",
      direction: "in",
      text: "Привіт, у мене проблема з навушниками",
      timestamp: atDaysAgo(0, 11, 0),
      status: "read",
    },
    {
      id: "m5-3",
      conversationId: "conv-5",
      direction: "in",
      text: "Правий навушник перестав працювати",
      timestamp: atDaysAgo(0, 11, 5),
      status: "read",
    },
    {
      id: "m5-4",
      conversationId: "conv-5",
      direction: "in",
      text: "Вже 3 дні як не працює правий навушник!",
      timestamp: atDaysAgo(0, 11, 30),
      status: "delivered",
    },
  ],
  "conv-14": [
    {
      id: "m14-1",
      conversationId: "conv-14",
      direction: "in",
      text: "Доброго дня! Хочу купити iPad Pro M4 11\"",
      timestamp: atDaysAgo(0, 7, 30),
      status: "read",
    },
    {
      id: "m14-2",
      conversationId: "conv-14",
      direction: "out",
      text: "Вітаю! Чудовий вибір. Є в наявності — 49 999 грн. Wi-Fi версія.",
      timestamp: atDaysAgo(0, 7, 45),
      status: "read",
    },
    {
      id: "m14-3",
      conversationId: "conv-14",
      direction: "in",
      text: "Підкажіть, чи підходить Apple Pencil 2?",
      timestamp: atDaysAgo(0, 8, 15),
      status: "delivered",
    },
  ],
}

function ensureSeedMessages(): Record<string, SeedMessage[]> {
  const map: Record<string, SeedMessage[]> = { ...seedMessages }
  for (const c of seedConversations) {
    if (map[c.id]) continue
    map[c.id] = [
      {
        id: `${c.id}-auto-1`,
        conversationId: c.id,
        direction: "in",
        text: c.lastMessage,
        timestamp: c.lastMessageTime,
        status: "read",
      },
    ]
  }
  return map
}

const seedTemplates: SeedTemplate[] = [
  {
    id: "tpl-1",
    title: "Підтвердження замовлення",
    text: "Дякуємо за замовлення! Ваше замовлення прийнято в обробку. Очікуйте підтвердження протягом 30 хвилин.",
    scope: "global",
    category: "payment",
  },
  {
    id: "tpl-2",
    title: "Реквізити для оплати",
    text: "Для оплати використовуйте реквізити:\nКарта: 5168 XXXX XXXX XXXX\nОтримувач: ФОП Іваненко І.І.\nСума: {сума} грн\nПісля оплати надішліть скріншот.",
    scope: "global",
    category: "payment",
  },
  {
    id: "tpl-3",
    title: "Інфо про доставку",
    text: "Доставка здійснюється Новою Поштою 1-3 дні. Вартість доставки за тарифами перевізника. Безкоштовна доставка при замовленні від 2000 грн.",
    scope: "global",
    category: "delivery",
  },
  {
    id: "tpl-4",
    title: "ТТН відправлено",
    text: "Ваше замовлення відправлено! 🚚\nТТН: {номер}\nОрієнтовна дата доставки: {дата}\nВідстежити: https://novaposhta.ua/tracking",
    scope: "global",
    category: "delivery",
  },
  {
    id: "tpl-5",
    title: "Допродаж — аксесуар",
    text: "До вашого товару рекомендуємо чохол/захисне скло зі знижкою 15%! Бажаєте додати до замовлення?",
    scope: "olx",
    category: "upsell",
  },
  {
    id: "tpl-6",
    title: "Товар закінчився",
    text: "На жаль, цей товар наразі закінчився на складі. Очікуємо поставку через 3-5 днів. Бажаєте, щоб ми повідомили про наявність?",
    scope: "global",
    category: "issues",
  },
  {
    id: "tpl-7",
    title: "Гарантійний випадок",
    text: "Для гарантійного обслуговування, будь ласка, надішліть:\n1. Фото чеку\n2. Фото дефекту\n3. Серійний номер пристрою\nМи розглянемо вашу заявку протягом 24 годин.",
    scope: "prom",
    category: "issues",
  },
  {
    id: "tpl-8",
    title: "Привітання OLX",
    text: "Вітаю! Дякую за інтерес до товару на OLX. Чим можу допомогти?",
    scope: "olx",
    category: "custom",
  },
  {
    id: "tpl-9",
    title: "Привітання Prom",
    text: "Доброго дня! Дякуємо за звернення до нашого магазину на Prom.ua. Готові відповісти на ваші питання.",
    scope: "prom",
    category: "custom",
  },
]

function mapMessageDeliveryStatus(status: SeedMessageStatus): {
  deliveryStatus: "SENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED"
  deliveredAt?: Date
  readAt?: Date
  failedAt?: Date
} {
  switch (status) {
    case "sending":
      return { deliveryStatus: "SENDING" }
    case "sent":
      return { deliveryStatus: "SENT" }
    case "delivered":
      return { deliveryStatus: "DELIVERED" }
    case "read":
      return { deliveryStatus: "READ" }
    case "error":
      return { deliveryStatus: "FAILED" }
    default:
      return { deliveryStatus: "SENT" }
  }
}

function maxIso(values: string[]): string | null {
  const times = values.map((s) => new Date(s).getTime()).filter((n) => Number.isFinite(n))
  if (times.length === 0) return null
  return new Date(Math.max(...times)).toISOString()
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run seed in production")
  }

  const workspace = await prisma.workspace.upsert({
    where: { id: "workspace-main" },
    update: {},
    create: {
      id: "workspace-main",
      name: "Main workspace",
    },
  })

  const user = await prisma.user.upsert({
    where: { id: "user-main" },
    update: {},
    create: {
      id: "user-main",
      defaultWorkspaceId: workspace.id,
      displayName: "Prototype User",
    },
  })

  const demoEmail = "demo@omnichat.local"
  await prisma.identity.upsert({
    where: {
      provider_providerAccountId: {
        provider: "EMAIL",
        providerAccountId: demoEmail,
      },
    },
    update: {
      userId: user.id,
      email: demoEmail,
      emailVerifiedAt: new Date(),
    },
    create: {
      provider: "EMAIL",
      providerAccountId: demoEmail,
      email: demoEmail,
      emailVerifiedAt: new Date(),
      userId: user.id,
    },
  })

  await prisma.membership.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: "OWNER",
    },
  })

  // Ensure deterministic local/dev and repeatable e2e runs:
  // wipe seeded workspace data (but keep workspace + user + membership).
  await prisma.$transaction(async (tx) => {
    // Delete channel accounts first: cascades conversations -> messages -> attachments -> shortLinks.
    await tx.channelAccount.deleteMany({ where: { workspaceId: workspace.id } })

    await tx.template.deleteMany({ where: { workspaceId: workspace.id } })
    await tx.templateCategory.deleteMany({ where: { workspaceId: workspace.id } })

    await tx.tag.deleteMany({ where: { workspaceId: workspace.id } })
    await tx.status.deleteMany({ where: { workspaceId: workspace.id } })

    await tx.devicePushToken.deleteMany({ where: { workspaceId: workspace.id } })
    await tx.outboxEvent.deleteMany({ where: { workspaceId: workspace.id } })
    await tx.workspaceSettings.deleteMany({ where: { workspaceId: workspace.id } })
    await tx.workspaceDailyRollup.deleteMany({ where: { workspaceId: workspace.id } })
  })

  await prisma.workspaceSettings.create({
    data: {
      workspaceId: workspace.id,
      autoArchiveDays: 7,
      openContextExternalDirect: false,
      pushNewMessageEnabled: true,
      pushSendErrorEnabled: true,
      pushSnoozeEnabled: false,
      pushSyncErrorEnabled: false,
      pushExpiryEnabled: false,
    },
  })

  // Channel accounts (prototype mocks)
  for (const acc of seedAccounts) {
    await prisma.channelAccount.create({
      data: {
        id: acc.id,
        workspaceId: workspace.id,
        channel: acc.channelType === "prom" ? "PROM" : "OLX",
        alias: acc.alias,
        externalAccountId: acc.id,
        authType: "TOKEN",
        authDataEncrypted: "encrypted-placeholder",
        isEnabled: acc.active,
      },
    })
  }

  await prisma.tag.createMany({
    data: seedTags.map((t) => ({
      id: t.id,
      workspaceId: workspace.id,
      name: t.name,
      color: t.color,
      icon: t.icon,
      isSystem: false,
    })),
    skipDuplicates: true,
  })

  await prisma.status.createMany({
    data: seedStatuses.map((s, idx) => ({
      id: s.id,
      workspaceId: workspace.id,
      name: s.name,
      color: s.color,
      icon: s.icon,
      sortOrder: idx + 1,
      isSystem: false,
    })),
    skipDuplicates: true,
  })

  const templateCategories: { id: string; name: TemplateCategory; sortOrder: number }[] = [
    { id: "tplcat-payment", name: "payment", sortOrder: 1 },
    { id: "tplcat-delivery", name: "delivery", sortOrder: 2 },
    { id: "tplcat-upsell", name: "upsell", sortOrder: 3 },
    { id: "tplcat-issues", name: "issues", sortOrder: 4 },
    { id: "tplcat-custom", name: "custom", sortOrder: 5 },
  ]

  await prisma.templateCategory.createMany({
    data: templateCategories.map((c) => ({
      id: c.id,
      workspaceId: workspace.id,
      name: c.name,
      sortOrder: c.sortOrder,
    })),
    skipDuplicates: true,
  })

  const categoryIdByName = new Map<TemplateCategory, string>(templateCategories.map((c) => [c.name, c.id]))

  await prisma.template.createMany({
    data: seedTemplates.map((t) => ({
      id: t.id,
      workspaceId: workspace.id,
      scope: t.scope === "global" ? "GLOBAL" : "CHANNEL",
      channel: t.scope === "olx" ? "OLX" : t.scope === "prom" ? "PROM" : null,
      categoryId: categoryIdByName.get(t.category) ?? null,
      title: t.title,
      content: t.text,
      usageCount: 0,
    })),
    skipDuplicates: true,
  })

  const productsById = new Map(seedProducts.map((p) => [p.id, p]))
  const messagesByConvId = ensureSeedMessages()

  for (const c of seedConversations) {
    const product = productsById.get(c.productId) ?? null
    const msgs = messagesByConvId[c.id] ?? []

    const lastIncomingAt = maxIso(msgs.filter((m) => m.direction === "in").map((m) => m.timestamp))
    const lastSellerReplyAt = maxIso(msgs.filter((m) => m.direction === "out").map((m) => m.timestamp))

    await prisma.conversation.create({
      data: {
        id: c.id,
        workspaceId: workspace.id,
        channelAccountId: c.accountId,
        channel: c.channelType === "prom" ? "PROM" : "OLX",
        externalConversationId: `ext-${c.id}`,
        externalBuyerId: `ext-buyer-${c.id}`,
        buyerDisplayName: c.buyerName,
        buyerPhone: c.buyerPhone ?? null,
        buyerIsOnline: c.isOnline ?? false,
        buyerLastSeenAt: c.lastSeen ? new Date(c.lastSeen) : null,

        needsReply: c.needsReply,
        isArchived: c.isArchived,
        archivedAt: c.isArchived ? new Date(c.lastMessageTime) : null,
        snoozedUntil: c.snoozedUntil ? new Date(c.snoozedUntil) : null,
        isPinnedInAll: c.isPinned,
        pinnedAt: c.isPinned ? new Date(c.lastMessageTime) : null,

        lastActivityAt: new Date(c.lastMessageTime),
        lastIncomingAt: lastIncomingAt ? new Date(lastIncomingAt) : null,
        lastSellerReplyAt: lastSellerReplyAt ? new Date(lastSellerReplyAt) : null,

        statusId: c.statusId ?? null,

        paymentStatus: c.paymentStatus ?? null,
        shippingStatus: c.shippingStatus ?? null,
        ttn: c.ttn ?? null,
        orderAmount: c.orderAmount ?? null,
        sellerNote: c.sellerNote ?? null,
        followUpAt: c.followUpAt ? new Date(c.followUpAt) : null,
        buyerHistoryJson: c.buyerHistory ?? null,

        contextType: product ? "LISTING" : null,
        contextTitle: product?.name ?? null,
        contextPrice: product?.price ?? null,
        contextCurrency: product?.currency ?? null,
        contextThumbUrl: product?.imageUrl ?? null,
        contextExternalUrl: product?.externalUrl ?? null,
        contextExternalId: product?.externalId ?? null,
      },
    })
  }

  await prisma.conversationTag.createMany({
    data: seedConversations.flatMap((c) => c.tagIds.map((tagId) => ({ conversationId: c.id, tagId }))),
    skipDuplicates: true,
  })

  const messageRows = Object.values(messagesByConvId)
    .flat()
    .map((m) => {
      const at = new Date(m.timestamp)
      const mapped = mapMessageDeliveryStatus(m.status)
      const common: any = {
        id: m.id,
        workspaceId: workspace.id,
        conversationId: m.conversationId,
        direction: m.direction === "out" ? "OUT" : "IN",
        text: m.text,
        createdAt: at,
        sentAt: at,
        deliveryStatus: mapped.deliveryStatus,
      }

      if (m.direction === "in") common.externalMessageId = m.id
      else common.clientMessageId = m.id

      if (mapped.deliveryStatus === "DELIVERED") common.deliveredAt = at
      if (mapped.deliveryStatus === "READ") common.readAt = at
      if (mapped.deliveryStatus === "FAILED") {
        common.failedAt = at
        common.errorCode = "SEED"
        common.errorMessage = "Seeded failed delivery"
      }

      return common
    })

  // Insert messages after conversations exist.
  for (const row of messageRows) {
    await prisma.message.create({ data: row })
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error("Seed failed", error)
    await prisma.$disconnect()
    process.exit(1)
  })
