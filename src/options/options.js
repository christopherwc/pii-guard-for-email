const { RULES } = require('../detector/piiRules');
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

function init() {
  const ruleListEl = document.getElementById('ruleList');
  const ignoreListEl = document.getElementById('ignoreList');
  const saveIgnoreListBtn = document.getElementById('saveIgnoreList');
  const blockedCountEl = document.getElementById('blockedCount');
  const resetStatsBtn = document.getElementById('resetStats');

  loadSettings(chrome.storage.sync).then((settings) => {
    ignoreListEl.value = settings.ignoreList.join('\n');
    blockedCountEl.textContent = String(settings.blockedCount || 0);

    renderRuleList(ruleListEl, settings, (ruleId, checked) => {
      settings.enabledRuleIds[ruleId] = checked;
      saveSettings(chrome.storage.sync, settings).then(showSavedNote);
    });

    saveIgnoreListBtn.addEventListener('click', () => {
      settings.ignoreList = ignoreListEl.value
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
