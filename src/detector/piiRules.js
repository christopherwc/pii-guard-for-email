/**
 * Definitions for every PII rule the detector can check.
 * Each rule is independently toggleable from the extension's options page.
 */

function luhnCheck(digits) {
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10);
    if (shouldDouble) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

/**
 * Issuer prefixes (IINs) and lengths of the major card networks. Luhn alone
 * passes ~10% of random numbers, so order, tracking and account numbers were
 * often flagged as cards; requiring a real network prefix + length rules
 * out most of them (nothing issues cards starting with 0, 1, 7, 8 or 9).
 */
const CARD_NETWORK_PATTERNS = [
  /^4(?:\d{12}|\d{15}|\d{18})$/, // Visa: 13, 16 or 19 digits
  /^(?:5[1-5]\d{2}|222[1-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)\d{12}$/, // Mastercard: 16
  /^3[47]\d{13}$/, // American Express: 15
  /^(?:6011|64[4-9]\d|65\d{2})\d{12,15}$/, // Discover: 16-19
  /^62\d{14,17}$/, // UnionPay: 16-19
  /^35(?:2[89]|[3-8]\d)\d{12,15}$/, // JCB: 16-19
  /^3(?:0[0-5]|[689]\d)\d{11,16}$/, // Diners Club: 14-19
  /^(?:5[06-8]|6\d)\d{10,17}$/, // Maestro: 12-19
];

function isKnownCardNetwork(digits) {
  return CARD_NETWORK_PATTERNS.some((pattern) => pattern.test(digits));
}

const RULES = [
  {
    id: 'email',
    label: 'Email addresses',
    severity: 'medium',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    id: 'ssn',
    label: 'Social Security Numbers',
    severity: 'high',
    pattern: /\b(?!000|666|9\d{2})\d{3}[-\s]\d{2}[-\s]\d{4}\b/g,
  },
  {
    id: 'creditCard',
    label: 'Credit card numbers',
    severity: 'high',
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
    validate: (match) => {
      const digits = match.replace(/[ -]/g, '');
      if (digits.length < 13 || digits.length > 19) return false;
      return isKnownCardNetwork(digits) && luhnCheck(digits);
    },
  },
  {
    id: 'phone',
    label: 'Phone numbers',
    severity: 'low',
    pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
  },
  {
    id: 'ipAddress',
    label: 'IP addresses',
    severity: 'low',
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g,
  },
  {
    id: 'awsKey',
    label: 'AWS access keys',
    severity: 'high',
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    id: 'apiKey',
    label: 'Generic API keys / secret tokens',
    severity: 'high',
    pattern: /\b(?:sk|pk|rk)_(?:live|test)_[0-9a-zA-Z]{16,}\b|\bsk-[a-zA-Z0-9]{20,}\b|\bghp_[0-9a-zA-Z]{36}\b/g,
  },
  {
    id: 'bankAccount',
    label: 'Bank routing / account numbers',
    severity: 'medium',
    pattern: /\b(?:routing|account)\s*(?:#|number|no\.?)?\s*[:-]?\s*\d{8,17}\b/gi,
  },
  {
    id: 'passport',
    label: 'US Passport numbers',
    severity: 'medium',
    // The number must contain a digit (US numbers are 9 digits, or a letter
    // + 8 digits); otherwise words like "number" in "my passport number is
    // below" would be taken for the ID itself.
    pattern: /\bpassport\s*(?:#|number|no\.?)?\s*[:-]?\s*(?=[A-Z]{0,8}\d)[A-Z0-9]{6,9}\b/gi,
  },
  {
    id: 'dob',
    label: 'Dates of birth',
    severity: 'low',
    pattern: /\bdate of birth\s*[:-]?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\bDOB\s*[:-]?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi,
  },
];

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

module.exports = { RULES, luhnCheck, isKnownCardNetwork, SEVERITY_ORDER };
