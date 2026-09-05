const { defaultSettings, STORAGE_KEY } = require('../settings');

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({ [STORAGE_KEY]: defaultSettings() });
  }
});

function setLiveBadge(count) {
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#b3261e' });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'PII_LIVE_COUNT') {
    setLiveBadge(message.count || 0);
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
