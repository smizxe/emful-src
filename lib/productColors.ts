const NAMED_COLOR_HEX: Record<string, string> = {
  white: "#ffffff",
  ivory: "#fffff0",
  cream: "#fffdd0",
  beige: "#f5f5dc",
  sand: "#c2b280",
  khaki: "#c3b091",
  tan: "#d2b48c",
  stone: "#d6d3d1",
  oatmeal: "#e7ddc8",
  gold: "#d4af37",
  yellow: "#facc15",
  mustard: "#d4a017",
  orange: "#f97316",
  peach: "#f9a8d4",
  pink: "#ec4899",
  lightpink: "#f9a8d4",
  hotpink: "#ec4899",
  rose: "#e11d48",
  red: "#ef4444",
  maroon: "#7f1d1d",
  burgundy: "#800020",
  brown: "#8b5e3c",
  chocolate: "#7b3f00",
  rust: "#b7410e",
  coral: "#fb7185",
  purple: "#7c3aed",
  lavender: "#c4b5fd",
  lilac: "#a78bfa",
  violet: "#8b5cf6",
  plum: "#7e22ce",
  indigo: "#4338ca",
  blue: "#2563eb",
  royalblue: "#4169e1",
  royal: "#4169e1",
  navy: "#1e3a8a",
  skyblue: "#38bdf8",
  sky: "#38bdf8",
  lightblue: "#7dd3fc",
  teal: "#0f766e",
  turquoise: "#14b8a6",
  mint: "#34d399",
  green: "#22c55e",
  forestgreen: "#228b22",
  forest: "#228b22",
  olive: "#708238",
  lime: "#84cc16",
  sage: "#7c9a6d",
  charcoal: "#36454f",
  grey: "#9ca3af",
  gray: "#9ca3af",
  ash: "#9ca3af",
  silver: "#c0c0c0",
  sportgrey: "#9ca3af",
  sportgray: "#9ca3af",
  darkgrey: "#52525b",
  darkgray: "#52525b",
  darkheather: "#52525b",
  heathergrey: "#9ca3af",
  heathergray: "#9ca3af",
  heather: "#9ca3af",
  black: "#111827",
};

function normalizeColorKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeHex(value: string) {
  const trimmed = value.trim();
  const isShortHex = /^#([a-f0-9]{3})$/i.test(trimmed);
  if (isShortHex) {
    const [, shortHex] = trimmed.match(/^#([a-f0-9]{3})$/i) || [];
    return `#${shortHex
      .split("")
      .map((char) => `${char}${char}`)
      .join("")}`;
  }
  return trimmed;
}

function isValidCssColor(value: string) {
  return (
    /^#([a-f0-9]{3}|[a-f0-9]{6})$/i.test(value.trim()) ||
    /^rgb(a)?\(/i.test(value.trim()) ||
    /^hsl(a)?\(/i.test(value.trim())
  );
}

function parseColorMapping(
  colorMapping?: Record<string, string> | string | null
): Record<string, string> {
  if (!colorMapping) return {};
  if (typeof colorMapping === "string") {
    try {
      const parsed = JSON.parse(colorMapping);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return colorMapping;
}

export function inferColorHex(colorName?: string | null) {
  if (!colorName) return "#d4d4d8";
  const trimmed = colorName.trim();
  if (!trimmed) return "#d4d4d8";

  if (isValidCssColor(trimmed)) {
    return normalizeHex(trimmed);
  }

  return NAMED_COLOR_HEX[normalizeColorKey(trimmed)] || "#d4d4d8";
}

export function getProductColorHex(
  colorName?: string | null,
  colorMapping?: Record<string, string> | string | null
) {
  if (!colorName) return "#d4d4d8";
  const mapping = parseColorMapping(colorMapping);
  const directMatch = mapping[colorName];
  if (directMatch && isValidCssColor(directMatch)) {
    return normalizeHex(directMatch);
  }

  const normalizedTarget = normalizeColorKey(colorName);
  const normalizedMatch = Object.entries(mapping).find(
    ([key, value]) =>
      normalizeColorKey(key) === normalizedTarget && isValidCssColor(value)
  );

  if (normalizedMatch) {
    return normalizeHex(normalizedMatch[1]);
  }

  return inferColorHex(colorName);
}

export function isLightColor(hexColor: string) {
  const hex = normalizeHex(hexColor).replace("#", "");
  if (!/^[a-f0-9]{6}$/i.test(hex)) return false;

  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
  return brightness >= 190;
}
