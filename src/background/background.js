const { defaultSettings, STORAGE_KEY } = require('../settings');

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({ [STORAGE_KEY]: defaultSettings() });
  }
});

const DEFAULT_TITLE = 'PII Guard';
const MISSING_SEND_BUTTON_TITLE =
  "PII Guard can't find the Send button on this page, so sends here aren't being checked. " +
  'Your Gmail/Outlook language or layout may not be supported yet.';

/**
 * Renders one tab's toolbar badge from the content script's status. The
 * badge is per tab so one mail tab's state never shows on another. An
 * unguarded compose ("!") takes priority over the live PII count.
 */
function setTabBadge(tabId, { count, sendButtonMissing }) {
  let text = '';
  if (sendButtonMissing) text = '!';
  else if (count > 0) text = String(count);

  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color: sendButtonMissing ? '#b06000' : '#b3261e' });
  chrome.action.setTitle({ tabId, title: sendButtonMissing ? MISSING_SEND_BUTTON_TITLE : DEFAULT_TITLE });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'PII_TAB_STATUS') {
    if (sender && sender.tab && sender.tab.id !== undefined) {
      setTabBadge(sender.tab.id, {
        count: message.count || 0,
        sendButtonMissing: !!message.sendButtonMissing,
      });
    }
    return false;
  }

  if (message && message.type === 'PII_BLOCKED') {
    chrome.storage.sync.get(STORAGE_KEY, (result) => {
      const settings = result[STORAGE_KEY] || defaultSettings();
      settings.blockedCount = (settings.blockedCount || 0) + 1;
      chrome.storage.sync.set({ [STORAGE_KEY]: settings }, () => {
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  return false;
});

module.exports = { setTabBadge };
