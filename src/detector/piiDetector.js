const { RULES, SEVERITY_ORDER } = require('./piiRules');

const VALID_SEVERITIES = new Set(['high', 'medium', 'low']);

/**
 * Compiles a user-defined custom rule ({id, label, pattern, flags, severity})
 * into the same shape as a built-in rule. Returns null if the pattern is not
 * a valid regular expression, so callers can skip it safely.
 */
function compileCustomRule(custom) {
  if (!custom || !custom.pattern) return null;
  let flags = custom.flags || '';
  if (!flags.includes('g')) flags += 'g';
  try {
    const pattern = new RegExp(custom.pattern, flags);
    const severity = VALID_SEVERITIES.has(custom.severity) ? custom.severity : 'medium';
    return {
      id: custom.id,
      label: custom.label || custom.pattern,
      severity,
      pattern,
      custom: true,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Scans arbitrary text for PII according to the given rule set.
 *
 * @param {string} text - the text to scan (e.g. an email draft body + subject)
 * @param {Object} [options]
 * @param {Set<string>|string[]} [options.enabledRuleIds] - subset of built-in rule
 *        ids to run; defaults to every rule in RULES. Custom rules always run
 *        regardless of this list (they have no separate on/off toggle - remove
 *        the rule itself to disable it).
 * @param {string[]} [options.ignoreList] - exact strings the user has explicitly
 *        allow-listed (e.g. their own email signature) that should never be flagged.
 * @param {Array} [options.customRules] - user-defined rules, each
 *        {id, label, pattern, flags, severity}, merged in alongside RULES.
 * @param {string} [options.minSeverity] - 'low' (default, block on anything),
 *        'medium', or 'high' - findings less severe than this are dropped.
 * @returns {{ clean: boolean, findings: Array<{ruleId:string,label:string,severity:string,match:string,index:number}> }}
 */
function scanText(text, options = {}) {
  const enabled = options.enabledRuleIds
    ? new Set(options.enabledRuleIds)
    : null;
  const ignoreList = new Set(options.ignoreList || []);
  const customRules = (options.customRules || []).map(compileCustomRule).filter(Boolean);
  const minRank = SEVERITY_ORDER[options.minSeverity] !== undefined
    ? SEVERITY_ORDER[options.minSeverity]
    : SEVERITY_ORDER.low;

  const findings = [];
  if (!text) {
    return { clean: true, findings };
  }

  for (const rule of [...RULES, ...customRules]) {
    if (enabled && !rule.custom && !enabled.has(rule.id)) continue;
    if (SEVERITY_ORDER[rule.severity] > minRank) continue;

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

module.exports = { scanText, redact, compileCustomRule };
