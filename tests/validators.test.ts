/**
 * Validators tests
 */

import { describe, it, expect } from "vitest";
import {
  CardValidators,
  AmountValidators,
  CurrencyValidators,
  EmailValidators,
  PhoneValidators,
  IpValidators,
  Validators,
  createValidator,
  createPaymentIntentValidator,
} from "../src/validators/index.js";

describe("CardValidators", () => {
  describe("luhn", () => {
    it("should validate correct card numbers", () => {
      expect(CardValidators.luhn("4242424242424242")).toBe(true); // Visa
      expect(CardValidators.luhn("5555555555554444")).toBe(true); // Mastercard
      expect(CardValidators.luhn("378282246310005")).toBe(true); // Amex
    });

    it("should reject invalid card numbers", () => {
      expect(CardValidators.luhn("4242424242424241")).toBe(false);
      expect(CardValidators.luhn("1234567890123456")).toBe(false);
      expect(CardValidators.luhn("123")).toBe(false);
    });
  });

  describe("getBrand", () => {
    it("should detect card brands", () => {
      expect(CardValidators.getBrand("4242424242424242")).toBe("visa");
      expect(CardValidators.getBrand("5555555555554444")).toBe("mastercard");
      expect(CardValidators.getBrand("378282246310005")).toBe("amex");
      expect(CardValidators.getBrand("6011111111111117")).toBe("discover");
      expect(CardValidators.getBrand("3530111333300000")).toBe("jcb");
    });

    it("should return null for unknown brands", () => {
      expect(CardValidators.getBrand("9999999999999999")).toBe(null);
    });
  });

  describe("isExpired", () => {
    it("should detect expired cards", () => {
      const now = new Date();
      const currentYear = now.getFullYear() % 100;
      const currentMonth = now.getMonth() + 1;

      expect(CardValidators.isExpired(currentMonth - 1, currentYear)).toBe(true);
      expect(CardValidators.isExpired(1, currentYear - 1)).toBe(true);
    });

    it("should pass valid cards", () => {
      const now = new Date();
      const currentYear = now.getFullYear() % 100;

      expect(CardValidators.isExpired(12, currentYear + 1)).toBe(false);
    });
  });

  describe("isValidCvv", () => {
    it("should validate CVV length by brand", () => {
      expect(CardValidators.isValidCvv("123", "visa")).toBe(true);
      expect(CardValidators.isValidCvv("1234", "amex")).toBe(true);
      expect(CardValidators.isValidCvv("1234", "visa")).toBe(false);
      expect(CardValidators.isValidCvv("123", "amex")).toBe(false);
    });
  });
});

describe("AmountValidators", () => {
  describe("isPositive", () => {
    it("should validate positive amounts", () => {
      expect(AmountValidators.isPositive(100)).toBe(true);
      expect(AmountValidators.isPositive(0.01)).toBe(true);
      expect(AmountValidators.isPositive(0)).toBe(false);
      expect(AmountValidators.isPositive(-10)).toBe(false);
    });
  });

  describe("isWithinLimits", () => {
    it("should validate amount within limits", () => {
      expect(AmountValidators.isWithinLimits(50, 10, 100)).toBe(true);
      expect(AmountValidators.isWithinLimits(10, 10, 100)).toBe(true);
      expect(AmountValidators.isWithinLimits(100, 10, 100)).toBe(true);
      expect(AmountValidators.isWithinLimits(5, 10, 100)).toBe(false);
      expect(AmountValidators.isWithinLimits(150, 10, 100)).toBe(false);
    });
  });

  describe("hasValidDecimals", () => {
    it("should validate decimal places", () => {
      expect(AmountValidators.hasValidDecimals(10.99, 2)).toBe(true);
      expect(AmountValidators.hasValidDecimals(10.999, 2)).toBe(false);
      expect(AmountValidators.hasValidDecimals(100, 0)).toBe(true);
      expect(AmountValidators.hasValidDecimals(100.5, 0)).toBe(false);
    });
  });
});

describe("CurrencyValidators", () => {
  describe("isValid", () => {
    it("should validate ISO currencies", () => {
      expect(CurrencyValidators.isValid("USD")).toBe(true);
      expect(CurrencyValidators.isValid("eur")).toBe(true);
      expect(CurrencyValidators.isValid("XYZ")).toBe(false);
    });
  });

  describe("getDecimals", () => {
    it("should return correct decimal places", () => {
      expect(CurrencyValidators.getDecimals("USD")).toBe(2);
      expect(CurrencyValidators.getDecimals("EUR")).toBe(2);
      expect(CurrencyValidators.getDecimals("JPY")).toBe(0);
      expect(CurrencyValidators.getDecimals("KRW")).toBe(0);
    });
  });
});

