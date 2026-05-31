/**
 * Validators Module
 * Comprehensive input validation for payment data
 */

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
  value?: unknown;
}

export type ValidatorFn<T = unknown> = (value: T, field: string) => ValidationError | null;

/**
 * Create validation error
 */
function error(field: string, code: string, message: string, value?: unknown): ValidationError {
  return { field, code, message, value };
}

/**
 * Card number validators
 */
export const CardValidators = {
  /**
   * Validate card number using Luhn algorithm
   */
  luhn: (cardNumber: string): boolean => {
    const digits = cardNumber.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) return false;

    let sum = 0;
    let isEven = false;

    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits[i]!, 10);

      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  },

  /**
   * Get card brand from number
   */
  getBrand: (cardNumber: string): string | null => {
    const digits = cardNumber.replace(/\D/g, "");
    
    // Card brand patterns
    const patterns: [RegExp, string][] = [
      [/^4/, "visa"],
      [/^5[1-5]|^2[2-7]/, "mastercard"],
      [/^3[47]/, "amex"],
      [/^6(?:011|5)/, "discover"],
      [/^35(?:2[89]|[3-8])/, "jcb"],
      [/^3(?:0[0-5]|[68])/, "diners"],
      [/^62/, "unionpay"],
    ];

    for (const [pattern, brand] of patterns) {
      if (pattern.test(digits)) return brand;
    }

    return null;
  },

  /**
   * Validate expiration date
   */
  isExpired: (month: number, year: number): boolean => {
    const now = new Date();
    const currentYear = now.getFullYear() % 100;
    const currentMonth = now.getMonth() + 1;

    if (year < currentYear) return true;
    if (year === currentYear && month < currentMonth) return true;
    return false;
  },

  /**
   * Validate CVV length for card brand
   */
  isValidCvv: (cvv: string, brand: string | null): boolean => {
    const digits = cvv.replace(/\D/g, "");
    if (brand === "amex") {
      return digits.length === 4;
    }
    return digits.length === 3;
  },
};

/**
 * Amount validators
 */
export const AmountValidators = {
  /**
   * Check if amount is positive
   */
  isPositive: (amount: number): boolean => amount > 0,

  /**
   * Check if amount is within limits
   */
  isWithinLimits: (amount: number, min: number, max: number): boolean => {
    return amount >= min && amount <= max;
  },

  /**
   * Check decimal places for currency
   */
  hasValidDecimals: (amount: number, decimals: number): boolean => {
    const multiplier = Math.pow(10, decimals);
    return Math.round(amount * multiplier) === amount * multiplier;
  },
};

/**
 * Currency validators
 */
export const CurrencyValidators = {
  /**
   * Valid ISO 4217 currency codes
   */
  validCurrencies: new Set([
    "USD", "EUR", "GBP", "JPY", "CNY", "AUD", "CAD", "CHF", "HKD", "NZD",
    "SEK", "KRW", "SGD", "NOK", "MXN", "INR", "RUB", "ZAR", "TRY", "BRL",
    "TWD", "DKK", "PLN", "THB", "IDR", "HUF", "CZK", "ILS", "CLP", "PHP",
    "AED", "COP", "SAR", "MYR", "RON", "NGN", "EGP", "VND", "PKR", "BDT",
  ]),

  /**
   * Zero-decimal currencies
   */
  zeroDecimalCurrencies: new Set([
    "JPY", "KRW", "VND", "CLP", "ISK", "UGX", "RWF", "PYG", "GNF", "KMF",
    "XOF", "XAF", "XPF", "DJF", "BIF", "MGA", "VUV",
  ]),

  /**
   * Check if valid currency
   */
  isValid: (currency: string): boolean => {
    return CurrencyValidators.validCurrencies.has(currency.toUpperCase());
  },

  /**
   * Get decimal places for currency
   */
  getDecimals: (currency: string): number => {
    return CurrencyValidators.zeroDecimalCurrencies.has(currency.toUpperCase()) ? 0 : 2;
  },
};

