const gmailAdapter = require('../adapters/gmailAdapter');
const outlookAdapter = require('../adapters/outlookAdapter');
const { scanText } = require('../detector/piiDetector');
const { createWarningDialog } = require('../ui/warningDialog');
const { loadSettings, buildScanOptions, isRecipientListTrusted } = require('../settings');

const ADAPTERS = [gmailAdapter, outlookAdapter];
const LIVE_SCAN_DEBOUNCE_MS = 400;

function pickAdapter(hostname) {
  return ADAPTERS.find((a) => a.hostnames.some((h) => hostname.endsWith(h))) || null;
}

const confirmedButtons = new WeakSet();
const guardedButtons = new WeakSet();
const liveScanAttached = new WeakSet();
const liveScanTimers = new WeakMap();

let currentSettings = null;

function refreshSettings() {
  return loadSettings(chrome.storage.sync).then((settings) => {
    currentSettings = settings;
    return settings;
  });
}

/** True when every recipient on this compose is inside a trusted domain. */
function isFullyTrustedRecipients(adapter, composeContainer) {
  if (!currentSettings.trustedDomains || currentSettings.trustedDomains.length === 0) {
    return false;
  }
  const recipients = adapter.getRecipients(composeContainer);
  return isRecipientListTrusted(recipients, currentSettings.trustedDomains);
}

function attachGuard(sendButton, adapter, composeContainer) {
  if (guardedButtons.has(sendButton)) return;
  guardedButtons.add(sendButton);

  sendButton.addEventListener(
    'click',
    (event) => {
      if (confirmedButtons.has(sendButton)) {
        confirmedButtons.delete(sendButton);
        return;
      }
      if (!currentSettings || !currentSettings.guardEnabled) return;
      if (isFullyTrustedRecipients(adapter, composeContainer)) return;

      const text = adapter.getComposeText(composeContainer);
      const { clean, findings } = scanText(text, buildScanOptions(currentSettings));

      if (clean) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      chrome.runtime.sendMessage({ type: 'PII_BLOCKED', count: findings.length });

      createWarningDialog(document, findings, {
        onSendAnyway: () => {
          confirmedButtons.add(sendButton);
          sendButton.click();
        },
        onEditDraft: () => {},
      });
    },
    true
  );
}

/** Scans the current draft text and reflects the result in the toolbar badge, debounced. */
function scheduleLiveScan(bodyEl, adapter, composeContainer) {
  clearTimeout(liveScanTimers.get(bodyEl));
  const timer = setTimeout(() => {
    if (!currentSettings || !currentSettings.guardEnabled || !currentSettings.liveScanEnabled) {
      chrome.runtime.sendMessage({ type: 'PII_LIVE_COUNT', count: 0 });
      return;
    }
    if (isFullyTrustedRecipients(adapter, composeContainer)) {
      chrome.runtime.sendMessage({ type: 'PII_LIVE_COUNT', count: 0 });
      return;
    }
    const text = adapter.getComposeText(composeContainer);
    const { findings } = scanText(text, buildScanOptions(currentSettings));
    chrome.runtime.sendMessage({ type: 'PII_LIVE_COUNT', count: findings.length });
  }, LIVE_SCAN_DEBOUNCE_MS);
  liveScanTimers.set(bodyEl, timer);
}

function attachLiveScan(bodyEl, adapter, composeContainer) {
  if (liveScanAttached.has(bodyEl)) return;
  liveScanAttached.add(bodyEl);
  bodyEl.addEventListener('input', () => scheduleLiveScan(bodyEl, adapter, composeContainer));
}

function scanForComposeWindows() {
  const adapter = pickAdapter(location.hostname);
  if (!adapter) return;

  const bodies = adapter.findComposeBodies(document);
  for (const body of bodies) {
    const container = adapter.findComposeContainer(body);
    if (!container) continue;

    const sendButton = adapter.findSendButton(container);
    if (sendButton) attachGuard(sendButton, adapter, container);

    attachLiveScan(body, adapter, container);
  }
}

function init() {
  const adapter = pickAdapter(location.hostname);
  if (!adapter) return;

  refreshSettings().then(scanForComposeWindows);

  const observer = new MutationObserver(() => scanForComposeWindows());
  observer.observe(document.body, { childList: true, subtree: true });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') refreshSettings();
  });
}

if (typeof document !== 'undefined' && typeof chrome !== 'undefined') {
  init();
}

module.exports = {
  pickAdapter,
  attachGuard,
  scanForComposeWindows,
  scheduleLiveScan,
  attachLiveScan,
  isFullyTrustedRecipients,
  refreshSettings,
};
