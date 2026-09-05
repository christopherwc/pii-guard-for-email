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
      return luhnCheck(digits);
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
    pattern: /\bpassport\s*(?:#|number|no\.?)?\s*[:-]?\s*[A-Z0-9]{6,9}\b/gi,
  },
  {
    id: 'dob',
    label: 'Dates of birth',
    severity: 'low',
    pattern: /\bdate of birth\s*[:-]?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\bDOB\s*[:-]?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi,
  },
];

module.exports = { RULES, luhnCheck };
