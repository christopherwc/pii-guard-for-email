const { defaultSettings } = require('../settings');
const { STORAGE_KEY } = require('../settings');

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({ [STORAGE_KEY]: defaultSettings() });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'PII_BLOCKED') {
    chrome.storage.sync.get(STORAGE_KEY, (result) => {
      const settings = result[STORAGE_KEY] || defaultSettings();
      settings.blockedCount = (settings.blockedCount || 0) + 1;
      chrome.storage.sync.set({ [STORAGE_KEY]: settings }, () => {
        chrome.action.setBadgeText({ text: String(settings.blockedCount) });
        chrome.action.setBadgeBackgroundColor({ color: '#b3261e' });
        sendResponse({ ok: true });
      });
    });
    return true;
  }
  return false;
});
