const { RULES } = require('../detector/piiRules');
const { loadSettings, saveSettings } = require('../settings');

function renderRuleList(container, settings, onToggle) {
  container.innerHTML = '';
  for (const rule of RULES) {
    const li = document.createElement('li');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `rule-${rule.id}`;
    checkbox.checked = !!settings.enabledRuleIds[rule.id];
    checkbox.addEventListener('change', () => onToggle(rule.id, checkbox.checked));

    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.textContent = rule.label;

    li.appendChild(checkbox);
    li.appendChild(label);
    container.appendChild(li);
  }
}

function init() {
  const guardEnabledEl = document.getElementById('guardEnabled');
  const blockedCountEl = document.getElementById('blockedCount');
  const ruleListEl = document.getElementById('ruleList');
  const openOptionsBtn = document.getElementById('openOptions');

  loadSettings(chrome.storage.sync).then((settings) => {
    guardEnabledEl.checked = settings.guardEnabled;
    blockedCountEl.textContent = String(settings.blockedCount || 0);
    renderRuleList(ruleListEl, settings, (ruleId, checked) => {
      settings.enabledRuleIds[ruleId] = checked;
      saveSettings(chrome.storage.sync, settings);
    });

    guardEnabledEl.addEventListener('change', () => {
      settings.guardEnabled = guardEnabledEl.checked;
      saveSettings(chrome.storage.sync, settings);
    });
  });

  openOptionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

document.addEventListener('DOMContentLoaded', init);
