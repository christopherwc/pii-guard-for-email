const { RULES } = require('./piiRules');

/**
 * Scans arbitrary text for PII according to the given rule set.
 *
 * @param {string} text - the text to scan (e.g. an email draft body + subject)
 * @param {Object} [options]
 * @param {Set<string>|string[]} [options.enabledRuleIds] - subset of rule ids to run;
 *        defaults to every rule in RULES.
 * @param {string[]} [options.ignoreList] - exact strings the user has explicitly
 *        allow-listed (e.g. their own email signature) that should never be flagged.
 * @returns {{ clean: boolean, findings: Array<{ruleId:string,label:string,severity:string,match:string,index:number}> }}
 */
function scanText(text, options = {}) {
  const enabled = options.enabledRuleIds
    ? new Set(options.enabledRuleIds)
    : null;
  const ignoreList = new Set(options.ignoreList || []);

  const findings = [];
  if (!text) {
    return { clean: true, findings };
  }

  for (const rule of RULES) {
    if (enabled && !enabled.has(rule.id)) continue;

    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const value = match[0];

      if (ignoreList.has(value)) continue;
      if (rule.validate && !rule.validate(value)) continue;

      findings.push({
        ruleId: rule.id,
        label: rule.label,
        severity: rule.severity,
        match: value,
        index: match.index,
      });

      // Guard against zero-length matches causing an infinite loop.
      if (match.index === pattern.lastIndex) pattern.lastIndex++;
    }
  }

  findings.sort((a, b) => a.index - b.index);

  return { clean: findings.length === 0, findings };
}

/**
 * Redacts flagged findings within text, replacing each match with a
 * bracketed placeholder naming the rule that caught it. Useful for
 * previewing what would need to change before the message can be sent.
 */
function redact(text, findings) {
  if (!findings || findings.length === 0) return text;
  const sorted = [...findings].sort((a, b) => b.index - a.index);
  let result = text;
  for (const finding of sorted) {
    const before = result.slice(0, finding.index);
    const after = result.slice(finding.index + finding.match.length);
    result = `${before}[REDACTED:${finding.ruleId}]${after}`;
  }
  return result;
}

module.exports = { scanText, redact };
