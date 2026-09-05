const gmailAdapter = require('../adapters/gmailAdapter');
const outlookAdapter = require('../adapters/outlookAdapter');
const { scanText } = require('../detector/piiDetector');
const { createWarningDialog } = require('../ui/warningDialog');
const { loadSettings, enabledRuleIdsArray } = require('../settings');

const ADAPTERS = [gmailAdapter, outlookAdapter];

function pickAdapter(hostname) {
  return ADAPTERS.find((a) => a.hostnames.some((h) => hostname.endsWith(h))) || null;
}

const confirmedButtons = new WeakSet();
const guardedButtons = new WeakSet();

let currentSettings = null;

function refreshSettings() {
  return loadSettings(chrome.storage.sync).then((settings) => {
    currentSettings = settings;
    return settings;
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
      if (!currentSettings || !currentSettings.guardEnabled) return;

      const text = adapter.getComposeText(composeContainer);
      const { clean, findings } = scanText(text, {
        enabledRuleIds: enabledRuleIdsArray(currentSettings),
        ignoreList: currentSettings.ignoreList,
      });

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

function scanForComposeWindows() {
  const adapter = pickAdapter(location.hostname);
  if (!adapter) return;

  const bodies = adapter.findComposeBodies(document);
  for (const body of bodies) {
    const container = adapter.findComposeContainer(body);
    if (!container) continue;
    const sendButton = adapter.findSendButton(container);
    if (sendButton) attachGuard(sendButton, adapter, container);
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

module.exports = { pickAdapter, attachGuard, scanForComposeWindows };
