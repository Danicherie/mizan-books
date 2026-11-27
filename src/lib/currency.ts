export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
  decimals: number;
}

export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  { code: "ETB", symbol: "Br", name: "Ethiopian Birr", decimals: 2 },
  { code: "USD", symbol: "$", name: "US Dollar", decimals: 2 },
  { code: "SOS", symbol: "Sh", name: "Somali Shilling", decimals: 0 },
  { code: "KES", symbol: "KSh", name: "Kenyan Shilling", decimals: 2 },
  { code: "SAR", symbol: "﷼", name: "Saudi Riyal", decimals: 2 },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham", decimals: 2 },
  { code: "EUR", symbol: "€", name: "Euro", decimals: 2 },
  { code: "GBP", symbol: "£", name: "British Pound", decimals: 2 },
];

export const CURRENCY_MAP: Record<string, CurrencyInfo> = Object.fromEntries(
  SUPPORTED_CURRENCIES.map((c) => [c.code, c])
);

export function formatMoney(
  amount: number | null | undefined,
  currencyCode = "ETB",
  compact = false
): string {
  const val = Number(amount ?? 0);
  const info = CURRENCY_MAP[currencyCode] ?? {
    code: currencyCode,
    symbol: currencyCode,
    name: currencyCode,
    decimals: 2,
  };

  if (compact && Math.abs(val) >= 1_000_000) {
    return `${info.symbol} ${(val / 1_000_000).toFixed(2)}M`;
  }
  if (compact && Math.abs(val) >= 100_000) {
    return `${info.symbol} ${(val / 1_000).toFixed(1)}K`;
  }

  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: info.decimals,
    maximumFractionDigits: info.decimals,
  }).format(Math.abs(val));

  const sign = val < 0 ? "-" : "";
  return `${sign}${info.symbol} ${formatted}`;
}

export const TAX_REGIMES = [
  {
    code: "ET_STANDARD",
    label: "Ethiopia Standard (15% VAT / 2% WHT)",
    defaultVat: 15,
    defaultWht: 2,
  },
  {
    code: "SA_VAT",
    label: "Saudi Arabia (15% VAT / 0% WHT)",
    defaultVat: 15,
    defaultWht: 0,
  },
  {
    code: "UAE_VAT",
    label: "UAE (5% VAT / 0% WHT)",
    defaultVat: 5,
    defaultWht: 0,
  },
  {
    code: "KE_VAT",
    label: "Kenya (16% VAT / 3% WHT)",
    defaultVat: 16,
    defaultWht: 3,
  },
  {
    code: "SO_CUSTOM",
    label: "Somalia (5% Sales Tax / 0% WHT)",
    defaultVat: 5,
    defaultWht: 0,
  },
  {
    code: "EXEMPT",
    label: "Tax Exempt (0% VAT / 0% WHT)",
    defaultVat: 0,
    defaultWht: 0,
  },
] as const;
