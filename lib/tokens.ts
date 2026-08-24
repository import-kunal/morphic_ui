// Design token → Tailwind class maps.
// All Tailwind class names are literal strings here so the compiler can purge correctly.
// Never construct class names with string interpolation (e.g. `gap-${n}` is forbidden).

export const gap = {
  none: "",
  xs:   "gap-1",
  sm:   "gap-2",
  md:   "gap-4",
  lg:   "gap-6",
  xl:   "gap-8",
} as const;

export const padding = {
  none: "",
  xs:   "p-1",
  sm:   "p-2",
  md:   "p-4",
  lg:   "p-6",
  xl:   "p-8",
} as const;

export const textSize = {
  xs:   "text-xs",
  sm:   "text-sm",
  base: "text-base",
  lg:   "text-lg",
  xl:   "text-xl",
  "2xl": "text-2xl",
  "3xl": "text-3xl",
} as const;

export const fontWeight = {
  normal:   "font-normal",
  medium:   "font-medium",
  semibold: "font-semibold",
  bold:     "font-bold",
} as const;

export const radius = {
  none: "",
  sm:   "rounded-sm",
  md:   "rounded-md",
  lg:   "rounded-lg",
  full: "rounded-full",
} as const;

export const textColor = {
  default:     "text-foreground",
  muted:       "text-muted-foreground",
  primary:     "text-primary",
  destructive: "text-destructive",
  success:     "text-green-600 dark:text-green-400",
  warning:     "text-yellow-600 dark:text-yellow-400",
} as const;

export const direction = {
  row:    "flex-col sm:flex-row",  // collapses to column on mobile
  column: "flex-col",
} as const;

export const align = {
  start:   "items-start",
  center:  "items-center",
  end:     "items-end",
  stretch: "items-stretch",
} as const;

export const justify = {
  start:   "justify-start",
  center:  "justify-center",
  end:     "justify-end",
  between: "justify-between",
} as const;

// Responsive grid column classes — always 1 col on mobile, adds columns at breakpoints.
export const gridColumns = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
} as const;

export type GapToken       = keyof typeof gap;
export type PaddingToken   = keyof typeof padding;
export type TextSizeToken  = keyof typeof textSize;
export type FontWeightToken = keyof typeof fontWeight;
export type RadiusToken    = keyof typeof radius;
export type TextColorToken = keyof typeof textColor;
export type DirectionToken = keyof typeof direction;
export type AlignToken     = keyof typeof align;
export type JustifyToken   = keyof typeof justify;
