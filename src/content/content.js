const gmailAdapter = require('../adapters/gmailAdapter');
const outlookAdapter = require('../adapters/outlookAdapter');
const { scanDraft } = require('../detector/piiDetector');
const { createWarningDialog } = require('../ui/warningDialog');
const { loadSettings, buildScanOptions, isRecipientListTrusted } = require('../settings');

const ADAPTERS = [gmailAdapter, outlookAdapter];
const LIVE_SCAN_DEBOUNCE_MS = 400;
// How long a compose may sit without a recognizable Send button before the
// tab is flagged. Buttons often render a moment after the body does.
const MISSING_SEND_BUTTON_GRACE_MS = 3000;

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

  const parts = adapter.getComposeParts(composeContainer);
  const { clean, findings } = scanDraft(parts, buildScanOptions(currentSettings));
  return clean ? null : findings;
}

/** Adapter of the compose whose warning dialog is currently open, or null. */
let openDialogAdapter = null;

function showBlockDialog(findings, adapter, sendButton) {
  chrome.runtime.sendMessage({ type: 'PII_BLOCKED', count: findings.length });

  openDialogAdapter = adapter;
  createWarningDialog(document, findings, {
    // Without a Send button there's nothing to click, so the dialog shows a
    // note instead of a "Send anyway" button that would do nothing.
    onSendAnyway: sendButton
      ? () => {
        openDialogAdapter = null;
        confirmedButtons.add(sendButton);
        sendButton.click();
      }
      : undefined,
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

let lastLiveCount = 0;
/** Composes whose Send button still couldn't be found after the grace period. */
const composesMissingSendButton = new Set();
const missingSendButtonTimers = new Map();

/**
 * Sends this tab's badge state to the background: the live PII count, and
 * whether any open compose is unguarded because its Send button couldn't be
 * found (e.g. an unsupported UI language).
 */
function reportTabStatus() {
  chrome.runtime.sendMessage({
    type: 'PII_TAB_STATUS',
    count: lastLiveCount,
    sendButtonMissing: composesMissingSendButton.size > 0,
  });
}

/**
 * Tracks whether a compose has a Send button the guard could attach to. A
 * compose still without one after MISSING_SEND_BUTTON_GRACE_MS flags the tab,
 * so an unrecognized UI never fails silently.
 */
function trackSendButton(adapter, composeContainer, sendButton) {
  if (sendButton) {
    clearTimeout(missingSendButtonTimers.get(composeContainer));
    missingSendButtonTimers.delete(composeContainer);
    if (composesMissingSendButton.delete(composeContainer)) reportTabStatus();
    return;
  }
  if (missingSendButtonTimers.has(composeContainer) || composesMissingSendButton.has(composeContainer)) {
    return;
  }
  missingSendButtonTimers.set(
    composeContainer,
    setTimeout(() => {
      missingSendButtonTimers.delete(composeContainer);
      if (!composeContainer.isConnected || adapter.findSendButton(composeContainer)) return;
      composesMissingSendButton.add(composeContainer);
      reportTabStatus();
    }, MISSING_SEND_BUTTON_GRACE_MS)
  );
}

/** Drops closed composes from the missing-Send-button set, clearing the flag when none remain. */
function pruneClosedComposes() {
  let changed = false;
  for (const container of composesMissingSendButton) {
    if (!container.isConnected) {
      composesMissingSendButton.delete(container);
      changed = true;
    }
  }
  if (changed) reportTabStatus();
}

/** Scans the current draft text and reflects the result in the toolbar badge, debounced. */
function scheduleLiveScan(bodyEl, adapter, composeContainer) {
  clearTimeout(liveScanTimers.get(bodyEl));
  const timer = setTimeout(() => {
    if (!currentSettings || !currentSettings.guardEnabled || !currentSettings.liveScanEnabled) {
      lastLiveCount = 0;
    } else if (isFullyTrustedRecipients(adapter, composeContainer)) {
      lastLiveCount = 0;
    } else {
      const parts = adapter.getComposeParts(composeContainer);
      lastLiveCount = scanDraft(parts, buildScanOptions(currentSettings)).findings.length;
    }
    reportTabStatus();
  }, LIVE_SCAN_DEBOUNCE_MS);
  liveScanTimers.set(bodyEl, timer);
}

function attachLiveScan(bodyEl, adapter, composeContainer) {
  if (liveScanAttached.has(bodyEl)) return;
  liveScanAttached.add(bodyEl);
  bodyEl.addEventListener('input', () => scheduleLiveScan(bodyEl, adapter, composeContainer));
}

function scanForComposeWindows(adapter = pickAdapter(location.hostname)) {
  if (!adapter) return;
  pruneClosedComposes();

  const bodies = adapter.findComposeBodies(document);
  for (const body of bodies) {
    const container = adapter.findComposeContainer(body);
    if (!container) continue;

    const sendButton = adapter.findSendButton(container);
    if (sendButton) attachGuard(sendButton, adapter, container);
    trackSendButton(adapter, container, sendButton);
    registerCompose(adapter, container);

    attachLiveScan(body, adapter, container);
  }
}

function init() {
  const adapter = pickAdapter(location.hostname);
  if (!adapter) return;

  refreshSettings().then(() => scanForComposeWindows());

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
