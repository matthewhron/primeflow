/**
 * Currency utilities
 */

/**
 * Currency information
 */
export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  region?: string;
}

/**
 * Common currency definitions
 */
export const CURRENCIES: Record<string, CurrencyInfo> = {
  USD: { code: "USD", name: "US Dollar", symbol: "$", decimals: 2, region: "US" },
  EUR: { code: "EUR", name: "Euro", symbol: "€", decimals: 2, region: "EU" },
  GBP: { code: "GBP", name: "British Pound", symbol: "£", decimals: 2, region: "UK" },
  JPY: { code: "JPY", name: "Japanese Yen", symbol: "¥", decimals: 0, region: "JP" },
  CNY: { code: "CNY", name: "Chinese Yuan", symbol: "¥", decimals: 2, region: "CN" },
  INR: { code: "INR", name: "Indian Rupee", symbol: "₹", decimals: 2, region: "IN" },
  BRL: { code: "BRL", name: "Brazilian Real", symbol: "R$", decimals: 2, region: "BR" },
  SGD: { code: "SGD", name: "Singapore Dollar", symbol: "S$", decimals: 2, region: "SG" },
  AUD: { code: "AUD", name: "Australian Dollar", symbol: "A$", decimals: 2, region: "AU" },
  CAD: { code: "CAD", name: "Canadian Dollar", symbol: "C$", decimals: 2, region: "CA" },
  MXN: { code: "MXN", name: "Mexican Peso", symbol: "$", decimals: 2, region: "MX" },
  KRW: { code: "KRW", name: "South Korean Won", symbol: "₩", decimals: 0, region: "KR" },
  RUB: { code: "RUB", name: "Russian Ruble", symbol: "₽", decimals: 2, region: "RU" },
  CHF: { code: "CHF", name: "Swiss Franc", symbol: "CHF", decimals: 2, region: "CH" },
  SEK: { code: "SEK", name: "Swedish Krona", symbol: "kr", decimals: 2, region: "SE" },
  NOK: { code: "NOK", name: "Norwegian Krone", symbol: "kr", decimals: 2, region: "NO" },
  DKK: { code: "DKK", name: "Danish Krone", symbol: "kr", decimals: 2, region: "DK" },
  PLN: { code: "PLN", name: "Polish Zloty", symbol: "zł", decimals: 2, region: "PL" },
  CZK: { code: "CZK", name: "Czech Koruna", symbol: "Kč", decimals: 2, region: "CZ" },
  HUF: { code: "HUF", name: "Hungarian Forint", symbol: "Ft", decimals: 2, region: "HU" },
  ZAR: { code: "ZAR", name: "South African Rand", symbol: "R", decimals: 2, region: "ZA" },
  AED: { code: "AED", name: "UAE Dirham", symbol: "د.إ", decimals: 2, region: "AE" },
  THB: { code: "THB", name: "Thai Baht", symbol: "฿", decimals: 2, region: "TH" },
  IDR: { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp", decimals: 0, region: "ID" },
  MYR: { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", decimals: 2, region: "MY" },
  PHP: { code: "PHP", name: "Philippine Peso", symbol: "₱", decimals: 2, region: "PH" },
  VND: { code: "VND", name: "Vietnamese Dong", symbol: "₫", decimals: 0, region: "VN" },
  HKD: { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$", decimals: 2, region: "HK" },
  TWD: { code: "TWD", name: "Taiwan Dollar", symbol: "NT$", decimals: 2, region: "TW" },
  NZD: { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", decimals: 2, region: "NZ" },
  ILS: { code: "ILS", name: "Israeli Shekel", symbol: "₪", decimals: 2, region: "IL" },
  TRY: { code: "TRY", name: "Turkish Lira", symbol: "₺", decimals: 2, region: "TR" },
  ARS: { code: "ARS", name: "Argentine Peso", symbol: "$", decimals: 2, region: "AR" },
  CLP: { code: "CLP", name: "Chilean Peso", symbol: "$", decimals: 0, region: "CL" },
  COP: { code: "COP", name: "Colombian Peso", symbol: "$", decimals: 2, region: "CO" },
  PEN: { code: "PEN", name: "Peruvian Sol", symbol: "S/", decimals: 2, region: "PE" },
};

/**
 * Get currency info
 */
export function getCurrencyInfo(code: string): CurrencyInfo | undefined {
  return CURRENCIES[code.toUpperCase()];
}

/**
 * Convert amount to smallest currency unit (cents, etc.)
 */
export function toSmallestUnit(amount: number, currency: string): number {
  const info = getCurrencyInfo(currency);
  const decimals = info?.decimals ?? 2;
  return Math.round(amount * Math.pow(10, decimals));
}

/**
 * Convert from smallest unit to decimal
 */
export function fromSmallestUnit(amount: number, currency: string): number {
  const info = getCurrencyInfo(currency);
  const decimals = info?.decimals ?? 2;
  return amount / Math.pow(10, decimals);
}

/**
 * Format amount with currency symbol
 */
export function formatAmount(amount: number, currency: string): string {
  const info = getCurrencyInfo(currency);
  
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: info?.decimals ?? 2,
      maximumFractionDigits: info?.decimals ?? 2,
    }).format(amount);
  } catch {
    // Fallback for unsupported currencies
    const symbol = info?.symbol ?? currency;
    return `${symbol}${amount.toFixed(info?.decimals ?? 2)}`;
  }
}

/**
 * Calculate FX fee
 */
export function calculateFxFee(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  fxRate: number,
  fxMarkup = 0.02 // 2% default markup
): { convertedAmount: number; fxFee: number } {
  if (fromCurrency === toCurrency) {
    return { convertedAmount: amount, fxFee: 0 };
  }

  const convertedAmount = amount * fxRate;
  const fxFee = convertedAmount * fxMarkup;

  return {
    convertedAmount,
    fxFee,
  };
}

/**
 * Check if currency is valid ISO 4217
 */
export function isValidCurrency(code: string): boolean {
  if (!code || typeof code !== "string" || code.length !== 3) {
    return false;
  }
  // Check against known currencies or pattern
  return /^[A-Z]{3}$/.test(code.toUpperCase());
}

/**
 * Get region's primary currency
 */
export function getRegionCurrency(region: string): string | undefined {
  const regionMap: Record<string, string> = {
    US: "USD",
    EU: "EUR",
    UK: "GBP",
    JP: "JPY",
    CN: "CNY",
    IN: "INR",
    BR: "BRL",
    SG: "SGD",
    AU: "AUD",
    CA: "CAD",
    MX: "MXN",
    KR: "KRW",
    RU: "RUB",
    CH: "CHF",
    HK: "HKD",
    TW: "TWD",
    NZ: "NZD",
    AE: "AED",
    IL: "ILS",
    TR: "TRY",
    ZA: "ZAR",
    TH: "THB",
    ID: "IDR",
    MY: "MYR",
    PH: "PHP",
    VN: "VND",
    AR: "ARS",
    CL: "CLP",
    CO: "COP",
    PE: "PEN",
    SE: "SEK",
    NO: "NOK",
    DK: "DKK",
    PL: "PLN",
    CZ: "CZK",
    HU: "HUF",
  };

  return regionMap[region.toUpperCase()];
}