/**
 * Email validators
 */
export const EmailValidators = {
  /**
   * Basic email validation
   */
  isValid: (email: string): boolean => {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return pattern.test(email);
  },

  /**
   * Check for disposable email domains
   */
  isDisposable: (email: string): boolean => {
    const disposableDomains = [
      "tempmail.com", "throwaway.email", "guerrillamail.com",
      "10minutemail.com", "mailinator.com", "temp-mail.org",
    ];
    const domain = email.split("@")[1]?.toLowerCase();
    return domain !== undefined && disposableDomains.includes(domain);
  },
};

/**
 * Phone validators
 */
export const PhoneValidators = {
  /**
   * Remove non-digit characters
   */
  normalize: (phone: string): string => phone.replace(/\D/g, ""),

  /**
   * Check if valid phone length
   */
  isValid: (phone: string): boolean => {
    const digits = PhoneValidators.normalize(phone);
    return digits.length >= 10 && digits.length <= 15;
  },

  /**
   * Check E.164 format
   */
  isE164: (phone: string): boolean => {
    return /^\+[1-9]\d{1,14}$/.test(phone);
  },
};

/**
 * Address validators
 */
export const AddressValidators = {
  /**
   * Valid country codes
   */
  validCountries: new Set([
    "US", "CA", "GB", "DE", "FR", "IT", "ES", "NL", "BE", "AT",
    "CH", "AU", "NZ", "JP", "CN", "KR", "SG", "HK", "TW", "IN",
    "BR", "MX", "AR", "CL", "CO", "PE", "RU", "UA", "PL", "CZ",
  ]),

  /**
   * US state codes
   */
  usStates: new Set([
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
    "DC", "PR", "VI", "GU", "AS", "MP",
  ]),

  /**
   * Validate postal code format by country
   */
  isValidPostal: (postal: string, country: string): boolean => {
    const patterns: Record<string, RegExp> = {
      US: /^\d{5}(-\d{4})?$/,
      CA: /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i,
      GB: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i,
      DE: /^\d{5}$/,
      FR: /^\d{5}$/,
      JP: /^\d{3}-?\d{4}$/,
      AU: /^\d{4}$/,
    };

    const pattern = patterns[country.toUpperCase()];
    if (!pattern) return true; // No validation for unknown countries
    return pattern.test(postal);
  },
};

/**
 * IP validators
 */
export const IpValidators = {
  /**
   * Validate IPv4
   */
  isValidV4: (ip: string): boolean => {
    const pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = ip.match(pattern);
    if (!match) return false;
    return match.slice(1).every((octet) => {
      const num = parseInt(octet, 10);
      return num >= 0 && num <= 255;
    });
  },

  /**
   * Validate IPv6
   */
  isValidV6: (ip: string): boolean => {
    const pattern = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return pattern.test(ip);
  },

  /**
   * Check if private IP
   */
  isPrivate: (ip: string): boolean => {
    if (!IpValidators.isValidV4(ip)) return false;
    const parts = ip.split(".").map(Number);
    const a = parts[0]!;
    const b = parts[1]!;
    return (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 127
    );
  },
};

/**
 * Schema-based validator
 */
export class SchemaValidator {
  private rules: Map<string, ValidatorFn[]> = new Map();

  /**
   * Add field validation rule
   */
  field(name: string, ...validators: ValidatorFn[]): this {
    const existing = this.rules.get(name) || [];
    this.rules.set(name, [...existing, ...validators]);
    return this;
  }

