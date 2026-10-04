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

/**
 * Decides whether sending this compose should be blocked. Returns the
 * findings to show the user, or null if the send may go ahead. Shared by the
 * Send-button and keyboard-shortcut paths so the two can never disagree.
 */
function getBlockingFindings(adapter, composeContainer) {
  if (!currentSettings || !currentSettings.guardEnabled) return null;
  if (isFullyTrustedRecipients(adapter, composeContainer)) return null;

  const text = adapter.getComposeText(composeContainer);
  const { clean, findings } = scanText(text, buildScanOptions(currentSettings));
  return clean ? null : findings;
}

/** Adapter of the compose whose warning dialog is currently open, or null. */
let openDialogAdapter = null;

function showBlockDialog(findings, adapter, sendButton) {
  chrome.runtime.sendMessage({ type: 'PII_BLOCKED', count: findings.length });

  openDialogAdapter = adapter;
  createWarningDialog(document, findings, {
    onSendAnyway: () => {
      openDialogAdapter = null;
      if (!sendButton) return;
      confirmedButtons.add(sendButton);
      sendButton.click();
    },
    onEditDraft: () => {
      openDialogAdapter = null;
    },
  });
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
      const findings = getBlockingFindings(adapter, composeContainer);
      if (!findings) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      showBlockDialog(findings, adapter, sendButton);
    },
    true
  );
}

/** Every compose currently guarded, so keyboard shortcuts can be traced back to one. */
const guardedComposes = new Set();

function registerCompose(adapter, composeContainer) {
  for (const entry of guardedComposes) {
    if (entry.container === composeContainer) return;
  }
  guardedComposes.add({ adapter, container: composeContainer });
}

function findComposeFor(target) {
  for (const entry of guardedComposes) {
    if (!entry.container.isConnected) {
      guardedComposes.delete(entry);
      continue;
    }
    if (target && entry.container.contains(target)) return entry;
  }
  return null;
}

function blockEvent(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

/**
 * Window-level capture-phase keydown handler that intercepts the provider's
 * keyboard send shortcut (Ctrl/Cmd+Enter, and Alt+S in Outlook), which would
 * otherwise send the draft without ever clicking the guarded Send button.
 */
function handleKeydown(event) {
  // While the warning is up, focus is on the dialog, outside any compose -
  // swallow the shortcut so it can't reach the page and send underneath it.
  if (openDialogAdapter) {
    if (openDialogAdapter.isSendShortcut(event)) blockEvent(event);
    return;
  }

  const compose = findComposeFor(event.target);
  if (!compose || !compose.adapter.isSendShortcut(event)) return;

  const findings = getBlockingFindings(compose.adapter, compose.container);
  if (!findings) return;

  blockEvent(event);
  if (event.repeat) return;

  const sendButton = compose.adapter.findSendButton(compose.container);
  if (sendButton) attachGuard(sendButton, compose.adapter, compose.container);
  showBlockDialog(findings, compose.adapter, sendButton);
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
    registerCompose(adapter, container);

    attachLiveScan(body, adapter, container);
  }
}

function init() {
  const adapter = pickAdapter(location.hostname);
  if (!adapter) return;

  refreshSettings().then(scanForComposeWindows);

  window.addEventListener('keydown', handleKeydown, true);

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
  getBlockingFindings,
  handleKeydown,
  registerCompose,
  scanForComposeWindows,
  scheduleLiveScan,
  attachLiveScan,
  isFullyTrustedRecipients,
  refreshSettings,
};
