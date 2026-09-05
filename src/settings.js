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
    customRules: [],
    minSeverity: 'low',
    trustedDomains: [],
    liveScanEnabled: true,
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
    customRules: Array.isArray(stored.customRules) ? stored.customRules : defaults.customRules,
    trustedDomains: Array.isArray(stored.trustedDomains)
      ? stored.trustedDomains
      : defaults.trustedDomains,
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

/** Builds the options object piiDetector.scanText() expects from stored settings. */
function buildScanOptions(settings) {
  return {
    enabledRuleIds: enabledRuleIdsArray(settings),
    ignoreList: settings.ignoreList,
    customRules: settings.customRules || [],
    minSeverity: settings.minSeverity || 'low',
  };
}

/**
 * Returns true only when every recipient's email domain matches (or is a
 * subdomain of) one of the trusted domains. An empty recipient list or
 * empty trusted-domain list is never considered trusted, since that would
 * silently disable scanning for everyone.
 */
function isRecipientListTrusted(recipients, trustedDomains) {
  if (!recipients || recipients.length === 0) return false;
  if (!trustedDomains || trustedDomains.length === 0) return false;

  const normalizedTrusted = trustedDomains
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (normalizedTrusted.length === 0) return false;

  return recipients.every((email) => {
    const domain = (email.split('@')[1] || '').toLowerCase();
    if (!domain) return false;
    return normalizedTrusted.some((t) => domain === t || domain.endsWith(`.${t}`));
  });
}

module.exports = {
  STORAGE_KEY,
  defaultSettings,
  normalizeSettings,
  loadSettings,
  saveSettings,
  enabledRuleIdsArray,
  buildScanOptions,
  isRecipientListTrusted,
};
