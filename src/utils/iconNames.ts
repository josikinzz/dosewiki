import type { IconName } from "@/components/common/Icon";

/**
 * Icon name constants for commonly-used icons.
 * Lucide icons use the "lucide:" prefix with kebab-case names.
 * 
 * Browse all available icons at: https://icon-sets.iconify.design/
 */
export const icons = {
  // Navigation & UI
  search: "lucide:search",
  x: "lucide:x",
  plus: "lucide:plus",
  trash2: "lucide:trash-2",
  pencil: "lucide:pencil",
  edit3: "lucide:edit-3",
  menu: "lucide:menu",
  check: "lucide:check",
  chevronDown: "lucide:chevron-down",
  chevronUp: "lucide:chevron-up",
  chevronRight: "lucide:chevron-right",
  chevronLeft: "lucide:chevron-left",
  arrowUp: "lucide:arrow-up",
  arrowDown: "lucide:arrow-down",
  arrowLeft: "lucide:arrow-left",
  arrowRight: "lucide:arrow-right",
  arrowDownAZ: "lucide:arrow-down-a-z",
  arrowLeftRight: "lucide:arrow-left-right",
  externalLink: "lucide:external-link",
  link2: "lucide:link-2",
  gripVertical: "lucide:grip-vertical",
  ellipsis: "lucide:ellipsis",
  eye: "lucide:eye",
  
  // Status & Alerts
  alertTriangle: "lucide:alert-triangle",
  triangleAlert: "lucide:triangle-alert",
  alertCircle: "lucide:alert-circle",
  info: "lucide:info",
  shieldAlert: "lucide:shield-alert",
  shieldCheck: "lucide:shield-check",
  
  // Science & Chemistry
  flaskConical: "lucide:flask-conical",
  flaskRound: "lucide:flask-round",
  beaker: "lucide:beaker",
  pipette: "lucide:pipette",
  atom: "lucide:atom",
  hexagon: "lucide:hexagon",
  
  // Brain & Mind
  brain: "lucide:brain",
  brainCircuit: "lucide:brain-circuit",
  brainCog: "lucide:brain-cog",
  sparkles: "lucide:sparkles",
  subjectiveEffectIndex: "material-symbols:person-play-outline-rounded",
  lightbulb: "lucide:lightbulb",
  
  // Medical & Health
  pill: "lucide:pill",
  syringe: "lucide:syringe",
  hospital: "lucide:hospital",
  ambulance: "lucide:ambulance",
  stethoscope: "lucide:stethoscope",
  skull: "lucide:skull",
  
  // Charts & Data
  chartColumnIncreasing: "lucide:chart-column-increasing",
  chartLine: "lucide:chart-line",
  chartNoAxesCombined: "lucide:chart-no-axes-combined",
  trendingUp: "lucide:trending-up",
  trendingDown: "lucide:trending-down",
  
  // Time & Calendar
  timer: "lucide:timer",
  clock: "lucide:clock",
  calendar: "lucide:calendar",
  sunrise: "lucide:sunrise",
  sun: "lucide:sun",
  sunset: "lucide:sunset",
  moon: "lucide:moon",
  
  // Users & People
  user: "lucide:user",
  userRound: "lucide:user-round",
  userCircle: "lucide:user-circle",
  userRoundCog: "lucide:user-round-cog",
  users: "lucide:users",
  
  // Documents & Files
  fileSignature: "hugeicons:content-writing",
  fileText: "lucide:file-text",
  fileCode: "lucide:file-code",
  notebookText: "lucide:notebook-text",
  bookOpen: "lucide:book-open",
  bookOpenText: "lucide:book-open-text",
  library: "lucide:library",
  
  // Actions
  save: "lucide:save",
  copy: "lucide:copy",
  download: "lucide:download",
  refreshCw: "lucide:refresh-cw",
  rotateCcw: "lucide:rotate-ccw",
  loader: "lucide:loader",
  loader2: "lucide:loader-2",
  
  // Categories & Tags
  tag: "lucide:tag",
  layers: "lucide:layers",
  shapes: "lucide:shapes",
  circle: "lucide:circle",
  
  // Nature
  leaf: "lucide:leaf",
  
  // Misc
  star: "lucide:star",
  zap: "lucide:zap",
  cog: "lucide:cog",
  wrench: "lucide:wrench",
  blend: "lucide:blend",
  repeat2: "lucide:repeat-2",
  quote: "lucide:quote",
  messageSquareQuote: "lucide:message-square-quote",
  messageSquarePlus: "lucide:message-square-plus",
  mail: "lucide:mail",
  // Brand glyph, not a Lucide speech bubble: the Discord page and the contact page's
  // Discord row would otherwise share a generic message icon with each other.
  discord: "simple-icons:discord",
  squareArrowOutUpRight: "lucide:square-arrow-out-up-right",
  gitCompareArrows: "lucide:git-compare-arrows",
  scanEye: "lucide:scan-eye",
  listOrdered: "lucide:list-ordered",
  listFilter: "lucide:list-filter",
  layoutList: "lucide:layout-list",
  house: "lucide:house",
  globe: "lucide:globe",
  mapPin: "lucide:map-pin",
  scale: "lucide:scale",
  ruler: "lucide:ruler",
  fingerprint: "lucide:fingerprint",
  award: "lucide:award",
  waves: "lucide:waves",
  ear: "lucide:ear",
  hand: "lucide:hand",
  plusCircle: "lucide:plus-circle",
  slidersHorizontal: "lucide:sliders-horizontal",
  braces: "lucide:braces",
  imageUp: "lucide:image-up",
  imageOff: "lucide:image-off",
  unlink: "lucide:unlink",
  bug: "lucide:bug",
  heart: "lucide:heart",
  dumbbell: "lucide:dumbbell",
  smilePlus: "lucide:smile-plus",
  bedDouble: "lucide:bed-double",
  sprout: "lucide:sprout",
  swatchBook: "lucide:swatch-book",
  shell: "lucide:shell",
} as const satisfies Record<string, IconName>;


