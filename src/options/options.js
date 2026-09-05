const { RULES } = require('../detector/piiRules');
const { compileCustomRule } = require('../detector/piiDetector');
const { loadSettings, saveSettings } = require('../settings');

function showSavedNote() {
  const note = document.getElementById('savedNote');
  note.hidden = false;
  setTimeout(() => {
    note.hidden = true;
  }, 1500);
}

function renderRuleList(container, settings, onToggle) {
  container.innerHTML = '';
  for (const rule of RULES) {
    const li = document.createElement('li');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `opt-rule-${rule.id}`;
    checkbox.checked = !!settings.enabledRuleIds[rule.id];
    checkbox.addEventListener('change', () => onToggle(rule.id, checkbox.checked));

    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.textContent = `${rule.label} (${rule.severity} severity)`;

    li.appendChild(checkbox);
    li.appendChild(label);
    container.appendChild(li);
  }
}

function renderCustomRuleList(container, settings, onDelete) {
  container.innerHTML = '';
  if (settings.customRules.length === 0) {
    const li = document.createElement('li');
    li.className = 'opt-custom-rule-empty';
    li.textContent = 'No custom rules yet.';
    container.appendChild(li);
    return;
  }
  for (const rule of settings.customRules) {
    const li = document.createElement('li');
    li.className = 'opt-custom-rule-item';

    const text = document.createElement('span');
    text.textContent = `${rule.label} — /${rule.pattern}/ (${rule.severity})`;

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'opt-btn opt-btn-secondary opt-btn-small';
    deleteBtn.textContent = 'Remove';
    deleteBtn.addEventListener('click', () => onDelete(rule.id));

    li.appendChild(text);
    li.appendChild(deleteBtn);
    container.appendChild(li);
  }
}

function init() {
  const ruleListEl = document.getElementById('ruleList');
  const minSeverityEl = document.getElementById('minSeverity');
  const liveScanEnabledEl = document.getElementById('liveScanEnabled');
  const customRuleListEl = document.getElementById('customRuleList');
  const customRuleLabelEl = document.getElementById('customRuleLabel');
  const customRulePatternEl = document.getElementById('customRulePattern');
  const customRuleSeverityEl = document.getElementById('customRuleSeverity');
  const addCustomRuleBtn = document.getElementById('addCustomRule');
  const customRuleErrorEl = document.getElementById('customRuleError');
  const ignoreListEl = document.getElementById('ignoreList');
  const saveIgnoreListBtn = document.getElementById('saveIgnoreList');
  const trustedDomainsEl = document.getElementById('trustedDomains');
  const saveTrustedDomainsBtn = document.getElementById('saveTrustedDomains');
  const blockedCountEl = document.getElementById('blockedCount');
  const resetStatsBtn = document.getElementById('resetStats');

  loadSettings(chrome.storage.sync).then((settings) => {
    ignoreListEl.value = settings.ignoreList.join('\n');
    trustedDomainsEl.value = settings.trustedDomains.join('\n');
    blockedCountEl.textContent = String(settings.blockedCount || 0);
    minSeverityEl.value = settings.minSeverity;
    liveScanEnabledEl.checked = settings.liveScanEnabled;

    renderRuleList(ruleListEl, settings, (ruleId, checked) => {
      settings.enabledRuleIds[ruleId] = checked;
      saveSettings(chrome.storage.sync, settings).then(showSavedNote);
    });

    function onDeleteCustomRule(ruleId) {
      settings.customRules = settings.customRules.filter((r) => r.id !== ruleId);
      renderCustomRuleList(customRuleListEl, settings, onDeleteCustomRule);
      saveSettings(chrome.storage.sync, settings).then(showSavedNote);
    }

    renderCustomRuleList(customRuleListEl, settings, onDeleteCustomRule);

    minSeverityEl.addEventListener('change', () => {
      settings.minSeverity = minSeverityEl.value;
      saveSettings(chrome.storage.sync, settings).then(showSavedNote);
    });

    liveScanEnabledEl.addEventListener('change', () => {
      settings.liveScanEnabled = liveScanEnabledEl.checked;
      saveSettings(chrome.storage.sync, settings).then(showSavedNote);
    });

    addCustomRuleBtn.addEventListener('click', () => {
      customRuleErrorEl.hidden = true;
      const label = customRuleLabelEl.value.trim();
      const pattern = customRulePatternEl.value.trim();
      const severity = customRuleSeverityEl.value;

      if (!label || !pattern) {
        customRuleErrorEl.textContent = 'Both a label and a pattern are required.';
        customRuleErrorEl.hidden = false;
        return;
      }

      const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const candidate = { id, label, pattern, severity };

      if (!compileCustomRule(candidate)) {
        customRuleErrorEl.textContent = 'That pattern is not a valid regular expression.';
        customRuleErrorEl.hidden = false;
        return;
      }

      settings.customRules.push(candidate);
      customRuleLabelEl.value = '';
      customRulePatternEl.value = '';
      renderCustomRuleList(customRuleListEl, settings, onDeleteCustomRule);
      saveSettings(chrome.storage.sync, settings).then(showSavedNote);
    });

    saveIgnoreListBtn.addEventListener('click', () => {
      settings.ignoreList = ignoreListEl.value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      saveSettings(chrome.storage.sync, settings).then(showSavedNote);
    });

    saveTrustedDomainsBtn.addEventListener('click', () => {
      settings.trustedDomains = trustedDomainsEl.value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      saveSettings(chrome.storage.sync, settings).then(showSavedNote);
    });

    resetStatsBtn.addEventListener('click', () => {
      settings.blockedCount = 0;
      blockedCountEl.textContent = '0';
      saveSettings(chrome.storage.sync, settings).then(() => {
        chrome.action.setBadgeText({ text: '' });
        showSavedNote();
      });
    });
  });
}

document.addEventListener('DOMContentLoaded', init);
