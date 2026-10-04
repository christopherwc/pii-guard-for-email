/**
 * Localized accessible-name labels the adapters match against, for UI
 * elements that have no language-independent attribute to key off.
 *
 * Best-effort: these are common translations, not strings verified against
 * every Gmail/Outlook locale. When a locale isn't covered, the content script
 * flags the tab (toolbar badge "!") instead of failing silently - see
 * reportMissingSendButtons() in content.js.
 */

/**
 * Prefixes for the Send button's accessible name. Matched case-insensitively
 * with startsWith, so "send" also covers German "Senden" and Danish/Norwegian
 * "Send".
 */
const SEND_LABEL_PREFIXES = [
  'send', // en, de, da, nb
  'enviar', // es, pt
  'envoyer', // fr
  'invia', // it
  'verzenden', // nl
  'skicka', // sv
  'wyślij', // pl
  '送信', // ja
  '发送', // zh-CN
  '傳送', // zh-TW
  '보내기', // ko
];

/**
 * Words that appear in the subject field's aria-label ("Add a subject",
 * "Betreff hinzufügen", "Ajouter un objet", ...). Matched as
 * case-insensitive substrings.
 */
const SUBJECT_LABEL_WORDS = [
  'subject', // en
  'betreff', // de
  'objet', // fr
  'asunto', // es
  'assunto', // pt
  'oggetto', // it
  'onderwerp', // nl
  'ämne', // sv
  'emne', // da, nb
  'temat', // pl
  '件名', // ja
  '主题', // zh-CN
  '主旨', // zh-TW
  '제목', // ko
];

/** Builds a selector matching `tag` elements whose aria-label contains any of `words`. */
function ariaLabelContainsSelector(tag, words) {
  return words.map((w) => `${tag}[aria-label*="${w}" i]`).join(', ');
}

module.exports = { SEND_LABEL_PREFIXES, SUBJECT_LABEL_WORDS, ariaLabelContainsSelector };
