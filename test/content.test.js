describe('content.js (no chrome global)', () => {
  test('module loads without a chrome global and skips init', () => {
    expect(() => require('../src/content/content')).not.toThrow();
  });
});

describe('pickAdapter', () => {
  const { pickAdapter } = require('../src/content/content');

  test('selects the Gmail adapter for mail.google.com', () => {
    expect(pickAdapter('mail.google.com').id).toBe('gmail');
  });

  test('selects the Outlook adapter for outlook.office.com and outlook.live.com', () => {
    expect(pickAdapter('outlook.office.com').id).toBe('outlook');
    expect(pickAdapter('outlook.live.com').id).toBe('outlook');
  });

  test('returns null for unrelated hostnames', () => {
    expect(pickAdapter('example.com')).toBeNull();
  });
});

describe('live scan + trusted recipients', () => {
  let content;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    global.chrome = {
      storage: {
        sync: { get: jest.fn(), set: jest.fn() },
        onChanged: { addListener: jest.fn() },
      },
      runtime: { sendMessage: jest.fn() },
    };
    content = require('../src/content/content');
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.chrome;
  });

  function loadSettingsInto(overrides) {
    const { defaultSettings } = require('../src/settings');
    const settings = { ...defaultSettings(), ...overrides };
    global.chrome.storage.sync.get.mockImplementation((key, cb) => cb({ piiGuardSettings: settings }));
    return content.refreshSettings();
  }

  test('scheduleLiveScan reports a debounced PII count for the current draft', async () => {
    await loadSettingsInto({});
    const adapter = { getComposeText: () => 'ssn 219-09-9999', getRecipients: () => [] };

    content.scheduleLiveScan({}, adapter, {});
    jest.advanceTimersByTime(399);
    expect(global.chrome.runtime.sendMessage).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'PII_LIVE_COUNT', count: 1 });
  });

  test('scheduleLiveScan debounces rapid successive calls to a single message', async () => {
    await loadSettingsInto({});
    const adapter = { getComposeText: () => 'clean text', getRecipients: () => [] };
    const bodyEl = {};

    content.scheduleLiveScan(bodyEl, adapter, {});
    jest.advanceTimersByTime(200);
    content.scheduleLiveScan(bodyEl, adapter, {});
    jest.advanceTimersByTime(399);
    expect(global.chrome.runtime.sendMessage).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(global.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  test('scheduleLiveScan reports zero when live scanning is disabled', async () => {
    await loadSettingsInto({ liveScanEnabled: false });
    const adapter = { getComposeText: () => 'ssn 219-09-9999', getRecipients: () => [] };

    content.scheduleLiveScan({}, adapter, {});
    jest.advanceTimersByTime(400);
    expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'PII_LIVE_COUNT', count: 0 });
  });

  test('isFullyTrustedRecipients is true only when trusted domains are configured and all recipients match', async () => {
    await loadSettingsInto({ trustedDomains: ['company.com'] });
    const trustedAdapter = { getRecipients: () => ['a@company.com', 'b@company.com'] };
    const untrustedAdapter = { getRecipients: () => ['a@company.com', 'b@gmail.com'] };

    expect(content.isFullyTrustedRecipients(trustedAdapter, {})).toBe(true);
    expect(content.isFullyTrustedRecipients(untrustedAdapter, {})).toBe(false);
  });

  test('scheduleLiveScan reports zero when recipients are fully trusted', async () => {
    await loadSettingsInto({ trustedDomains: ['company.com'] });
    const adapter = {
      getComposeText: () => 'ssn 219-09-9999',
      getRecipients: () => ['a@company.com'],
    };

    content.scheduleLiveScan({}, adapter, {});
    jest.advanceTimersByTime(400);
    expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'PII_LIVE_COUNT', count: 0 });
  });
});
