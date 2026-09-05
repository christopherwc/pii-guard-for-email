const { scanText, redact, compileCustomRule } = require('../src/detector/piiDetector');

describe('scanText', () => {
  test('returns clean for empty or PII-free text', () => {
    expect(scanText('').clean).toBe(true);
    expect(scanText('Let\'s meet for lunch tomorrow at noon.').clean).toBe(true);
  });

  test('detects an email address', () => {
    const { clean, findings } = scanText('Reach me at jane.doe@example.com anytime.');
    expect(clean).toBe(false);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe('email');
    expect(findings[0].match).toBe('jane.doe@example.com');
  });

  test('detects a social security number with dashes or spaces', () => {
    expect(scanText('SSN: 219-09-9999').findings.map((f) => f.ruleId)).toContain('ssn');
    expect(scanText('SSN 219 09 9999').findings.map((f) => f.ruleId)).toContain('ssn');
  });

  test('does not flag obviously invalid SSNs starting with 000, 666, or 900+', () => {
    expect(scanText('000-12-3456').findings).toHaveLength(0);
    expect(scanText('666-12-3456').findings).toHaveLength(0);
    expect(scanText('912-12-3456').findings).toHaveLength(0);
  });

  test('detects a valid credit card number and validates via Luhn', () => {
    // Well-known Visa test number, passes Luhn.
    const { findings } = scanText('Card: 4111 1111 1111 1111');
    expect(findings.some((f) => f.ruleId === 'creditCard')).toBe(true);
  });

  test('rejects a 16-digit number that fails the Luhn check', () => {
    const { findings } = scanText('Number: 1234 5678 9012 3456');
    expect(findings.some((f) => f.ruleId === 'creditCard')).toBe(false);
  });

  test('detects US phone numbers in common formats', () => {
    expect(scanText('Call (415) 555-0132').findings.some((f) => f.ruleId === 'phone')).toBe(true);
    expect(scanText('Call 415-555-0132').findings.some((f) => f.ruleId === 'phone')).toBe(true);
    expect(scanText('Call 415.555.0132').findings.some((f) => f.ruleId === 'phone')).toBe(true);
  });

  test('detects IP addresses', () => {
    expect(scanText('Server at 192.168.1.10').findings.some((f) => f.ruleId === 'ipAddress')).toBe(true);
  });

  test('detects AWS access keys', () => {
    const { findings } = scanText('Key: AKIAABCDEFGHIJKLMNOP');
    expect(findings.some((f) => f.ruleId === 'awsKey')).toBe(true);
  });

  test('detects generic API-style secret tokens', () => {
    expect(scanText('token sk-abcdefghijklmnopqrstuvwx').findings.some((f) => f.ruleId === 'apiKey')).toBe(true);
    expect(scanText('token ghp_' + 'a'.repeat(36)).findings.some((f) => f.ruleId === 'apiKey')).toBe(true);
  });

  test('detects bank account/routing number mentions', () => {
    expect(scanText('routing number: 123456789').findings.some((f) => f.ruleId === 'bankAccount')).toBe(true);
  });

  test('detects date of birth mentions', () => {
    expect(scanText('DOB: 04/12/1990').findings.some((f) => f.ruleId === 'dob')).toBe(true);
  });

  test('honors enabledRuleIds to skip disabled rules', () => {
    const { clean } = scanText('jane.doe@example.com', { enabledRuleIds: ['ssn'] });
    expect(clean).toBe(true);
  });

  test('honors an ignore list of exact allow-listed strings', () => {
    const { clean } = scanText('me@company.com', { ignoreList: ['me@company.com'] });
    expect(clean).toBe(true);
  });

  test('finds multiple distinct PII items and sorts by position', () => {
    const { findings } = scanText('Email jane@example.com and SSN 219-09-9999 please.');
    expect(findings).toHaveLength(2);
    expect(findings[0].ruleId).toBe('email');
    expect(findings[1].ruleId).toBe('ssn');
  });
});

describe('minSeverity threshold', () => {
  const text = 'Email jane@example.com and SSN 219-09-9999 and call 415-555-0132';

  test('defaults to blocking on any severity', () => {
    const { findings } = scanText(text);
    expect(findings.map((f) => f.ruleId).sort()).toEqual(['email', 'phone', 'ssn'].sort());
  });

  test('minSeverity "medium" drops low-severity findings like phone numbers', () => {
    const { findings } = scanText(text, { minSeverity: 'medium' });
    expect(findings.some((f) => f.ruleId === 'phone')).toBe(false);
    expect(findings.some((f) => f.ruleId === 'ssn')).toBe(true);
    expect(findings.some((f) => f.ruleId === 'email')).toBe(true);
  });

  test('minSeverity "high" keeps only high-severity findings like SSNs', () => {
    const { findings } = scanText(text, { minSeverity: 'high' });
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe('ssn');
  });
});

describe('custom rules', () => {
  test('compileCustomRule builds a working rule from a valid pattern', () => {
    const rule = compileCustomRule({ id: 'empId', label: 'Employee ID', pattern: 'EMP-\\d{6}', severity: 'high' });
    expect(rule).not.toBeNull();
    expect(rule.custom).toBe(true);
  });

  test('compileCustomRule returns null for an invalid regular expression', () => {
    expect(compileCustomRule({ id: 'bad', label: 'Bad', pattern: '(unclosed' })).toBeNull();
  });

  test('scanText applies custom rules alongside built-in ones', () => {
    const { findings } = scanText('My badge is EMP-482913, see you there.', {
      customRules: [{ id: 'empId', label: 'Employee ID', pattern: 'EMP-\\d{6}', severity: 'high' }],
    });
    expect(findings.some((f) => f.ruleId === 'empId')).toBe(true);
  });

  test('an invalid custom rule is silently skipped rather than throwing', () => {
    expect(() =>
      scanText('hello world', { customRules: [{ id: 'bad', pattern: '(unclosed' }] })
    ).not.toThrow();
  });

  test('custom rules run even when enabledRuleIds omits their id', () => {
    const { findings } = scanText('EMP-482913', {
      enabledRuleIds: ['ssn'],
      customRules: [{ id: 'empId', label: 'Employee ID', pattern: 'EMP-\\d{6}', severity: 'high' }],
    });
    expect(findings.some((f) => f.ruleId === 'empId')).toBe(true);
  });

  test('custom rule severity is still subject to minSeverity filtering', () => {
    const { findings } = scanText('EMP-482913', {
      minSeverity: 'high',
      customRules: [{ id: 'empId', label: 'Employee ID', pattern: 'EMP-\\d{6}', severity: 'low' }],
    });
    expect(findings).toHaveLength(0);
  });
});

describe('redact', () => {
  test('replaces each finding with a bracketed placeholder', () => {
    const text = 'Contact jane@example.com now.';
    const { findings } = scanText(text);
    const redacted = redact(text, findings);
    expect(redacted).toBe('Contact [REDACTED:email] now.');
  });

  test('is a no-op when there are no findings', () => {
    expect(redact('hello world', [])).toBe('hello world');
  });
});
