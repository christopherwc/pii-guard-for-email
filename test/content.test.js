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

describe('keyboard send shortcut guard', () => {
  let content;
  let gmailAdapter;

  beforeEach(() => {
    jest.resetModules();
    global.chrome = {
      storage: {
        sync: { get: jest.fn(), set: jest.fn() },
        onChanged: { addListener: jest.fn() },
      },
      runtime: { sendMessage: jest.fn() },
    };
    content = require('../src/content/content');
    gmailAdapter = require('../src/adapters/gmailAdapter');
    window.addEventListener('keydown', content.handleKeydown, true);
  });

  afterEach(() => {
    window.removeEventListener('keydown', content.handleKeydown, true);
    document.body.innerHTML = '';
    delete global.chrome;
  });

  function loadSettingsInto(overrides) {
    const { defaultSettings } = require('../src/settings');
    const settings = { ...defaultSettings(), ...overrides };
    global.chrome.storage.sync.get.mockImplementation((key, cb) => cb({ piiGuardSettings: settings }));
    return content.refreshSettings();
  }

  function buildGmailCompose(body, recipients = []) {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    for (const email of recipients) {
      const chip = document.createElement('span');
      chip.setAttribute('email', email);
      dialog.appendChild(chip);
    }
    const bodyDiv = document.createElement('div');
    bodyDiv.setAttribute('aria-label', 'Message Body');
    bodyDiv.setAttribute('contenteditable', 'true');
    Object.defineProperty(bodyDiv, 'innerText', { value: body, configurable: true });
    dialog.appendChild(bodyDiv);
    const sendBtn = document.createElement('div');
    sendBtn.setAttribute('role', 'button');
    sendBtn.setAttribute('aria-label', 'Send');
    dialog.appendChild(sendBtn);
    document.body.appendChild(dialog);
    content.registerCompose(gmailAdapter, dialog);
    return { dialog, bodyDiv, sendBtn };
  }

  function pressCtrlEnter(target, init = {}) {
    const event = new KeyboardEvent('keydown', {
      key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true, ...init,
    });
    target.dispatchEvent(event);
    return event;
  }

  const overlays = () => document.querySelectorAll('.pii-guard-overlay');

  test('blocks Ctrl+Enter and shows the warning when the draft contains PII', async () => {
    await loadSettingsInto({});
    const { bodyDiv } = buildGmailCompose('ssn 219-09-9999');

    const event = pressCtrlEnter(bodyDiv);
    expect(event.defaultPrevented).toBe(true);
    expect(overlays()).toHaveLength(1);
    expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'PII_BLOCKED', count: 1 });
  });

  test('lets Ctrl+Enter through for a clean draft', async () => {
    await loadSettingsInto({});
    const { bodyDiv } = buildGmailCompose('see you tomorrow');

    expect(pressCtrlEnter(bodyDiv).defaultPrevented).toBe(false);
    expect(overlays()).toHaveLength(0);
  });

  test('lets Ctrl+Enter through when every recipient is trusted', async () => {
    await loadSettingsInto({ trustedDomains: ['company.com'] });
    const { bodyDiv } = buildGmailCompose('ssn 219-09-9999', ['a@company.com']);

    expect(pressCtrlEnter(bodyDiv).defaultPrevented).toBe(false);
  });

  test('ignores keys that are not the provider send shortcut', async () => {
    await loadSettingsInto({});
    const { bodyDiv } = buildGmailCompose('ssn 219-09-9999');

    const altS = new KeyboardEvent('keydown', {
      key: 's', code: 'KeyS', altKey: true, bubbles: true, cancelable: true,
    });
    bodyDiv.dispatchEvent(altS);
    expect(altS.defaultPrevented).toBe(false);
    expect(overlays()).toHaveLength(0);
  });

  test('swallows further shortcuts while the dialog is open without stacking dialogs', async () => {
    await loadSettingsInto({});
    const { bodyDiv } = buildGmailCompose('ssn 219-09-9999');

    pressCtrlEnter(bodyDiv);
    expect(pressCtrlEnter(document.activeElement).defaultPrevented).toBe(true);
    expect(pressCtrlEnter(bodyDiv, { repeat: true }).defaultPrevented).toBe(true);
    expect(overlays()).toHaveLength(1);
  });

  test('"Send anyway" clicks the Send button and the click goes through unblocked', async () => {
    await loadSettingsInto({});
    const { bodyDiv, sendBtn } = buildGmailCompose('ssn 219-09-9999');
    const pageSendHandler = jest.fn();
    sendBtn.addEventListener('click', pageSendHandler);

    pressCtrlEnter(bodyDiv);
    document.querySelector('.pii-guard-btn-danger').click();

    expect(pageSendHandler).toHaveBeenCalledTimes(1);
    expect(overlays()).toHaveLength(0);
  });

  test('"Go back and edit" closes the dialog and re-arms the shortcut guard', async () => {
    await loadSettingsInto({});
    const { bodyDiv } = buildGmailCompose('ssn 219-09-9999');

    pressCtrlEnter(bodyDiv);
    document.querySelector('.pii-guard-btn-primary').click();
    expect(overlays()).toHaveLength(0);

    expect(pressCtrlEnter(bodyDiv).defaultPrevented).toBe(true);
    expect(overlays()).toHaveLength(1);
  });
});
