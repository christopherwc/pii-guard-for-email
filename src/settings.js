const { RULES } = require('./detector/piiRules');

const STORAGE_KEY = 'piiGuardSettings';

function defaultSettings() {
  const enabledRuleIds = {};
  for (const rule of RULES) enabledRuleIds[rule.id] = true;
  return {
    guardEnabled: true,
    enabledRuleIds,
    ignoreList: [],
    blockedCount: 0,
  };
}

/** Merges stored settings over the defaults so newly added rules default on. */
function normalizeSettings(stored) {
  const defaults = defaultSettings();
  if (!stored) return defaults;
  return {
    ...defaults,
    ...stored,
    enabledRuleIds: { ...defaults.enabledRuleIds, ...(stored.enabledRuleIds || {}) },
    ignoreList: Array.isArray(stored.ignoreList) ? stored.ignoreList : defaults.ignoreList,
  };
}

function loadSettings(storageArea) {
  return new Promise((resolve) => {
    storageArea.get(STORAGE_KEY, (result) => {
      resolve(normalizeSettings(result[STORAGE_KEY]));
    });
  });
}

function saveSettings(storageArea, settings) {
  return new Promise((resolve) => {
    storageArea.set({ [STORAGE_KEY]: settings }, resolve);
  });
}

/** Converts stored settings into the enabledRuleIds array shape scanText() expects. */
function enabledRuleIdsArray(settings) {
  return Object.keys(settings.enabledRuleIds).filter((id) => settings.enabledRuleIds[id]);
}

module.exports = {
  STORAGE_KEY,
  defaultSettings,
  normalizeSettings,
  loadSettings,
  saveSettings,
  enabledRuleIdsArray,
};