describe("EmailValidators", () => {
  describe("isValid", () => {
    it("should validate emails", () => {
      expect(EmailValidators.isValid("test@example.com")).toBe(true);
      expect(EmailValidators.isValid("user.name@domain.co.uk")).toBe(true);
      expect(EmailValidators.isValid("invalid")).toBe(false);
      expect(EmailValidators.isValid("@domain.com")).toBe(false);
      expect(EmailValidators.isValid("user@")).toBe(false);
    });
  });

  describe("isDisposable", () => {
    it("should detect disposable emails", () => {
      expect(EmailValidators.isDisposable("user@tempmail.com")).toBe(true);
      expect(EmailValidators.isDisposable("user@mailinator.com")).toBe(true);
      expect(EmailValidators.isDisposable("user@gmail.com")).toBe(false);
    });
  });
});

describe("PhoneValidators", () => {
  describe("normalize", () => {
    it("should remove non-digits", () => {
      expect(PhoneValidators.normalize("+1 (555) 123-4567")).toBe("15551234567");
      expect(PhoneValidators.normalize("555.123.4567")).toBe("5551234567");
    });
  });

  describe("isValid", () => {
    it("should validate phone lengths", () => {
      expect(PhoneValidators.isValid("5551234567")).toBe(true);
      expect(PhoneValidators.isValid("+15551234567")).toBe(true);
      expect(PhoneValidators.isValid("123")).toBe(false);
    });
  });

  describe("isE164", () => {
    it("should validate E.164 format", () => {
      expect(PhoneValidators.isE164("+15551234567")).toBe(true);
      expect(PhoneValidators.isE164("+442071234567")).toBe(true);
      expect(PhoneValidators.isE164("5551234567")).toBe(false);
      expect(PhoneValidators.isE164("+0123456789")).toBe(false);
    });
  });
});

describe("IpValidators", () => {
  describe("isValidV4", () => {
    it("should validate IPv4 addresses", () => {
      expect(IpValidators.isValidV4("192.168.1.1")).toBe(true);
      expect(IpValidators.isValidV4("0.0.0.0")).toBe(true);
      expect(IpValidators.isValidV4("255.255.255.255")).toBe(true);
      expect(IpValidators.isValidV4("256.1.1.1")).toBe(false);
      expect(IpValidators.isValidV4("1.2.3")).toBe(false);
    });
  });

  describe("isPrivate", () => {
    it("should detect private IPs", () => {
      expect(IpValidators.isPrivate("192.168.1.1")).toBe(true);
      expect(IpValidators.isPrivate("10.0.0.1")).toBe(true);
      expect(IpValidators.isPrivate("172.16.0.1")).toBe(true);
      expect(IpValidators.isPrivate("127.0.0.1")).toBe(true);
      expect(IpValidators.isPrivate("8.8.8.8")).toBe(false);
    });
  });
});

describe("SchemaValidator", () => {
  it("should validate required fields", () => {
    const validator = createValidator()
      .field("name", Validators.required(), Validators.string())
      .field("age", Validators.required(), Validators.number());

    const result = validator.validate({ name: "John", age: 30 });
    expect(result.valid).toBe(true);

    const invalid = validator.validate({ name: "John" });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors[0].code).toBe("REQUIRED");
  });

  it("should validate min/max values", () => {
    const validator = createValidator()
      .field("amount", Validators.min(10), Validators.max(1000));

    expect(validator.validate({ amount: 50 }).valid).toBe(true);
    expect(validator.validate({ amount: 5 }).valid).toBe(false);
    expect(validator.validate({ amount: 1500 }).valid).toBe(false);
  });

  it("should validate string lengths", () => {
    const validator = createValidator()
      .field("code", Validators.minLength(3), Validators.maxLength(10));

    expect(validator.validate({ code: "ABCDE" }).valid).toBe(true);
    expect(validator.validate({ code: "AB" }).valid).toBe(false);
    expect(validator.validate({ code: "ABCDEFGHIJK" }).valid).toBe(false);
  });

  it("should validate patterns", () => {
    const validator = createValidator()
      .field("zip", Validators.pattern(/^\d{5}$/, "Invalid ZIP code"));

    expect(validator.validate({ zip: "12345" }).valid).toBe(true);
    expect(validator.validate({ zip: "1234" }).valid).toBe(false);
    expect(validator.validate({ zip: "ABCDE" }).valid).toBe(false);
  });

  it("should validate oneOf", () => {
    const validator = createValidator()
      .field("status", Validators.oneOf(["active", "inactive", "pending"]));

    expect(validator.validate({ status: "active" }).valid).toBe(true);
    expect(validator.validate({ status: "unknown" }).valid).toBe(false);
  });
});

describe("createPaymentIntentValidator", () => {
  it("should validate payment intents", () => {
    const validator = createPaymentIntentValidator();

    const valid = validator.validate({
      id: "pi_123",
      amount: 100,
      currency: "USD",
      paymentMethod: "card",
      customerEmail: "test@example.com",
    });

    expect(valid.valid).toBe(true);
  });

  it("should reject invalid payment intents", () => {
    const validator = createPaymentIntentValidator();

    const invalid = validator.validate({
      id: "pi_123",
      amount: -10,
      currency: "INVALID",
      paymentMethod: "unknown",
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.errors.length).toBeGreaterThan(0);
  });
});
