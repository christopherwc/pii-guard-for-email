const {
  defaultSettings,
  normalizeSettings,
  loadSettings,
  saveSettings,
  enabledRuleIdsArray,
  buildScanOptions,
  isRecipientListTrusted,
  STORAGE_KEY,
} = require('../src/settings');
const { RULES } = require('../src/detector/piiRules');

function fakeStorageArea(initial = {}) {
  let store = { ...initial };
  return {
    get(key, cb) {
      cb({ [key]: store[key] });
    },
    set(obj, cb) {
      store = { ...store, ...obj };
      if (cb) cb();
    },
  };
}

describe('defaultSettings', () => {
  test('enables every known rule by default', () => {
    const settings = defaultSettings();
    for (const rule of RULES) {
      expect(settings.enabledRuleIds[rule.id]).toBe(true);
    }
    expect(settings.guardEnabled).toBe(true);
    expect(settings.ignoreList).toEqual([]);
    expect(settings.blockedCount).toBe(0);
  });
});

describe('normalizeSettings', () => {
  test('returns defaults when nothing is stored', () => {
    expect(normalizeSettings(undefined)).toEqual(defaultSettings());
  });

  test('fills in newly added rules as enabled while preserving existing choices', () => {
    const stored = { guardEnabled: false, enabledRuleIds: { email: false }, ignoreList: ['a@b.com'] };
    const normalized = normalizeSettings(stored);
    expect(normalized.guardEnabled).toBe(false);
    expect(normalized.enabledRuleIds.email).toBe(false);
    expect(normalized.enabledRuleIds.ssn).toBe(true);
    expect(normalized.ignoreList).toEqual(['a@b.com']);
  });
});

describe('loadSettings / saveSettings', () => {
  test('round-trips settings through a storage area', async () => {
    const area = fakeStorageArea();
    const settings = defaultSettings();
    settings.ignoreList = ['me@company.com'];

    await saveSettings(area, settings);
    const loaded = await loadSettings(area);

    expect(loaded.ignoreList).toEqual(['me@company.com']);
  });

  test('loadSettings normalizes missing data to defaults', async () => {
    const area = fakeStorageArea();
    const loaded = await loadSettings(area);
    expect(loaded).toEqual(defaultSettings());
  });
});

describe('enabledRuleIdsArray', () => {
  test('returns only ids whose flag is true', () => {
    const settings = defaultSettings();
    settings.enabledRuleIds.phone = false;
    const ids = enabledRuleIdsArray(settings);
    expect(ids).not.toContain('phone');
    expect(ids).toContain('email');
  });
});

describe('buildScanOptions', () => {
  test('reflects enabled rules, ignore list, custom rules, and severity threshold', () => {
    const settings = defaultSettings();
    settings.enabledRuleIds.phone = false;
    settings.ignoreList = ['me@company.com'];
    settings.customRules = [{ id: 'x', label: 'X', pattern: 'X', severity: 'high' }];
    settings.minSeverity = 'medium';

    const options = buildScanOptions(settings);
    expect(options.enabledRuleIds).not.toContain('phone');
    expect(options.ignoreList).toEqual(['me@company.com']);
    expect(options.customRules).toEqual(settings.customRules);
    expect(options.minSeverity).toBe('medium');
  });
});

describe('isRecipientListTrusted', () => {
  test('is false when there are no recipients', () => {
    expect(isRecipientListTrusted([], ['company.com'])).toBe(false);
  });

  test('is false when there are no trusted domains configured', () => {
    expect(isRecipientListTrusted(['a@company.com'], [])).toBe(false);
  });

  test('is true when every recipient matches a trusted domain', () => {
    expect(isRecipientListTrusted(['a@company.com', 'b@company.com'], ['company.com'])).toBe(true);
  });

  test('is true for a subdomain of a trusted domain', () => {
    expect(isRecipientListTrusted(['a@eu.company.com'], ['company.com'])).toBe(true);
  });

  test('is false when even one recipient is outside the trusted domains', () => {
    expect(isRecipientListTrusted(['a@company.com', 'b@gmail.com'], ['company.com'])).toBe(false);
  });

  test('domain matching is case-insensitive', () => {
    expect(isRecipientListTrusted(['a@Company.COM'], ['company.com'])).toBe(true);
  });

  test('does not treat a lookalike domain as trusted (e.g. evilcompany.com vs company.com)', () => {
    expect(isRecipientListTrusted(['a@evilcompany.com'], ['company.com'])).toBe(false);
  });
});

test('STORAGE_KEY is a stable, non-empty string', () => {
  expect(typeof STORAGE_KEY).toBe('string');
  expect(STORAGE_KEY.length).toBeGreaterThan(0);
});
