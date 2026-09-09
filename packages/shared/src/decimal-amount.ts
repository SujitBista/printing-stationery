const DECIMAL_PATTERN = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/;

export function isNonNegativeDecimalString(value: string): boolean {
  return DECIMAL_PATTERN.test(value);
}

function toScaledInteger(value: string, scale: number): bigint {
  const [whole = "0", fraction = ""] = value.split(".");
  const paddedFraction = (fraction + "0".repeat(scale)).slice(0, scale);
  return BigInt(`${whole}${paddedFraction}`);
}

function fromScaledInteger(value: bigint, scale: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const digits = absolute.toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale);
  const trimmedFraction = fraction.replace(/0+$/, "");
  const formatted =
    trimmedFraction.length === 0 ? whole : `${whole}.${trimmedFraction}`;
  return negative ? `-${formatted}` : formatted;
}

/** Quantity × rate, rounded half-up to `scale` fractional digits (default 4). */
export function multiplyDecimalStrings(
  left: string,
  right: string,
  scale = 4,
): string {
  if (!isNonNegativeDecimalString(left) || !isNonNegativeDecimalString(right)) {
    throw new Error("Amount inputs must be non-negative decimal strings");
  }

  const extraScale = scale;
  const product = toScaledInteger(left, scale) * toScaledInteger(right, scale);
  const divisor = 10n ** BigInt(extraScale);
  const half = divisor / 2n;
  const rounded =
    product >= 0n
      ? (product + half) / divisor
      : (product - half) / divisor;
  return fromScaledInteger(rounded, scale);
}

export function sumDecimalStrings(values: string[], scale = 4): string {
  const total = values.reduce((sum, value) => {
    if (!isNonNegativeDecimalString(value)) {
      throw new Error("Amount inputs must be non-negative decimal strings");
    }
    return sum + toScaledInteger(value, scale);
  }, 0n);
  return fromScaledInteger(total, scale);
}