  /**
   * Validate object against schema
   */
  validate(data: Record<string, unknown>): ValidationResult {
    const errors: ValidationError[] = [];

    for (const [field, validators] of this.rules) {
      const value = this.getNestedValue(data, field);

      for (const validator of validators) {
        const err = validator(value, field);
        if (err) {
          errors.push(err);
          break; // Stop at first error for field
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get nested value from object
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce((curr: unknown, key) => {
      if (curr && typeof curr === "object") {
        return (curr as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }
}

/**
 * Common validator functions
 */
export const Validators = {
  required: (): ValidatorFn => (value, field) => {
    if (value === undefined || value === null || value === "") {
      return error(field, "REQUIRED", `${field} is required`);
    }
    return null;
  },

  string: (): ValidatorFn => (value, field) => {
    if (value !== undefined && typeof value !== "string") {
      return error(field, "INVALID_TYPE", `${field} must be a string`, value);
    }
    return null;
  },

  number: (): ValidatorFn => (value, field) => {
    if (value !== undefined && typeof value !== "number") {
      return error(field, "INVALID_TYPE", `${field} must be a number`, value);
    }
    return null;
  },

  min: (minValue: number): ValidatorFn => (value, field) => {
    if (typeof value === "number" && value < minValue) {
      return error(field, "MIN_VALUE", `${field} must be at least ${minValue}`, value);
    }
    return null;
  },

  max: (maxValue: number): ValidatorFn => (value, field) => {
    if (typeof value === "number" && value > maxValue) {
      return error(field, "MAX_VALUE", `${field} must be at most ${maxValue}`, value);
    }
    return null;
  },

  minLength: (min: number): ValidatorFn => (value, field) => {
    if (typeof value === "string" && value.length < min) {
      return error(field, "MIN_LENGTH", `${field} must be at least ${min} characters`, value);
    }
    return null;
  },

  maxLength: (max: number): ValidatorFn => (value, field) => {
    if (typeof value === "string" && value.length > max) {
      return error(field, "MAX_LENGTH", `${field} must be at most ${max} characters`, value);
    }
    return null;
  },

  pattern: (regex: RegExp, message?: string): ValidatorFn => (value, field) => {
    if (typeof value === "string" && !regex.test(value)) {
      return error(field, "PATTERN", message || `${field} has invalid format`, value);
    }
    return null;
  },

  email: (): ValidatorFn => (value, field) => {
    if (typeof value === "string" && !EmailValidators.isValid(value)) {
      return error(field, "INVALID_EMAIL", "Invalid email address", value);
    }
    return null;
  },

  currency: (): ValidatorFn => (value, field) => {
    if (typeof value === "string" && !CurrencyValidators.isValid(value)) {
      return error(field, "INVALID_CURRENCY", "Invalid currency code", value);
    }
    return null;
  },

  cardNumber: (): ValidatorFn => (value, field) => {
    if (typeof value === "string" && !CardValidators.luhn(value)) {
      return error(field, "INVALID_CARD", "Invalid card number", value);
    }
    return null;
  },

  oneOf: <T>(allowed: T[]): ValidatorFn => (value, field) => {
    if (value !== undefined && !allowed.includes(value as T)) {
      return error(field, "NOT_ALLOWED", `${field} must be one of: ${allowed.join(", ")}`, value);
    }
    return null;
  },

  custom: (fn: (value: unknown) => boolean, message: string): ValidatorFn => (value, field) => {
    if (value !== undefined && !fn(value)) {
      return error(field, "CUSTOM", message, value);
    }
    return null;
  },
};

/**
 * Create schema validator
 */
export function createValidator(): SchemaValidator {
  return new SchemaValidator();
}

/**
 * Payment intent validator preset
 */
export function createPaymentIntentValidator(): SchemaValidator {
  return createValidator()
    .field("id", Validators.required(), Validators.string())
    .field("amount", Validators.required(), Validators.number(), Validators.min(0.01))
    .field("currency", Validators.required(), Validators.currency())
    .field("paymentMethod", Validators.required(), Validators.oneOf(["card", "bank_transfer", "crypto"]))
    .field("customerEmail", Validators.email());
}
