/* First-visit language picker. The regular View > Language control remains available. */
const STORAGE_CHOICE = 'cb-language-onboarded-v1';
const STORAGE_LANG = 'cb-lang';
const gate = document.querySelector('#languageGate');
const form = document.querySelector('#languageGateForm');
const start = document.querySelector('#languageStart');
const options = [...document.querySelectorAll('input[name="preferredLanguage"]')];

let completed = false;
try { completed = localStorage.getItem(STORAGE_CHOICE) === '1'; } catch (_) {}
if (!completed) gate.hidden = false;

options.forEach(input => input.addEventListener('change', () => {
  start.disabled = !options.some(option => option.checked);
}));

form.addEventListener('submit', event => {
  event.preventDefault();
  const selected = options.find(option => option.checked)?.value;
  if (selected !== 'en' && selected !== 'th') return;
  try {
    localStorage.setItem(STORAGE_LANG, selected);
    localStorage.setItem(STORAGE_CHOICE, '1');
  } catch (_) {
    // The selected language still applies for this reload even if storage is blocked.
  }
  window.location.reload();
});
