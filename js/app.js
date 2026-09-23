/* ========== HELPERS ========== */
const ARABIC_DIGITS = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
function arabicNum(n) {
  return String(n).split('').map(d => ARABIC_DIGITS[+d]).join('');
}

let fontScale = 100;
const FONT_SCALE_MIN = 60, FONT_SCALE_MAX = 200, FONT_SCALE_STEP = 10;

function adjustFontSize(dir) {
  fontScale = Math.max(FONT_SCALE_MIN, Math.min(FONT_SCALE_MAX, fontScale + dir * FONT_SCALE_STEP));
  applyFontScale();
  localStorage.setItem('quran-fontscale', fontScale);
}

function applyFontScale() {
  const base = 2, baseMobile = 1.35, bismillahBase = 1.8, bismillahMobile = 1.3;
  const isMobile = window.innerWidth <= 640;
  const qSize = (isMobile ? baseMobile : base) * fontScale / 100;
  const bSize = (isMobile ? bismillahMobile : bismillahBase) * fontScale / 100;
  document.querySelectorAll('.quran-text').forEach(el => el.style.fontSize = qSize + 'rem');
  document.querySelectorAll('.bismillah').forEach(el => el.style.fontSize = bSize + 'rem');
  const label = document.getElementById('fontSizeLabel');
  if (label) label.textContent = fontScale;
}

/* Shared helper: find verse element nearest to viewport center (DRY) */
function getCenterVerse() {
  const midY = window.innerHeight / 2;
  let best = null, bestDist = Infinity;
  document.querySelectorAll('.verse-wrap').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.height === 0) return;
    const dist = Math.abs((r.top + r.height / 2) - midY);
    if (dist < bestDist) { bestDist = dist; best = el; }
  });
  return best;
}

/* Clipboard with fallback for non-secure contexts / denied permissions */
function copyTextWithFallback(text) {
  if (navigator.clipboard && window.isSecureContext !== false) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
  }
  return fallbackCopyText(text);
}

function fallbackCopyText(text) {
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      const ok = document.execCommand('copy');
      ta.remove();
      ok ? resolve() : reject(new Error('copy failed'));
    } catch (e) {
      ta.remove();
      reject(e);
    }
  });
}

/* ========== STATE ========== */
let quranData = {};
let ribbonSurah = null, ribbonAyah = null;
let loadedSurahs = new Set();
let sidebarOpen = false;
let searchMode = false;
let currentTab = 'surah';
/* Cached bookmark lookup to avoid JSON.parse per verse during render */
let bookmarkSet = new Set();
let audioSpeed = 1;
let audioRepeat = 'off'; // off | one | surah
let sleepTimerId = null, sleepMinutes = 0;
let lastFocusedBeforeSidebar = null;
let deferredInstallPrompt = null;
let hashSyncEnabled = true;

/* ========== TRANSLATION / TRANSLITERATION ========== */
let translationData = {};   // { surah: [{verse, text}] } for active edition
let translitData = {};      // { surah: [{verse, text}] }
let translationMap = new Map(); // "s:v" -> text (O(1) lookup)
let translitMap = new Map();
let translationEdition = DEFAULT_TRANSLATION;
let showTranslation = false;
let showTransliteration = false;
let translationLoading = false;
let translitLoading = false;
let translationLoadedEdition = null;

function extrasEnabled() {
  return showTranslation || showTransliteration;
}

function getTranslationText(s, v) {
  const fast = translationMap.get(`${s}:${v}`);
  if (fast !== undefined) return fast;
  const arr = translationData[s];
  if (!arr) return null;
  const found = arr.find(x => x.verse === v);
  return found ? found.text : null;
}

function getTranslitText(s, v) {
  const fast = translitMap.get(`${s}:${v}`);
  if (fast !== undefined) return fast;
  const arr = translitData[s];
  if (!arr) return null;
  const found = arr.find(x => x.verse === v);
  return found ? found.text : null;
}

function rebuildExtraMaps() {
  translationMap = new Map();
  Object.entries(translationData).forEach(([s, arr]) => (arr || []).forEach(x => translationMap.set(`${s}:${x.verse}`, x.text)));
  translitMap = new Map();
  Object.entries(translitData).forEach(([s, arr]) => (arr || []).forEach(x => translitMap.set(`${s}:${x.verse}`, x.text)));
}

function refreshBookmarkCache() {
  try {
    const data = JSON.parse(localStorage.getItem('quran-bookmarks'));
    const marks = Array.isArray(data) ? data : [];
    bookmarkSet = new Set(marks.map(m => `${m.s}:${m.v}`));
  } catch {
    bookmarkSet = new Set();
  }
}

/* ========== INIT ========== */
document.addEventListener('DOMContentLoaded', () => {
  // Always start at the top on (re)load: the browser's scroll restoration
  // would otherwise drop you mid-list (e.g. surah 2) once verses mount async.
  // Explicit jumps (deep links #/s/v, resume, Juz/Surah nav) still scroll themselves.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  const savedTheme = localStorage.getItem('quran-theme') || 'dark';
  setTheme(savedTheme, false);

  const savedFont = localStorage.getItem('quran-font') || 'amiri';
  setFont(savedFont, false);

  fontScale = parseInt(localStorage.getItem('quran-fontscale'), 10) || 100;
  fontScale = Math.max(FONT_SCALE_MIN, Math.min(FONT_SCALE_MAX, fontScale));
  applyFontScale();

  refreshBookmarkCache();
  translationEdition = localStorage.getItem('quran-translation-edition') || DEFAULT_TRANSLATION;
  showTranslation = localStorage.getItem('quran-show-translation') === '1';
  showTransliteration = localStorage.getItem('quran-show-translit') === '1';
  showTajweed = localStorage.getItem('quran-show-tajweed') === '1';
  const savedReciter = localStorage.getItem('quran-reciter');
  audioReciter = RECITERS.some(r => r.id === savedReciter) ? savedReciter : DEFAULT_RECITER;
  const savedSpeed = parseFloat(localStorage.getItem('quran-audio-speed'));
  if ([0.75, 1, 1.25, 1.5, 2].includes(savedSpeed)) audioSpeed = savedSpeed;
  audioRepeat = localStorage.getItem('quran-audio-repeat') || 'off';
  if (!['off', 'one', 'surah'].includes(audioRepeat)) audioRepeat = 'off';
  try { localStorage.removeItem('quran-memorize'); } catch (_) {} // retired feature
  initReadingUI();
  updateReciterBadge();
  updateAudioSpeedUI();
  updateAudioRepeatUI();
  loadRibbon();
  loadBookmarks();
  loadQuran();
  setupScroll();
  setupPWA();
  setupOfflineBanner();
  setupDeepLinks();
});

/* Sajdah verses (Hafs, 15 positions incl. 32:15) as "s:v" */
const SAJDAH = new Set(['7:206','13:15','16:50','17:109','19:58','22:18','22:77','25:60','27:26','32:15','38:24','41:38','53:62','84:21','96:19']);
function isSajdah(s, v) { return SAJDAH.has(`${s}:${v}`); }
function sajdahBadge() { return `<span class="sajdah-badge" title="Sajdah — prostration recommended">۩ sajdah</span>`; }

/* ========== THEME / FONT ========== */
const THEMES = ['dark', 'light', 'sepia', 'oled', 'emerald', 'midnight', 'contrast', 'parchment'];
const FONTS = ['uthman', 'scheherazade', 'amiri', 'amiri-classic', 'indopak', 'lpmq'];
const THEME_BG = { dark: '#1c1917', light: '#fafaf9', sepia: '#f5edd6', oled: '#000000', emerald: '#0c1f18', midnight: '#0b1526', contrast: '#000000', parchment: '#f6efdd' };

function setTheme(theme, save = true) {
  if (!THEMES.includes(theme)) theme = 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_BG[theme] || '#d97706');
  if (save) localStorage.setItem('quran-theme', theme);
  document.querySelectorAll('[data-theme-opt]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-theme-opt') === theme);
  });
}

function setFont(font, save = true) {
  if (!FONTS.includes(font)) font = 'amiri';
  document.documentElement.setAttribute('data-font', font);
  if (save) localStorage.setItem('quran-font', font);
  document.querySelectorAll('[data-font-opt]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-font-opt') === font);
  });
}

/* ========== READING (translation / transliteration) ========== */
function initReadingUI() {
  document.querySelectorAll('[data-translation-opt]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-translation-opt') === translationEdition && showTranslation);
  });
  const offEl = document.querySelector('[data-translation-opt="off"]');
  if (offEl) offEl.classList.toggle('active', !showTranslation);
  const trToggle = document.getElementById('translitToggle');
  if (trToggle) trToggle.classList.toggle('active', showTransliteration);
  const tjToggle = document.getElementById('tajweedToggle');
  if (tjToggle) tjToggle.classList.toggle('active', showTajweed);
  document.querySelectorAll('[data-reciter-opt]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-reciter-opt') === audioReciter);
  });
  updateReadingLoadingUI();
}

function updateReadingLoadingUI() {
  const label = document.getElementById('readingStatus');
  if (!label) return;
  if (translationLoading || translitLoading || tajweedInflight.size) {
    label.textContent = 'Loading…';
  } else if (showTranslation || showTransliteration || showTajweed) {
    const parts = [];
    if (showTajweed) parts.push('Tajweed on');
    if (showTransliteration) parts.push('Transliteration on');
    if (showTranslation) {
      const ed = TRANSLATION_EDITIONS.find(e => e.id === translationEdition);
      parts.push('EN: ' + (ed ? ed.short : translationEdition));
    }
    parts.push('Reciter: ' + reciterShort());
    label.textContent = parts.join(' • ');
  } else {
    label.textContent = 'Arabic only • Reciter: ' + reciterShort();
  }
}

function toggleTransliteration() {
  showTransliteration = !showTransliteration;
  localStorage.setItem('quran-show-translit', showTransliteration ? '1' : '0');
  initReadingUI();
  if (showTransliteration && !Object.keys(translitData).length) {
    ensureTransliteration();
  } else {
    refreshExtrasInPlace();
  }
  showToast(showTransliteration ? 'Transliteration on' : 'Transliteration off');
}

function setTranslationEdition(id) {
  if (id === 'off') {
    showTranslation = false;
    localStorage.setItem('quran-show-translation', '0');
    initReadingUI();
    refreshExtrasInPlace();
    showToast('Translation off');
    return;
  }
  const changed = id !== translationEdition || !showTranslation;
  translationEdition = id;
  showTranslation = true;
  localStorage.setItem('quran-translation-edition', id);
  localStorage.setItem('quran-show-translation', '1');
  initReadingUI();
  if (changed) {
    translationData = {};
    translationLoadedEdition = null;
    ensureTranslation(id);
  } else {
    refreshExtrasInPlace();
  }
  const ed = TRANSLATION_EDITIONS.find(e => e.id === id);
  showToast('Translation: ' + (ed ? ed.short : id));
}

function toggleDropdown(id) {
  const dd = document.getElementById(id);
  const isHidden = dd.classList.contains('hidden');
  document.querySelectorAll('.dropdown-panel').forEach(d => d.classList.add('hidden'));
  document.querySelectorAll('[aria-controls]').forEach(b => { if (b.getAttribute('aria-controls') !== id) b.setAttribute('aria-expanded', 'false'); });
  if (isHidden) {
    dd.classList.remove('hidden');
    const btn = document.querySelector(`[aria-controls="${id}"]`);
    if (btn) btn.setAttribute('aria-expanded', 'true');
    const first = dd.querySelector('.dropdown-item');
    if (first && window.innerWidth > 640) first.setAttribute('tabindex', '0');
  } else {
    const btn = document.querySelector(`[aria-controls="${id}"]`);
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
}

document.addEventListener('keydown', e => {
  const openDd = [...document.querySelectorAll('.dropdown-panel')].find(d => !d.classList.contains('hidden') && d.id !== 'reciterMenu');
  if (openDd && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    const items = [...openDd.querySelectorAll('.dropdown-item')];
    if (items.length) {
      e.preventDefault();
      const i = items.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[next].focus();
    }
  }
});

document.addEventListener('click', e => {
  if (!e.target.closest('.relative')) {
    document.querySelectorAll('.dropdown-panel').forEach(d => d.classList.add('hidden'));
  }
});

/* ========== DATA ========== */
async function loadQuran() {
  try {
    document.getElementById('progressFill').style.width = '30%';
    let data = null;
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = await res.json();
    } catch (fetchErr) {
      // Offline fallback: try Cache Storage (populated by service worker)
      if ('caches' in window) {
        try {
          const cached = await caches.match(API_URL);
          if (cached) data = await cached.json();
        } catch (_) { /* ignore */ }
      }
      if (!data) throw fetchErr;
      showToast('Offline mode — showing cached Quran text');
    }
    document.getElementById('progressFill').style.width = '90%';

    const verses = data.quran;
    let current = 1;
    quranData[current] = [];
    verses.forEach(v => {
      if (v.chapter !== current) { current = v.chapter; quranData[current] = []; }
      quranData[current].push(v);
    });

    document.getElementById('progressFill').style.width = '100%';
    setTimeout(() => {
      document.getElementById('loadingState').classList.add('hidden');
      document.getElementById('surahContainer').classList.remove('hidden');
      resetVirtualList();
      applyFontScale();
      restoreLastRead();
      loadBookmarks(); // upgrade saved list with full verse text
      // Load extras in background if the user had them enabled
      if (showTransliteration) ensureTransliteration();
      if (showTranslation) ensureTranslation(translationEdition);
      if (showTajweed) ensureTajweedForLoaded();
    }, 300);
  } catch (err) {
    document.getElementById('loadingText').innerHTML = 'Failed to load Quran. Check connection. <button onclick="retryLoad()" class="offline-retry" style="margin-left:8px">Retry</button>';
    console.error(err);
  }
}

/* Fetch an edition JSON with Cache Storage offline fallback */
async function fetchEdition(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (fetchErr) {
    if ('caches' in window) {
      try {
        const cached = await caches.match(url);
        if (cached) {
          showToast('Offline mode — showing cached text');
          return await cached.json();
        }
      } catch (_) { /* ignore */ }
    }
    throw fetchErr;
  }
}

function indexEditionBySurah(data) {
  const map = {};
  (data.quran || []).forEach(v => {
    if (!map[v.chapter]) map[v.chapter] = [];
    map[v.chapter].push(v);
  });
  return map;
}

async function ensureTransliteration() {
  if (!showTransliteration || translitLoading || Object.keys(translitData).length) return;
  translitLoading = true;
  updateReadingLoadingUI();
  try {
    const data = await fetchEdition(TRANSLITERATION_URL);
    translitData = indexEditionBySurah(data);
    rebuildExtraMaps();
    refreshExtrasInPlace();
  } catch (e) {
    console.error('transliteration load failed', e);
    showToast('Could not load transliteration. Check connection.');
    showTransliteration = false;
    localStorage.setItem('quran-show-translit', '0');
    initReadingUI();
  } finally {
    translitLoading = false;
    updateReadingLoadingUI();
  }
}

async function ensureTranslation(edition = translationEdition) {
  if (!showTranslation) return;
  if (translationLoading) return;
  if (translationLoadedEdition === edition && Object.keys(translationData).length) return;
  translationLoading = true;
  updateReadingLoadingUI();
  try {
    const data = await fetchEdition(editionUrl(edition));
    translationData = indexEditionBySurah(data);
    translationLoadedEdition = edition;
    rebuildExtraMaps();
    refreshExtrasInPlace();
  } catch (e) {
    console.error('translation load failed', e);
    showToast('Could not load translation. Check connection.');
    showTranslation = false;
    localStorage.setItem('quran-show-translation', '0');
    initReadingUI();
  } finally {
    translationLoading = false;
    updateReadingLoadingUI();
  }
}

/* Re-render rendered cards in place (preserves virtual list + scroll) */
function refreshExtrasInPlace() {
  const cards = document.querySelectorAll('.surah-card');
  cards.forEach(card => {
    const n = parseInt(card.dataset.surah, 10);
    if (!n) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = renderSurah(n);
    const fresh = tmp.firstElementChild;
    if (fresh) card.replaceWith(fresh);
  });
  applyFontScale();
  updateReadingLoadingUI();
  loadBookmarks(); // include newly arrived translation text in saved list
}

function refreshSurahCard(n) {
  const card = document.getElementById(`surah-${n}`);
  if (!card) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = renderSurah(n);
  const fresh = tmp.firstElementChild;
  if (fresh) card.replaceWith(fresh);
  applyFontScale();
}

/* ========== TAJWEED (authoritative Hafs markup via Quran.com API) ========== */
// Per-surah fetch of <tajweed class=...> annotations (Hafs). Sanitized to an
// allowlist of rule classes; <span class=end> ayah numbers are dropped because
// we render our own medallions. Cached by the service worker for offline use.
const TAJWEED_RULES = {
  ham_wasl: 'Hamzat al-Wasl', laam_shamsiyah: 'Lam Shamsiyyah', slnt: 'Silent letter',
  qalaqah: 'Qalqalah', ikhafa: 'Ikhfa', ikhafa_shafawi: 'Ikhfa Shafawi',
  idgham_ghunnah: 'Idgham with Ghunnah', idgham_wo_ghunnah: 'Idgham without Ghunnah',
  idgham_shafawi: 'Idgham Shafawi', idgham_mutajanisayn: 'Idgham Mutajanisayn',
  iqlab: 'Iqlab', ghunnah: 'Ghunnah',
  madda_normal: 'Madd (natural)', madda_permissible: 'Madd (permissible)',
  madda_necessary: 'Madd (necessary)', madda_obligatory: 'Madd (obligatory)'
};
let showTajweed = false;
let tajweedData = {}; // surah -> Map(verse -> sanitized html)
let tajweedInflight = new Set();

function tajweedUrl(n) {
  return `https://api.quran.com/api/v4/quran/verses/uthmani_tajweed?chapter_number=${n}`;
}

function sanitizeTajweed(html) {
  let s = String(html || '');
  s = s.replace(/<span class=end>.*?<\/span>/g, '');
  s = s.replace(/۞/g, '');
  const esc = s2 => s2.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const re = /<\/?tajweed(?:\s+class=([a-z_]+))?>/g;
  let last = 0, m, out = '';
  while ((m = re.exec(s))) {
    out += esc(s.slice(last, m.index));
    const full = m[0], cls = m[1];
    if (full[1] === '/') out += '</tajweed>';
    else if (cls && TAJWEED_RULES[cls]) out += `<tajweed class="${cls}">`;
    // unknown tags are dropped, inner text kept
    last = m.index + full.length;
  }
  out += esc(s.slice(last));
  return out;
}

function arabicLineHtml(n, v) {
  if (showTajweed) {
    const per = tajweedData[n];
    const t = per ? per.get(v.verse) : null;
    if (t) return t;
  }
  return escapeHtml(cleanVerseText(v.text));
}

async function ensureTajweedForSurah(n) {
  if (tajweedData[n] || tajweedInflight.has(n)) return;
  tajweedInflight.add(n);
  updateReadingLoadingUI();
  try {
    const data = await fetchEdition(tajweedUrl(n));
    const map = new Map();
    (data.verses || []).forEach(x => {
      const vnum = parseInt(String(x.verse_key || '').split(':')[1], 10);
      if (vnum) map.set(vnum, sanitizeTajweed(x.text_uthmani_tajweed));
    });
    tajweedData[n] = map;
    if (showTajweed) refreshSurahCard(n);
  } catch (e) {
    console.error('tajweed load failed', e);
    if (showTajweed) showToast('Tajweed needs connection — showing plain text');
  } finally {
    tajweedInflight.delete(n);
    updateReadingLoadingUI();
  }
}

function ensureTajweedForLoaded() {
  document.querySelectorAll('.surah-card').forEach(card => {
    const n = parseInt(card.dataset.surah, 10);
    if (n && !tajweedData[n]) ensureTajweedForSurah(n);
  });
}

function toggleTajweed() {
  showTajweed = !showTajweed;
  localStorage.setItem('quran-show-tajweed', showTajweed ? '1' : '0');
  initReadingUI();
  if (showTajweed) {
    refreshExtrasInPlace();
    ensureTajweedForLoaded();
    showToast('Tajweed colors on — loading per surah');
  } else {
    refreshExtrasInPlace();
    showToast('Tajweed colors off');
  }
}

/* ========== RENDER ========== */
function getSurahMeta(n) {
  return SURAHS.find(s => s.n === n);
}

function shouldShowBismillah(n) {
  return n !== 1 && n !== 9;
}

/* ========== RUB EL HIZB (authoritative table in js/data.js, not embedded ۞) ========== */
// The API text embeds U+06DE at 199 verse starts and omits it at the 41 quarters that
// coincide with a surah start; it also misplaces Rub 106 at 15:49 instead of 15:50.
// So we strip the embedded char everywhere and render markers from RUB_DATA instead.
function cleanVerseText(t) {
  return String(t == null ? '' : t).replace(/۞/g, '');
}

let RUB_LOOKUP = null;
function rubLookup() {
  if (RUB_LOOKUP) return RUB_LOOKUP;
  RUB_LOOKUP = new Map();
  if (typeof RUB_DATA !== 'undefined') {
    RUB_DATA.forEach(r => RUB_LOOKUP.set(`${r.surah}:${r.ayah}`, r));
  }
  return RUB_LOOKUP;
}

function getRubInfo(s, v) {
  return rubLookup().get(`${s}:${v}`) || null;
}

const RUB_Q_LABELS = { 1: 'Hizb', 2: '¼ Hizb', 3: '½ Hizb', 4: '¾ Hizb' };

function rubMarkerHtml(rub) {
  if (!rub) return '';
  const part = RUB_Q_LABELS[rub.q] || '';
  const label = `Rub el Hizb ${rub.n} • Juz ${rub.juz} • Hizb ${rub.hizb} (${part}) — ${rub.surah}:${rub.ayah}`;
  const kind = rub.q === 1 ? 'rub-hizb' : 'rub-quarter';
  return `<div class="rub-marker ${kind}" title="${label}" role="separator" aria-label="${label}"><span class="rub-glyph" aria-hidden="true">۞</span></div>`;
}

function renderSurah(n) {
  const meta = getSurahMeta(n);
  const verses = quranData[n];
  if (!meta || !verses) return '';

  let html = `<div class="surah-card card-bg border rounded-2xl p-6 sm:p-10 fade-in" id="surah-${n}" data-surah="${n}">`;
  const juzInfo = (typeof getJuzInfo === 'function' ? getJuzInfo(n) : null);
  html += `<div class="surah-head"><div class="surah-head-inner">`;
  html += `<div class="surah-num-star" title="Surah ${meta.n}">${meta.n}</div>`;
  html += `<h2 class="surah-name-ar text-3xl sm:text-4xl">${meta.name}</h2>`;
  html += `<h3 class="surah-name-en text-base sm:text-lg">${meta.en}</h3>`;
  html += `<div class="surah-meta-pills"><span>${meta.type}</span><span>${meta.verses} Ayahs</span>${juzInfo ? `<span>Juz ${juzInfo.n}</span>` : ''}</div>`;
  html += `</div></div>`;

  if (shouldShowBismillah(n)) {
    html += `<div class="bismillah-plaque"><p class="bismillah text-center">بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</p></div>`;
  }

  if (extrasEnabled()) {
    html += renderVerseBlocks(n, verses);
  } else {
    html += `<div class="quran-text" lang="ar" dir="rtl" style="color:var(--text-primary)">`;
    verses.forEach(v => {
      const isRibboned = ribbonSurah === n && ribbonAyah === v.verse;
      const isBookmarked = bookmarkSet.has(`${n}:${v.verse}`);
      html += rubMarkerHtml(getRubInfo(n, v.verse));
      html += `<span class="verse-wrap${isRibboned ? ' ribbon-verse' : ''}${isBookmarked ? ' has-bookmark' : ''}" data-s="${n}" data-v="${v.verse}">`;
      html += arabicLineHtml(n, v);
      html += `<span class="aya-num" onclick="handleAyaClick(event,${n},${v.verse})" title="Click to bookmark/ribbon">`;
      html += `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18"/><circle cx="20" cy="20" r="14.5"/></svg>`;
      html += `<span>${arabicNum(v.verse)}</span></span>`;
      if (isRibboned) {
        html += `<span class="material-symbols-outlined filled ribbon-mark" title="Reading ribbon — tap the ayah number to move it">push_pin</span>`;
      }
      if (isSajdah(n, v.verse)) html += sajdahBadge();
      if (isBookmarked) {
        html += `<span class="inline-block w-2 h-2 rounded-full mx-0.5 align-middle bookmark-dot" style="background:var(--accent);vertical-align:middle"></span>`;
      }
      html += `</span>`;
    });
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* Stacked verse-by-verse view: Arabic + transliteration + translation */
function renderVerseBlocks(n, verses) {
  let html = `<div class="verse-list">`;
  verses.forEach(v => {
    const isRibboned = ribbonSurah === n && ribbonAyah === v.verse;
    const isBookmarked = bookmarkSet.has(`${n}:${v.verse}`);
    const translit = showTransliteration ? getTranslitText(n, v.verse) : null;
    const translation = showTranslation ? getTranslationText(n, v.verse) : null;
    html += rubMarkerHtml(getRubInfo(n, v.verse));
    html += `<div class="verse-wrap verse-block${isRibboned ? ' ribbon-verse' : ''}${isBookmarked ? ' has-bookmark' : ''}" data-s="${n}" data-v="${v.verse}">`;
    html += `<div class="quran-text verse-ar" lang="ar" dir="rtl" style="color:var(--text-primary)">`;
    html += arabicLineHtml(n, v);
    html += `<span class="aya-num" onclick="handleAyaClick(event,${n},${v.verse})" title="Click to bookmark/ribbon">`;
    html += `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18"/><circle cx="20" cy="20" r="14.5"/></svg>`;
    html += `<span>${arabicNum(v.verse)}</span></span>`;
    if (isRibboned) {
      html += `<span class="material-symbols-outlined filled ribbon-mark" title="Reading ribbon — tap the ayah number to move it">push_pin</span>`;
    }
    if (isSajdah(n, v.verse)) html += sajdahBadge();
    if (isBookmarked) {
      html += `<span class="inline-block w-2 h-2 rounded-full mx-0.5 align-middle bookmark-dot" style="background:var(--accent);vertical-align:middle"></span>`;
    }
    html += `</div>`;
    if (showTransliteration) {
      html += `<p class="verse-translit" dir="ltr">${translit ? escapeHtml(translit) : '<span class="extras-loading">Loading transliteration…</span>'}</p>`;
    }
    if (showTranslation) {
      const editionShort = (TRANSLATION_EDITIONS.find(e => e.id === translationEdition) || {}).short || '';
      html += `<p class="verse-translation" dir="ltr">${translation ? escapeHtml(translation) : '<span class="extras-loading">Loading translation…</span>'}${translation && editionShort ? ` <span class="verse-ref">— ${escapeHtml(editionShort)}</span>` : ''}</p>`;
    }
    if (isSajdah(n, v.verse)) {
      html += `<p class="verse-translation" style="color:var(--accent);font-weight:700">۩ Sajdah — prostration is recommended here.</p>`;
    }
    html += `</div>`;
  });
  html += `</div>`;
  return html;
}

/* ========== VIRTUALIZED LIST (progressive rendering) ========== */
// Renders surahs in small batches as the user scrolls so initial load stays
// fast (~500 verses) instead of mounting all ~6,236 verses at once.
const SURAHS_INITIAL_BATCH = 3;
const SURAHS_NEXT_BATCH = 4;
let listObserver = null;
let listEndReached = false;

function mountSurah(n) {
  if (loadedSurahs.has(n)) return;
  const container = document.getElementById('surahContainer');
  const sentinel = document.getElementById('listSentinel');
  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderSurah(n);
  const card = wrapper.firstElementChild;
  if (!card) return;
  if (sentinel) container.insertBefore(card, sentinel);
  else container.appendChild(card);
  loadedSurahs.add(n);
  if (showTajweed && !tajweedData[n]) ensureTajweedForSurah(n);
}

// Ensure surahs 1..n are rendered (used by jump / deep links)
function ensureSurahRendered(n) {
  for (let i = 1; i <= n; i++) mountSurah(i);
  observeSentinel();
}

function renderNextBatch() {
  if (listEndReached) return;
  let next = 1;
  while (next <= 114 && loadedSurahs.has(next)) next++;
  if (next > 114) { finishVirtualList(); return; }
  const end = Math.min(114, next + SURAHS_NEXT_BATCH - 1);
  for (let i = next; i <= end; i++) mountSurah(i);
  applyFontScale();
  if (end >= 114) finishVirtualList();
}

function finishVirtualList() {
  listEndReached = true;
  if (listObserver) { listObserver.disconnect(); listObserver = null; }
  const sentinel = document.getElementById('listSentinel');
  if (sentinel) sentinel.classList.add('hidden');
}

function observeSentinel() {
  const sentinel = document.getElementById('listSentinel');
  if (!sentinel || listEndReached) return;
  if (!('IntersectionObserver' in window)) {
    // Fallback: render everything (old behaviour)
    loadAllSurahs();
    return;
  }
  if (listObserver) listObserver.disconnect();
  listObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) renderNextBatch();
    });
  }, { root: null, rootMargin: '1200px 0px', threshold: 0 });
  listObserver.observe(sentinel);
}

function resetVirtualList() {
  const container = document.getElementById('surahContainer');
  // Remove old cards but keep sentinel
  container.querySelectorAll('.surah-card').forEach(el => el.remove());
  loadedSurahs.clear();
  listEndReached = false;
  const sentinel = document.getElementById('listSentinel');
  if (sentinel) {
    sentinel.classList.remove('hidden');
    // Move sentinel to end (in case refresh reordered)
    container.appendChild(sentinel);
  }
  const end = Math.min(114, SURAHS_INITIAL_BATCH);
  for (let i = 1; i <= end; i++) mountSurah(i);
  observeSentinel();
}

// Back-compat: old code called loadVisibleSurahs() to mean "make sure all is rendered".
function loadVisibleSurahs() {
  renderNextBatch();
}

function loadAllSurahs() {
  for (let i = 1; i <= 114; i++) mountSurah(i);
  finishVirtualList();
  applyFontScale();
}

/* ========== SCROLL ========== */
let ticking = false;
let scrollSaveTimer = null;

function setupScroll() {
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => { handleScroll(); ticking = false; });
      ticking = true;
    }
  });
}

function handleScroll() {
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
  document.getElementById('readingProgress').style.width = pct + '%';
  document.getElementById('goTopBtn').classList.toggle('hidden', scrollTop < 600);
  document.getElementById('floatingTop')?.classList.toggle('hidden', scrollTop < 600);
  clearTimeout(scrollSaveTimer);
  scrollSaveTimer = setTimeout(() => { saveLastRead(); updateBookmarkBtn(); }, 1000);
}

/* ========== RIBBON ========== */
function setRibbon(s, v, notify = true) {
  clearRibbonVisual();
  ribbonSurah = s; ribbonAyah = v;
  localStorage.setItem('quran-ribbon', `${s}:${v}`);
  if (notify) showToast(`Ribbon set at ${getSurahMeta(s).en} : ${arabicNum(v)}`);
  updateRibbonUI();
  applyRibbonVisual();
}

function ribbonVerseEl() {
  if (ribbonSurah == null) return null;
  return document.querySelector(`[data-s="${ribbonSurah}"][data-v="${ribbonAyah}"]`);
}

function clearRibbonVisual() {
  document.querySelectorAll('.verse-wrap.ribbon-verse').forEach(el => el.classList.remove('ribbon-verse'));
  document.querySelectorAll('.ribbon-mark').forEach(el => el.remove());
}

function applyRibbonVisual() {
  if (ribbonSurah == null) return;
  ensureSurahRendered(ribbonSurah);
  const el = ribbonVerseEl();
  if (!el) return;
  el.classList.add('ribbon-verse');
  if (!el.querySelector('.ribbon-mark')) {
    const mark = document.createElement('span');
    mark.className = 'material-symbols-outlined filled ribbon-mark';
    mark.title = 'Reading ribbon — tap the ayah number to move it';
    mark.textContent = 'push_pin';
    (el.querySelector('.verse-ar') || el).appendChild(mark);
  }
}

function clearRibbonStored(notify = true) {
  ribbonSurah = null; ribbonAyah = null;
  localStorage.removeItem('quran-ribbon');
  document.getElementById('resumePill')?.classList.add('hidden');
  if (notify) showToast('Ribbon removed');
  updateRibbonUI();
  clearRibbonVisual();
}

function toggleRibbon() {
  if (ribbonSurah) {
    clearRibbonStored(true);
  } else {
    const best = getCenterVerse();
    if (!best) { showToast('Scroll to a verse first'); return; }
    const s = parseInt(best.dataset.s, 10);
    const v = parseInt(best.dataset.v, 10);
    setRibbon(s, v, true);
  }
}

function scrollToRibbon() {
  if (!ribbonSurah) return;
  ensureSurahRendered(ribbonSurah);
  requestAnimationFrame(() => {
    flashVerse(
      document.querySelector(`[data-s="${ribbonSurah}"][data-v="${ribbonAyah}"]`),
      'rgba(153,27,27,0.2)'
    );
  });
}

function loadRibbon() {
  const saved = localStorage.getItem('quran-ribbon');
  if (saved) {
    const [s, v] = saved.split(':').map(Number);
    ribbonSurah = s; ribbonAyah = v;
  }
  updateRibbonUI();
}

function updateRibbonUI() {
  const has = ribbonSurah !== null;
  document.getElementById('ribbonIconEmpty').classList.toggle('hidden', has);
  document.getElementById('ribbonIconFull').classList.toggle('hidden', !has);
}

/* ========== AUTO SCROLL ========== */
let autoScrolling = false;
let autoScrollInterval = null;
let autoScrollSpeed = 3;

function toggleAutoScroll() {
  if (autoScrolling) {
    stopAutoScroll();
  } else {
    startAutoScroll();
  }
}

function startAutoScroll() {
  autoScrolling = true;
  document.getElementById('autoScrollBar').classList.add('visible');
  document.getElementById('mobileToolbar').classList.remove('visible');
  const toggle = document.getElementById('autoScrollToggle');
  if (toggle) toggle.setAttribute('aria-pressed', 'true');
  runAutoScroll();
  showToast('Auto scroll started — press Space to stop');
}

function runAutoScroll() {
  if (!autoScrolling) return;
  const nearBottom = (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 4);
  if (nearBottom) {
    stopAutoScroll();
    showToast('End reached — auto scroll stopped');
    return;
  }
  const px = Math.max(1, Math.round(autoScrollSpeed / 3));
  const ms = Math.max(40, 220 - autoScrollSpeed * 10);
  window.scrollBy(0, px);
  autoScrollInterval = setTimeout(runAutoScroll, ms);
}

function stopAutoScroll() {
  autoScrolling = false;
  clearTimeout(autoScrollInterval);
  autoScrollInterval = null;
  document.getElementById('autoScrollBar').classList.remove('visible');
  const toggle = document.getElementById('autoScrollToggle');
  if (toggle) toggle.setAttribute('aria-pressed', 'false');
  if (window.matchMedia('(max-width: 640px)').matches) {
    document.getElementById('mobileToolbar').classList.add('visible');
  }
}

function setAutoScrollSpeed(val) {
  autoScrollSpeed = parseInt(val, 10) || 3;
  const label = document.getElementById('autoScrollSpeed');
  if (label) label.textContent = autoScrollSpeed;
  const toggle = document.getElementById('autoScrollToggle');
  if (toggle) toggle.setAttribute('aria-pressed', autoScrolling ? 'true' : 'false');
}

function autoScrollDir(dir) {
  if (!autoScrolling) startAutoScroll();
  const slider = document.getElementById('autoScrollSlider');
  const max = slider ? parseInt(slider.max, 10) || 30 : 30;
  const newVal = Math.max(1, Math.min(max, autoScrollSpeed + dir * 2));
  if (slider) slider.value = newVal;
  setAutoScrollSpeed(newVal);
}

/* ========== AUDIO RECITATION (EveryAyah CDN, switchable reciter) ========== */
let audioEl = null;
let audioS = null, audioV = null;
let audioPlaying = false;
let audioReciter = DEFAULT_RECITER;

function reciterFolder(id = audioReciter) {
  const rec = RECITERS.find(r => r.id === id);
  return rec ? rec.folder : RECITERS[0].folder;
}

function reciterShort(id = audioReciter) {
  const rec = RECITERS.find(r => r.id === id);
  return rec ? rec.short : RECITERS[0].short;
}

function audioUrl(s, v, folder = reciterFolder()) {
  const p = n => String(n).padStart(3, '0');
  return `${EVERYAYAH_BASE}${folder}/${p(s)}${p(v)}.mp3`;
}

function setReciter(id) {
  const rec = RECITERS.find(r => r.id === id);
  if (!rec || id === audioReciter) { initReadingUI(); return; }
  audioReciter = id;
  localStorage.setItem('quran-reciter', id);
  initReadingUI();
  updateReciterBadge();
  closeReciterMenu();
  showToast('Reciter: ' + rec.label);
  // Swap the source under the current track without scrolling away
  if (audioS != null && audioEl) {
    const wasPlaying = !audioEl.paused && !audioEl.ended;
    audioEl.src = audioUrl(audioS, audioV);
    if (wasPlaying) audioEl.play().catch(() => showToast('Audio blocked — tap play again'));
  }
  refreshAudioDlUI(); // download state is per-reciter
}

function updateReciterBadge() {
  document.querySelectorAll('.audio-reciter').forEach(el => {
    el.textContent = reciterShort();
  });
}

function renderReciterMenu() {
  const menu = document.getElementById('reciterMenu');
  if (!menu) return;
  menu.innerHTML = '';
  const label = document.createElement('div');
  label.className = 'dropdown-label';
  label.textContent = 'Reciter';
  menu.appendChild(label);
  RECITERS.forEach(r => {
    const item = document.createElement('div');
    item.className = 'dropdown-item' + (r.id === audioReciter ? ' active' : '');
    item.setAttribute('role', 'menuitemradio');
    item.setAttribute('aria-checked', r.id === audioReciter ? 'true' : 'false');
    item.setAttribute('tabindex', '0');
    item.textContent = r.label;
    const pick = () => { setReciter(r.id); closeReciterMenu(); };
    item.addEventListener('click', pick);
    item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    menu.appendChild(item);
  });
}

function toggleReciterMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('reciterMenu');
  if (!menu) return;
  const willOpen = menu.classList.contains('hidden');
  document.querySelectorAll('.dropdown-panel').forEach(d => { if (d !== menu) d.classList.add('hidden'); });
  const ayaMenu = document.getElementById('ayaMenu');
  if (ayaMenu) ayaMenu.remove();
  if (willOpen) {
    renderReciterMenu();
    menu.classList.remove('hidden');
    setTimeout(() => document.addEventListener('click', closeReciterMenu), 10);
  } else {
    menu.classList.add('hidden');
  }
}

function closeReciterMenu(e) {
  const menu = document.getElementById('reciterMenu');
  if (menu && (!e || !menu.contains(e.target))) {
    menu.classList.add('hidden');
    document.removeEventListener('click', closeReciterMenu);
  }
}

function ensureAudioEl() {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = 'none';
    audioEl.playbackRate = audioSpeed;
    audioEl.addEventListener('ended', onAudioEnded);
    audioEl.addEventListener('error', () => {
      showToast('Audio failed to load. Check connection.');
      setAudioPlaying(false);
    });
    audioEl.addEventListener('play', () => { setAudioPlaying(true); updateMediaSession(); });
    audioEl.addEventListener('pause', () => setAudioPlaying(false));
  }
  audioEl.playbackRate = audioSpeed;
  return audioEl;
}

function setAudioPlaying(playing) {
  audioPlaying = playing;
  const icon = document.getElementById('audioPlayIcon');
  if (icon) icon.textContent = playing ? 'pause' : 'play_arrow';
  const toggle = document.getElementById('audioToggle');
  if (toggle) toggle.setAttribute('aria-pressed', playing ? 'true' : 'false');
}

function markPlayingVerse() {
  document.querySelectorAll('.verse-playing').forEach(el => el.classList.remove('verse-playing'));
  if (audioS == null) return;
  const el = document.querySelector(`[data-s="${audioS}"][data-v="${audioV}"]`);
  if (el) el.classList.add('verse-playing');
  updateAudioLabel();
}

function updateAudioLabel() {
  const label = document.getElementById('audioLabel');
  if (!label) return;
  if (audioS == null) { label.textContent = '—'; return; }
  const meta = getSurahMeta(audioS);
  label.textContent = `${meta ? meta.en : 'Surah ' + audioS} ${audioS}:${audioV}`;
}

function showAudioBar() {
  document.getElementById('audioBar').classList.add('visible');
  if (window.matchMedia('(max-width: 640px)').matches) {
    document.getElementById('mobileToolbar').classList.remove('visible');
  }
}

function playVerseAudio(s, v) {
  if (!quranData[s]) { showToast('Arabic text still loading…'); return; }
  ensureSurahRendered(s);
  const el = ensureAudioEl();
  audioS = s; audioV = v;
  el.src = audioUrl(s, v);
  el.play().catch(() => showToast('Audio blocked — tap play again'));
  showAudioBar();
  markPlayingVerse();
  updateMediaSession();
  prefetchNextAudio(s, v);
  refreshAudioDlUI();
  requestAnimationFrame(() => {
    document.querySelector(`[data-s="${s}"][data-v="${v}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function prefetchNextAudio(s, v) {
  try {
    const meta = getSurahMeta(s);
    let ns = s, nv = v + 1;
    if (meta && nv > meta.verses) { ns = s + 1; nv = 1; }
    if (ns > 114) return;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = audioUrl(ns, nv);
    link.as = 'audio';
    document.head.appendChild(link);
    setTimeout(() => link.remove(), 30000);
  } catch (_) {}
}

function updateMediaSession() {
  try {
    if (!('mediaSession' in navigator) || audioS == null) return;
    const meta = getSurahMeta(audioS);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${meta ? meta.en : 'Surah ' + audioS} ${audioS}:${audioV}`,
      artist: reciterShort() + ' • Quran Reader',
      album: 'Quran Recitation',
      artwork: [{ src: './icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
    });
    navigator.mediaSession.setActionHandler('play', () => toggleAudioPlay());
    navigator.mediaSession.setActionHandler('pause', () => toggleAudioPlay());
    navigator.mediaSession.setActionHandler('previoustrack', () => stepAudio(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => stepAudio(1));
  } catch (_) {}
}

const AUDIO_SPEEDS = [1, 1.25, 1.5, 2, 0.75];
function cycleAudioSpeed() {
  const i = AUDIO_SPEEDS.indexOf(audioSpeed);
  audioSpeed = AUDIO_SPEEDS[(i + 1) % AUDIO_SPEEDS.length];
  localStorage.setItem('quran-audio-speed', String(audioSpeed));
  if (audioEl) audioEl.playbackRate = audioSpeed;
  updateAudioSpeedUI();
  showToast(`Speed ${audioSpeed}×`);
}
function updateAudioSpeedUI() {
  const b = document.getElementById('audioSpeedBtn');
  if (b) { b.textContent = `${audioSpeed}×`; b.classList.toggle('on', audioSpeed !== 1); }
}
function cycleAudioRepeat() {
  audioRepeat = audioRepeat === 'off' ? 'one' : audioRepeat === 'one' ? 'surah' : 'off';
  localStorage.setItem('quran-audio-repeat', audioRepeat);
  updateAudioRepeatUI();
  showToast(audioRepeat === 'off' ? 'Repeat off' : audioRepeat === 'one' ? 'Repeat this verse' : 'Repeat this surah');
}
function updateAudioRepeatUI() {
  const b = document.getElementById('audioRepeatBtn');
  if (!b) return;
  b.classList.toggle('on', audioRepeat !== 'off');
  b.title = audioRepeat === 'off' ? 'Repeat off' : audioRepeat === 'one' ? 'Repeat one verse' : 'Repeat surah';
}
function cycleSleepTimer() {
  const steps = [0, 5, 10, 15, 30];
  const i = steps.indexOf(sleepMinutes);
  sleepMinutes = steps[(i + 1) % steps.length];
  clearTimeout(sleepTimerId);
  const b = document.getElementById('audioSleepBtn');
  if (sleepMinutes > 0) {
    sleepTimerId = setTimeout(() => { stopAudio(); showToast('Sleep timer — recitation stopped'); cycleSleepTimerReset(); }, sleepMinutes * 60000);
    showToast(`Sleep timer ${sleepMinutes} min`);
  } else showToast('Sleep timer off');
  if (b) { b.classList.toggle('on', sleepMinutes > 0); b.title = sleepMinutes ? `Sleep ${sleepMinutes} min — tap to change` : 'Sleep timer'; }
}
function cycleSleepTimerReset() { sleepMinutes = 0; clearTimeout(sleepTimerId); document.getElementById('audioSleepBtn')?.classList.remove('on'); }

function toggleAudioPlay() {
  if (audioEl && audioS != null && !audioEl.paused && !audioEl.ended) {
    audioEl.pause();
    return;
  }
  if (audioEl && audioS != null && audioEl.src) {
    audioEl.play().catch(() => showToast('Audio blocked — tap play again'));
    return;
  }
  const best = getCenterVerse();
  if (!best) { showToast('Scroll to a verse first'); return; }
  playVerseAudio(parseInt(best.dataset.s, 10), parseInt(best.dataset.v, 10));
}

function stepAudio(dir) {
  if (audioS == null) { toggleAudioPlay(); return; }
  const meta = getSurahMeta(audioS);
  let ns = audioS, nv = audioV + dir;
  if (nv < 1) { ns = audioS - 1; nv = ns >= 1 ? getSurahMeta(ns).verses : 1; }
  else if (meta && nv > meta.verses) { ns = audioS + 1; nv = 1; }
  if (ns < 1) { ns = 1; nv = 1; }
  if (ns > 114) { stopAudio(); showToast('Recitation complete — Khatam!'); return; }
  playVerseAudio(ns, nv);
}

function onAudioEnded() {
  if (audioRepeat === 'one') { playVerseAudio(audioS, audioV); return; }
  if (audioRepeat === 'surah') {
    const meta = getSurahMeta(audioS);
    if (meta && audioV < meta.verses) { playVerseAudio(audioS, audioV + 1); return; }
    playVerseAudio(audioS, 1);
    return;
  }
  stepAudio(1);
}

/* ========== OFFLINE SURAH AUDIO DOWNLOAD ========== */
let audioDl = { surah: null, total: 0, done: 0, running: false, abort: null };

async function appAudioCache() {
  const keys = await caches.keys();
  const hit = keys.find(k => k === 'quran-v13') || keys.find(k => k.startsWith('quran-')) || 'quran-v13';
  return caches.open(hit);
}

async function isSurahAudioCached(s) {
  try {
    if (!('caches' in window)) return false;
    const cache = await appAudioCache();
    const meta = getSurahMeta(s);
    for (let v = 1; v <= meta.verses; v++) {
      if (!(await cache.match(audioUrl(s, v)))) return false;
    }
    return true;
  } catch { return false; }
}

function refreshAudioDlUI() {
  const btn = document.getElementById('audioDlBtn');
  const icon = document.getElementById('audioDlIcon');
  const prog = document.getElementById('audioDlProg');
  if (!btn || !icon || !prog) return;
  if (audioDl.running && audioDl.surah === audioS) {
    icon.textContent = 'close';
    btn.title = 'Cancel download';
    btn.setAttribute('aria-label', 'Cancel audio download');
    prog.classList.remove('hidden');
    prog.textContent = `${audioDl.done}/${audioDl.total}`;
    return;
  }
  prog.classList.add('hidden');
  const s = audioS;
  if (s == null) return;
  icon.textContent = 'download';
  btn.title = 'Download this surah for offline';
  btn.setAttribute('aria-label', 'Download current surah audio for offline');
  isSurahAudioCached(s).then(cached => {
    if (audioS !== s || audioDl.running) return; // stale check
    icon.textContent = cached ? 'download_done' : 'download';
    btn.title = cached ? 'Surah audio already downloaded' : 'Download this surah for offline';
  });
}

async function downloadCurrentSurahAudio() {
  if (audioS == null) return;
  if (audioDl.running) { audioDl.abort?.abort(); return; } // tap × to cancel
  if (!('caches' in window)) { showToast('Downloads need http(s) — serve the app locally'); return; }
  if (!navigator.onLine) { showToast('You are offline — connect to download'); return; }
  const s = audioS;
  const meta = getSurahMeta(s);
  const folder = reciterFolder(); // pin reciter so a mid-download switch can't mix voices
  const recName = reciterShort();
  if (await isSurahAudioCached(s)) { showToast(`${recName} audio already downloaded`); refreshAudioDlUI(); return; }
  audioDl = { surah: s, total: meta.verses, done: 0, running: true, abort: new AbortController() };
  refreshAudioDlUI();
  showToast(`Downloading ${meta.en} (${recName}) — tap × to cancel`);
  try {
    const cache = await appAudioCache();
    for (let v = 1; v <= meta.verses; v++) {
      if (audioDl.abort.signal.aborted) throw new DOMException('aborted', 'AbortError');
      if (!(await cache.match(audioUrl(s, v, folder)))) {
        const res = await fetch(audioUrl(s, v, folder), { signal: audioDl.abort.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        await cache.put(audioUrl(s, v, folder), res);
      }
      audioDl.done = v;
      if (v % 5 === 0 || v === meta.verses) refreshAudioDlUI();
    }
    showToast(`${meta.en} (${recName}) ready for offline`);
  } catch (e) {
    if (e?.name === 'AbortError') showToast('Download cancelled');
    else if (e?.name === 'QuotaExceededError' || /quota/i.test(e?.message || '')) showToast('Storage full — free space and retry');
    else { console.error(e); showToast('Download stopped — check connection'); }
  } finally {
    audioDl = { surah: null, total: 0, done: 0, running: false, abort: null };
    refreshAudioDlUI();
  }
}

function stopAudio() {
  if (audioEl) audioEl.pause();
  if (audioEl) audioEl.removeAttribute('src');
  audioS = null; audioV = null;
  setAudioPlaying(false);
  document.querySelectorAll('.verse-playing').forEach(el => el.classList.remove('verse-playing'));
  document.getElementById('audioBar').classList.remove('visible');
  if (window.matchMedia('(max-width: 640px)').matches) {
    document.getElementById('mobileToolbar').classList.add('visible');
  }
  updateAudioLabel();
}

/* ========== LAST READ ========== */
function saveLastRead() {
  const scrollTop = window.scrollY;
  if (scrollTop < 200) return;
  const best = getCenterVerse();
  if (best) {
    localStorage.setItem('quran-lastread', `${best.dataset.s}:${best.dataset.v}`);
    recordActivity();
  }
}

function restoreLastRead() {
  if (pendingDeepLink) {
    const { s, v } = pendingDeepLink;
    pendingDeepLink = null;
    ensureSurahRendered(s);
    setTimeout(() => {
      if (v) goToVerse(s, v, false);
      else goToSurah(s, false);
    }, 450);
    return;
  }
  if (pendingResumeHash) { pendingResumeHash = false; }
  // Resume follows the ribbon only — offer it as a pill instead of yanking the user away
  if (ribbonSurah == null) return;
  const s = ribbonSurah, v = ribbonAyah;
  const meta = typeof getSurahMeta === 'function' ? getSurahMeta(s) : null;
  const pill = document.getElementById('resumePill');
  const txt = document.getElementById('resumeText');
  if (pill && txt) {
    txt.textContent = `Resume ${meta ? meta.en : 'Surah ' + s} ${s}:${v}`;
    pill.classList.remove('hidden');
    clearTimeout(restoreLastRead._t);
    restoreLastRead._t = setTimeout(() => pill.classList.add('hidden'), 12000);
  }
}
function resumeLastRead() {
  document.getElementById('resumePill')?.classList.add('hidden');
  if (ribbonSurah == null) { showToast('No ribbon set — tap an ayah number to place one'); return; }
  goToVerse(ribbonSurah, ribbonAyah);
}
function dismissResume() { document.getElementById('resumePill')?.classList.add('hidden'); }
function retryLoad() {
  document.getElementById('loadingText').textContent = 'Loading Quran...';
  loadQuran();
}

/* ========== PWA INSTALL + UPDATES + OFFLINE ========== */
function setupPWA() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    document.getElementById('installBtn')?.classList.remove('hidden');
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    document.getElementById('installBtn')?.classList.add('hidden');
    showToast('App installed — works offline');
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (setupPWA._reloaded) return;
      setupPWA._reloaded = true;
      document.getElementById('updateBanner')?.classList.remove('hidden');
    });
  }
}
function installApp() {
  if (!deferredInstallPrompt) { showToast('Use browser menu → Install app'); return; }
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.finally(() => {
    deferredInstallPrompt = null;
    document.getElementById('installBtn')?.classList.add('hidden');
  });
}
function applyUpdate() { window.location.reload(); }
function setupOfflineBanner() {
  const update = () => document.getElementById('offlineBanner')?.classList.toggle('hidden', navigator.onLine);
  window.addEventListener('online', () => { update(); showToast('Back online'); });
  window.addEventListener('offline', update);
  update();
}

/* ========== KEYBOARD SHORTCUTS ========== */
document.addEventListener('keydown', e => {
  const tag = e.target.tagName;
  const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;

  // Let Space activate focused buttons normally; only hijack Space elsewhere
  if (e.key === ' ' && !isInput && !(tag === 'BUTTON' || e.target.closest?.('button'))) {
    e.preventDefault();
    toggleAutoScroll();
    return;
  }

  if (isInput) return;

  if (e.key === 'Escape') {
    const menu = document.getElementById('ayaMenu');
    if (menu) { menu.remove(); return; }
    const reciterMenu = document.getElementById('reciterMenu');
    if (reciterMenu && !reciterMenu.classList.contains('hidden')) { closeReciterMenu(); return; }
    if (sidebarOpen) { closeSidebar(); return; }
  }

  if (e.key === '/') { e.preventDefault(); openSidebar(); switchTab('search'); return; }
  if (e.key === 'h' || e.key === 'H') { scrollToTop(); return; }
  if (e.key === '+' || e.key === '=') { adjustFontSize(1); return; }
  if (e.key === '-' || e.key === '_') { adjustFontSize(-1); return; }
  if (e.key === 'ArrowRight') { jumpSurah(-1); return; }
  if (e.key === 'ArrowLeft') { jumpSurah(1); return; }
  if (e.key === 'b' || e.key === 'B') { bookmarkNearestVerse(); return; }
  if (e.key === 'r' || e.key === 'R') { toggleRibbon(); return; }
  if (e.key === 'f' || e.key === 'F') { toggleFullscreen(); return; }
  if (e.key === 'p' || e.key === 'P') { toggleAudioPlay(); return; }
  if (e.key === 't' || e.key === 'T') { toggleTajweed(); return; }
});

function jumpSurah(dir) {
  const midY = window.innerHeight / 2;
  let best = null, bestDist = Infinity;
  document.querySelectorAll('.surah-card').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.height === 0) return;
    const dist = Math.abs((r.top + r.height / 2) - midY);
    if (dist < bestDist) { bestDist = dist; best = el; }
  });
  if (!best) return;
  const current = parseInt(best.dataset.surah, 10);
  const next = Math.max(1, Math.min(114, current + dir));
  goToSurah(next);
}

function bookmarkNearestVerse() {
  const best = getCenterVerse();
  if (!best) return;
  toggleBookmark(parseInt(best.dataset.s, 10), parseInt(best.dataset.v, 10));
}

/* ========== FULLSCREEN ========== */
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen();
  }
}

document.addEventListener('fullscreenchange', () => {
  const isFs = !!document.fullscreenElement;
  document.getElementById('fsIconExpand').classList.toggle('hidden', isFs);
  document.getElementById('fsIconShrink').classList.toggle('hidden', !isFs);
  document.getElementById('fsExitBtn').classList.toggle('hidden', !isFs || window.innerWidth > 640);
});

// Tap to reveal header in fullscreen (mobile)
document.addEventListener('click', e => {
  if (!document.fullscreenElement || window.innerWidth > 640) return;
  if (e.target.closest('header') || e.target.closest('#fsExitBtn') || e.target.closest('#autoScrollBar') || e.target.closest('#mobileToolbar')) return;
  const header = document.querySelector('header');
  header.style.opacity = '1';
  header.style.pointerEvents = 'auto';
  clearTimeout(header._fsTimer);
  header._fsTimer = setTimeout(() => {
    if (document.fullscreenElement) {
      header.style.opacity = '';
      header.style.pointerEvents = '';
    }
  }, 3000);
});

/* ========== SWIPE NAVIGATION ========== */
let touchStartX = 0, touchStartY = 0, touchStartTime = 0;

document.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  touchStartTime = Date.now();
}, { passive: true });

document.addEventListener('touchend', e => {
  if (sidebarOpen || document.getElementById('ayaMenu')) return;
  if (e.target.closest && (e.target.closest('#sidebarPanel') || e.target.closest('.dropdown-panel') || e.target.closest('input'))) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  const dt = Date.now() - touchStartTime;
  if (dt > 500 || Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 60) return;
  if (dx > 0) jumpSurah(-1);
  else jumpSurah(1);
}, { passive: true });

/* ========== EXPORT VERSE ========== */
function exportNearestVerse() {
  const best = getCenterVerse();
  if (!best) return;
  const s = parseInt(best.dataset.s, 10);
  const v = parseInt(best.dataset.v, 10);
  const verse = quranData[s]?.find(x => x.verse === v);
  if (!verse) return;
  const meta = getSurahMeta(s);
  const text = buildVerseExportText(s, v, verse, meta, true);
  if (navigator.share) {
    navigator.share({ text }).catch(() => {
      copyTextWithFallback(text).then(() => showToast('Verse copied with reference')).catch(() => showToast('Export failed'));
    });
  } else {
    copyTextWithFallback(text).then(() => showToast('Verse copied with reference')).catch(() => showToast('Copy failed — long-press to copy'));
  }
}

/* ========== BOOKMARKS ========== */
function getBookmarks() {
  try {
    const data = JSON.parse(localStorage.getItem('quran-bookmarks'));
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

function isBookmarkedHere(s, v) {
  return bookmarkSet.has(`${s}:${v}`);
}

function updateVerseBookmarkUI(s, v) {
  const verseEl = document.querySelector(`[data-s="${s}"][data-v="${v}"]`);
  if (!verseEl) return;
  const marked = bookmarkSet.has(`${s}:${v}`);
  verseEl.classList.toggle('has-bookmark', marked);
  const dot = verseEl.querySelector('.bookmark-dot');
  if (marked && !dot) {
    const span = document.createElement('span');
    span.className = 'inline-block w-2 h-2 rounded-full mx-0.5 align-middle bookmark-dot';
    span.style.cssText = 'background:var(--accent);vertical-align:middle';
    const arabicLine = verseEl.querySelector('.verse-ar') || verseEl;
    arabicLine.appendChild(span);
  } else if (!marked && dot) {
    dot.remove();
  }
}

function toggleBookmark(s, v) {
  let marks = getBookmarks();
  const idx = marks.findIndex(m => m.s === s && m.v === v);
  if (idx >= 0) {
    marks.splice(idx, 1);
    showToast('Bookmark removed');
  } else {
    const first = marks.length === 0;
    marks.push({ s, v });
    showToast(first
      ? `Bookmarked ${getSurahMeta(s).en} : ${v} — view all in Menu → Bookmarks`
      : `Bookmarked ${getSurahMeta(s).en} : ${v}`);
  }
  localStorage.setItem('quran-bookmarks', JSON.stringify(marks));
  refreshBookmarkCache();
  updateVerseBookmarkUI(s, v);
  loadBookmarks();
  updateBookmarkBtn();
}

/* Header star reflects whether the verse in view is bookmarked */
function updateBookmarkBtn(best) {
  const btn = document.getElementById('bookmarkBtn');
  const icon = document.getElementById('bookmarkBtnIcon');
  if (!btn || !icon) return;
  const el = best || getCenterVerse();
  const marked = el ? bookmarkSet.has(`${el.dataset.s}:${el.dataset.v}`) : false;
  icon.classList.toggle('filled', marked);
  btn.setAttribute('aria-pressed', marked ? 'true' : 'false');
  btn.title = marked ? 'Remove bookmark for current verse (B)' : 'Bookmark current verse (B)';
}

/* Count badge on the Bookmarks tab so the list is impossible to miss */
function updateBookmarkTabBadge() {
  const tab = document.querySelector('[data-nav-tab="bookmarks"]');
  if (!tab) return;
  const n = getBookmarks().length;
  tab.textContent = n > 0 ? `Bookmarks (${n})` : 'Bookmarks';
}

function loadBookmarks() {
  const panel = document.getElementById('bookmarksPanel');
  if (!panel) return;
  updateBookmarkTabBadge();
  const marks = getBookmarks();
  if (!marks.length) {
    panel.innerHTML = '<div class="empty-state"><span class="material-symbols-outlined" aria-hidden="true">bookmark</span><p class="text-sm text-center">No bookmarks yet.<br>Tap an ayah number to save verses here.</p></div>';
    return;
  }
  const arabicReady = Object.keys(quranData).length > 0;
  panel.innerHTML = '';
  const frag = document.createDocumentFragment();
  [...marks]
    .sort((a, b) => a.s - b.s || a.v - b.v)
    .forEach(m => {
      const meta = getSurahMeta(m.s);
      const verse = arabicReady ? quranData[m.s]?.find(x => x.verse === m.v) : null;
      const card = document.createElement('div');
      card.className = 'saved-verse';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      const go = () => goToVerse(m.s, m.v);
      card.addEventListener('click', go);
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });

      const top = document.createElement('div');
      top.className = 'saved-verse-top';
      const ref = document.createElement('span');
      ref.className = 'saved-verse-ref';
      ref.textContent = `${meta ? meta.en : 'Surah ' + m.s} ${m.s}:${m.v}`;
      top.appendChild(ref);

      const del = document.createElement('button');
      del.className = 'saved-verse-del';
      del.title = 'Remove bookmark';
      del.setAttribute('aria-label', `Remove bookmark ${m.s}:${m.v}`);
      const delIcon = document.createElement('span');
      delIcon.className = 'material-symbols-outlined';
      delIcon.setAttribute('aria-hidden', 'true');
      delIcon.textContent = 'delete';
      del.appendChild(delIcon);
      del.addEventListener('click', e => { e.stopPropagation(); toggleBookmark(m.s, m.v); });
      top.appendChild(del);
      card.appendChild(top);

      if (verse) {
        const ar = document.createElement('div');
        ar.className = 'saved-verse-ar';
        ar.setAttribute('dir', 'rtl');
        ar.setAttribute('lang', 'ar');
        ar.textContent = cleanVerseText(verse.text);
        card.appendChild(ar);

        if (showTranslation) {
          const t = getTranslationText(m.s, m.v);
          if (t) {
            const tr = document.createElement('div');
            tr.className = 'saved-verse-tr';
            tr.textContent = t;
            card.appendChild(tr);
          }
        }
      } else {
        const pending = document.createElement('div');
        pending.className = 'saved-verse-tr';
        pending.textContent = meta ? meta.name : '';
        card.appendChild(pending);
      }
      frag.appendChild(card);
    });
  panel.appendChild(frag);
}

function clearBookmarks() {
  localStorage.removeItem('quran-bookmarks');
  refreshBookmarkCache();
  document.querySelectorAll('.bookmark-dot').forEach(el => el.remove());
  loadBookmarks();
  showToast('All bookmarks cleared');
}

/* ========== KHATMA TRACKER (Juz completion + reading streak) ========== */
function getKhatma() {
  try {
    const d = JSON.parse(localStorage.getItem('quran-khatma'));
    if (d && Array.isArray(d.done) && d.done.length === 30) return d;
  } catch { /* fall through */ }
  return { done: Array(30).fill(false) };
}

function saveKhatma(k) {
  localStorage.setItem('quran-khatma', JSON.stringify(k));
}

function getActivityDays() {
  try {
    const d = JSON.parse(localStorage.getItem('quran-activity'));
    return Array.isArray(d) ? d : [];
  } catch { return []; }
}

function recordActivity() {
  try {
    const days = getActivityDays();
    const today = new Date().toISOString().slice(0, 10);
    if (!days.includes(today)) {
      days.push(today);
      while (days.length > 400) days.shift();
      localStorage.setItem('quran-activity', JSON.stringify(days));
    }
  } catch { /* ignore */ }
}

function getStreak() {
  const set = new Set(getActivityDays());
  const iso = d => d.toISOString().slice(0, 10);
  const d = new Date();
  if (!set.has(iso(d))) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (set.has(iso(d))) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

function toggleJuzDone(n) {
  const k = getKhatma();
  k.done[n - 1] = !k.done[n - 1];
  saveKhatma(k);
  const btn = document.querySelectorAll('#juzList .juz-check')[n - 1];
  if (btn) {
    const done = k.done[n - 1];
    btn.setAttribute('aria-pressed', done ? 'true' : 'false');
    btn.title = done ? 'Mark Juz as not read' : 'Mark Juz as read';
    btn.setAttribute('aria-label', `Mark Juz ${n} as ${done ? 'not read' : 'read'}`);
    const icon = btn.querySelector('.material-symbols-outlined');
    if (icon) { icon.textContent = done ? 'check_circle' : 'circle'; icon.classList.toggle('filled', done); }
  }
  renderJuzProgress();
  showToast(k.done[n - 1] ? `Juz ${n} complete` : `Juz ${n} unmarked`);
}

function resetKhatma() {
  if (!confirm('Clear all 30 Juz checkmarks?')) return;
  saveKhatma({ done: Array(30).fill(false) });
  document.querySelectorAll('#juzList .juz-check').forEach((btn, i) => {
    btn.setAttribute('aria-pressed', 'false');
    btn.title = 'Mark Juz as read';
    btn.setAttribute('aria-label', `Mark Juz ${i + 1} as read`);
    const icon = btn.querySelector('.material-symbols-outlined');
    if (icon) { icon.textContent = 'circle'; icon.classList.remove('filled'); }
  });
  renderJuzProgress();
  showToast('Khatma progress cleared');
}

function renderJuzProgress() {
  const host = document.getElementById('juzProgress');
  if (!host) return;
  const k = getKhatma();
  const done = k.done.filter(Boolean).length;
  const pct = Math.round((done / 30) * 100);
  const streak = getStreak();
  host.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'khatma-title';
  const titleIcon = document.createElement('span');
  titleIcon.className = 'material-symbols-outlined';
  titleIcon.setAttribute('aria-hidden', 'true');
  titleIcon.textContent = 'track_changes';
  title.appendChild(titleIcon);
  title.appendChild(document.createTextNode(`Khatma — ${done} of 30 Juz (${pct}%)`));
  host.appendChild(title);

  const bar = document.createElement('div');
  bar.className = 'khatma-bar';
  const fill = document.createElement('div');
  fill.className = 'khatma-fill';
  fill.style.width = pct + '%';
  bar.appendChild(fill);
  host.appendChild(bar);

  const sub = document.createElement('div');
  sub.className = 'khatma-sub';
  const fire = document.createElement('span');
  fire.className = 'material-symbols-outlined';
  fire.setAttribute('aria-hidden', 'true');
  fire.textContent = 'local_fire_department';
  sub.appendChild(fire);
  sub.appendChild(document.createTextNode(streak === 1 ? '1-day reading streak' : `${streak}-day reading streak`));
  host.appendChild(sub);

  if (done > 0) {
    if (done === 30) {
      const doneMsg = document.createElement('div');
      doneMsg.className = 'khatma-sub';
      doneMsg.style.marginTop = '0.35rem';
      doneMsg.textContent = 'Khatam Mubarak — full Quran complete!';
      host.appendChild(doneMsg);
    }
    const reset = document.createElement('button');
    reset.className = 'khatma-reset';
    reset.textContent = 'Reset progress';
    reset.addEventListener('click', resetKhatma);
    host.appendChild(reset);
  }
}

/* ========== NAVIGATION ========== */
function writeHash(s, v) {
  if (!hashSyncEnabled) return;
  try { history.replaceState(null, '', v ? `#/${s}/${v}` : `#/${s}`); } catch (_) {}
}
function parseHash() {
  const m = (location.hash || '').match(/^#\/(\d{1,3})(?:\/(\d{1,3}))?$/);
  if (!m) return null;
  const s = Math.max(1, Math.min(114, parseInt(m[1], 10)));
  const v = m[2] ? parseInt(m[2], 10) : null;
  if (v != null) {
    const max = getSurahMeta(s)?.verses || 0;
    if (v < 1 || v > max) return { s, v: null };
    return { s, v };
  }
  return { s, v: null };
}
function setupDeepLinks() {
  window.addEventListener('hashchange', () => {
    const h = parseHash();
    if (!h) return;
    hashSyncEnabled = false;
    if (h.v) goToVerse(h.s, h.v, false);
    else goToSurah(h.s, false);
    hashSyncEnabled = true;
  });
  const h0 = (location.hash || '');
  if (h0 === '#resume') { pendingResumeHash = true; return; }
  if (h0 === '#search') { setTimeout(() => { openSidebar(); switchTab('search'); }, 600); return; }
  if (h0 === '#recite') { setTimeout(() => toggleAudioPlay(), 800); return; }
  const parsed = parseHash();
  if (parsed) pendingDeepLink = parsed;
}
let pendingDeepLink = null, pendingResumeHash = false;
function goToSurah(n, pushHash = true) {
  closeSidebar();
  searchMode = false;
  currentTab = 'surah';
  document.getElementById('searchInput').value = '';
  filterSidebar();
  document.querySelectorAll('.nav-row.current').forEach(el => { el.classList.remove('current'); el.style.background = 'transparent'; });
  const row = document.querySelector(`[data-surah-row="${n}"]`);
  if (row) { row.classList.add('current'); row.style.background = ''; }

  if (pushHash) writeHash(n, null);
  ensureSurahRendered(n);
  requestAnimationFrame(() => {
    document.getElementById(`surah-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function goToJuz(n) {
  const juz = JUZ_DATA.find(j => j.n === n);
  if (!juz) return;
  closeSidebar();
  const s = juz.fromSurah || juz.from;
  const v = juz.fromAyah || 1;
  if (v && v !== 1) {
    goToVerse(s, v);
  } else {
    goToSurah(s);
  }
}

function flashVerse(el, color = null) {
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('flash-hl');
  void el.offsetWidth;
  el.classList.add('flash-hl');
  if (color) { el.style.background = color; setTimeout(() => { el.style.background = ''; }, 2000); }
  setTimeout(() => el.classList.remove('flash-hl'), 2100);
}

function goToVerse(s, v, pushHash = true) {
  closeSidebar();
  ensureSurahRendered(s);
  if (pushHash) writeHash(s, v);
  requestAnimationFrame(() => {
    flashVerse(document.querySelector(`[data-s="${s}"][data-v="${v}"]`));
  });
}

function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

/* ========== SIDEBAR ========== */
function openSidebar() {
  lastFocusedBeforeSidebar = document.activeElement;
  document.getElementById('sidebarOverlay').classList.remove('hidden');
  const panel = document.getElementById('sidebarPanel');
  panel.style.transform = 'translateX(0)';
  sidebarOpen = true;
  document.getElementById('menuBtn')?.setAttribute('aria-expanded', 'true');
  const search = document.getElementById('searchInput');
  if (search && window.innerWidth > 640) setTimeout(() => search.focus({ preventScroll: true }), 100);
  document.addEventListener('keydown', trapSidebarFocus);
}

function trapSidebarFocus(e) {
  if (!sidebarOpen || e.key !== 'Tab') return;
  const panel = document.getElementById('sidebarPanel');
  const focusables = [...panel.querySelectorAll('button, input, [tabindex="0"]')].filter(el => el.offsetParent !== null);
  if (!focusables.length) return;
  const first = focusables[0], last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function closeSidebar() {
  document.getElementById('sidebarOverlay').classList.add('hidden');
  document.getElementById('sidebarPanel').style.transform = 'translateX(-100%)';
  sidebarOpen = false;
  document.getElementById('menuBtn')?.setAttribute('aria-expanded', 'false');
  document.removeEventListener('keydown', trapSidebarFocus);
  if (lastFocusedBeforeSidebar?.focus) { try { lastFocusedBeforeSidebar.focus({ preventScroll: true }); } catch (_) {} }
}

const TAB_PANELS = { surah: 'tabSurah', juz: 'tabJuz', bookmarks: 'tabBookmarks', search: 'tabSearch' };

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('[data-nav-tab]').forEach(el => {
    el.classList.toggle('active-tab', el.dataset.navTab === tab);
  });
  Object.entries(TAB_PANELS).forEach(([key, id]) => {
    document.getElementById(id).classList.toggle('hidden', key !== tab);
  });

  if (tab === 'bookmarks') loadBookmarks();
  if (tab === 'juz' && typeof renderJuzProgress === 'function') renderJuzProgress();
  if (tab === 'search') {
    const input = document.getElementById('verseSearchInput');
    if (input && window.innerWidth > 640) setTimeout(() => input.focus({ preventScroll: true }), 100);
  }
  const surahSearch = document.getElementById('searchInput');
  if (surahSearch) {
    surahSearch.parentElement.classList.toggle('hidden', !(tab === 'surah' || tab === 'juz'));
  }
}

function filterSidebar() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const items = document.querySelectorAll(`#tabSurah > div, #juzList > div`);
  items.forEach(el => {
    const text = el.textContent.toLowerCase();
    el.style.display = text.includes(q) ? '' : 'none';
  });
}

/* ========== VERSE SEARCH (Arabic + loaded translation/transliteration) ========== */
let searchIndexCache = null;
let verseSearchTimer = null;

function normalizeArabic(s) {
  return String(s)
    .replace(/[ً-ٟ]/g, '') // U+064B–U+065F harakat + hamza marks
    .replace(/[ٰـ]/g, '') // superscript alef U+0670 + tatweel U+0640
    .replace(/[ۖ-ۭ]/g, '') // U+06D6–U+06ED extended Arabic marks
    .replace(/[ࣰ-ࣿ]/g, '') // U+08F0–U+08FF Quranic annotation signs (Uthmani)
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');
}

function buildSearchIndex() {
  if (searchIndexCache) return searchIndexCache;
  const idx = [];
  for (let s = 1; s <= 114; s++) {
    (quranData[s] || []).forEach(v => {
      idx.push({ s, v: v.verse, ar: normalizeArabic(cleanVerseText(v.text)), raw: cleanVerseText(v.text) });
    });
  }
  searchIndexCache = idx;
  return idx;
}

function handleVerseSearch() {
  clearTimeout(verseSearchTimer);
  verseSearchTimer = setTimeout(runVerseSearch, 250);
}

function runVerseSearch() {
  const input = document.getElementById('verseSearchInput');
  const meta = document.getElementById('verseSearchMeta');
  const results = document.getElementById('verseSearchResults');
  const q = (input.value || '').trim();
  if (q.length < 2) {
    meta.textContent = 'Type at least 2 characters. Searches Arabic text.';
    results.innerHTML = '';
    return;
  }
  const hasLatin = /[a-zA-Z]/.test(q);
  const qAr = normalizeArabic(q);
  const qLow = q.toLowerCase();
  const useTranslation = hasLatin && Object.keys(translationData).length > 0;
  const useTranslit = hasLatin && Object.keys(translitData).length > 0;
  const idx = buildSearchIndex();
  const hits = [];
  for (const entry of idx) {
    let matched = entry.ar.includes(qAr);
    let snippet = null;
    if (!matched && useTranslation) {
      const t = getTranslationText(entry.s, entry.v);
      if (t && t.toLowerCase().includes(qLow)) { matched = true; snippet = t; }
    }
    if (!matched && useTranslit) {
      const t = getTranslitText(entry.s, entry.v);
      if (t && t.toLowerCase().includes(qLow)) { matched = true; snippet = snippet || t; }
    }
    if (matched) {
      hits.push({ ...entry, snippet });
      if (hits.length >= 100) break;
    }
  }
  if (!hits.length) {
    meta.textContent = hasLatin && !useTranslation && !useTranslit
      ? 'No matches. Tip: enable a translation or transliteration to search English/Latin text.'
      : 'No verses found. Try different words.';
    results.innerHTML = '';
    return;
  }
  const capped = hits.length >= 100;
  meta.textContent = `Showing ${hits.length}${capped ? ' of 100+ (refine to narrow)' : ''} result${hits.length === 1 ? '' : 's'}`;
  const frag = document.createDocumentFragment();
  const highlight = (text, query) => {
    try {
      const q = query.trim();
      if (!q || q.length < 2 || /[\u0600-\u06FF]/.test(q)) return null;
      const i = text.toLowerCase().indexOf(q.toLowerCase());
      if (i < 0) return null;
      const fragH = document.createDocumentFragment();
      fragH.appendChild(document.createTextNode(text.slice(0, i)));
      const m = document.createElement('mark');
      m.textContent = text.slice(i, i + q.length);
      fragH.appendChild(m);
      fragH.appendChild(document.createTextNode(text.slice(i + q.length)));
      return fragH;
    } catch (_) { return null; }
  };
  hits.forEach(h => {
    const surahMeta = getSurahMeta(h.s);
    const row = document.createElement('div');
    row.className = 'verse-result';
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    const go = () => goToVerse(h.s, h.v);
    row.addEventListener('click', go);
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });

    const ref = document.createElement('div');
    ref.className = 'verse-result-ref';
    ref.textContent = `${surahMeta ? surahMeta.en : 'Surah ' + h.s} ${h.s}:${h.v}`;
    row.appendChild(ref);

    const ar = document.createElement('div');
    ar.className = 'verse-result-ar';
    ar.setAttribute('dir', 'rtl');
    ar.setAttribute('lang', 'ar');
    const arShort = h.raw.length > 160 ? h.raw.slice(0, 160) + '…' : h.raw;
    ar.textContent = arShort;
    row.appendChild(ar);

    const src = h.snippet || (useTranslation ? getTranslationText(h.s, h.v) : null);
    if (src) {
      const tr = document.createElement('div');
      tr.className = 'verse-result-tr';
      const srcShort = src.length > 180 ? src.slice(0, 180) + '…' : src;
      const hl = highlight(srcShort, q);
      if (hl) tr.appendChild(hl);
      else tr.textContent = srcShort;
      row.appendChild(tr);
    }
    frag.appendChild(row);
  });
  results.innerHTML = '';
  results.appendChild(frag);
}

/* ========== SEARCH ========== */
function handleAyaClick(e, s, v) {
  e.stopPropagation();
  const meta = getSurahMeta(s);
  showAyaMenu(s, v, meta);
}

function showAyaMenu(s, v, meta) {
  const existing = document.getElementById('ayaMenu');
  if (existing) existing.remove();

  const ribboned = ribbonSurah === s && ribbonAyah === v;
  const menu = document.createElement('div');
  menu.id = 'ayaMenu';
  menu.setAttribute('role', 'menu');
  menu.style.cssText = 'position:fixed;z-index:999;min-width:200px;max-width:min(240px,calc(100vw - 24px));';

  const ayaEl = document.querySelector(`[data-s="${s}"][data-v="${v}"] .aya-num`);
  const rect = ayaEl ? ayaEl.getBoundingClientRect() : { left: window.innerWidth / 2, bottom: window.innerHeight / 2 };
  const menuW = Math.min(220, window.innerWidth - 24);
  menu.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - menuW - 12))}px`;
  menu.style.top = `${rect.bottom + 8}px`;

  let items = '';
  items += `<div class="dropdown-item" role="menuitem" tabindex="-1" data-aya-act="bookmark" onclick="toggleBookmark(${s},${v});this.closest('#ayaMenu').remove()">`;
  items += `${isBookmarkedHere(s,v) ? '★ Remove Bookmark' : '☆ Bookmark'}</div>`;
  items += `<div class="dropdown-item" role="menuitem" tabindex="-1" data-aya-act="ribbon" onclick="${ribboned ? `clearRibbonStored(true)` : `setRibbon(${s},${v},true)`};this.closest('#ayaMenu').remove()">`;
  items += `${ribboned ? '● Remove Ribbon' : '○ Set Ribbon'}</div>`;
  items += `<div class="dropdown-item" role="menuitem" tabindex="-1" data-aya-act="export" onclick="copyVerse(${s},${v});this.closest('#ayaMenu').remove()">Export verse</div>`;
  items += `<div class="dropdown-item" role="menuitem" tabindex="-1" data-aya-act="play" onclick="playVerseAudio(${s},${v});this.closest('#ayaMenu').remove()">Play recitation</div>`;
  const savedCount = getBookmarks().length;
  if (savedCount > 0) {
    items += `<div class="dropdown-item" role="menuitem" tabindex="-1" data-aya-act="all" onclick="this.closest('#ayaMenu').remove();openSidebar();switchTab('bookmarks')">View all bookmarks (${savedCount})</div>`;
  }
  menu.innerHTML = items;
  document.body.appendChild(menu);

  // Clamp vertically so the popup never runs under the bottom toolbar
  const mRect = menu.getBoundingClientRect();
  const bottomSafe = 90 + (window.innerWidth <= 640 ? 24 : 0);
  if (mRect.bottom > window.innerHeight - bottomSafe) {
    menu.style.top = `${Math.max(12, window.innerHeight - mRect.height - bottomSafe)}px`;
  }
  const menuItems = [...menu.querySelectorAll('[role="menuitem"]')];
  menuItems.forEach((it, i) => {
    it.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); menuItems[(i + 1) % menuItems.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); menuItems[(i - 1 + menuItems.length) % menuItems.length].focus(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); it.click(); }
      else if (e.key === 'Escape') { menu.remove(); }
    });
  });
  if (menuItems[0]) menuItems[0].focus();

  setTimeout(() => {
    document.addEventListener('click', function handler() {
      menu.remove();
      document.removeEventListener('click', handler);
    }, { once: true });
  }, 10);
}

function buildVerseExportText(s, v, verse, meta, withNumbers = true) {
  let text = cleanVerseText(verse.text);
  if (showTransliteration) {
    const t = getTranslitText(s, v);
    if (t) text += `\n\n${t}`;
  }
  if (showTranslation) {
    const t = getTranslationText(s, v);
    if (t) text += `\n\n"${t}"`;
  }
  const ref = withNumbers
    ? `— ${meta.name} (${meta.en}) ${arabicNum(v)} : ${v}`
    : `— ${meta.name} (${meta.en}) ${arabicNum(v)}`;
  return `${text}\n\n${ref}`;
}

function copyVerse(s, v) {
  const verse = quranData[s]?.find(x => x.verse === v);
  if (!verse) return;
  const meta = getSurahMeta(s);
  const text = buildVerseExportText(s, v, verse, meta, false);
  copyTextWithFallback(text).then(() => showToast('Verse copied!')).catch(() => showToast('Copy failed'));
}

function handleSearch(e) {
  if (e.key === 'Escape') {
    e.target.value = '';
    searchMode = false;
    filterSidebar();
    return;
  }
  if (e.key === 'Enter') {
    const val = e.target.value.trim();
    const match = val.match(/^(\d{1,3})\s*[:\s]\s*(\d{1,3})$/);
    if (match) {
      const s = parseInt(match[1]), v = parseInt(match[2]);
      if (s >= 1 && s <= 114 && v >= 1 && v <= (getSurahMeta(s)?.verses || 0)) {
        e.target.value = '';
        closeSidebar();
        goToVerse(s, v);
        return;
      }
    }
    const num = parseInt(val);
    if (num >= 1 && num <= 114) {
      e.target.value = '';
      closeSidebar();
      goToSurah(num);
      return;
    }
  }
  filterSidebar();
}

/* ========== UI ========== */
// Full re-render is now reserved for theme/font changes only.
// Bookmark/ribbon toggles update in place (see updateVerseBookmarkUI / setRibbon).
function refreshView() {
  const best = getCenterVerse();
  const centerKey = best ? `${best.dataset.s}:${best.dataset.v}` : null;
  refreshBookmarkCache();
  resetVirtualList();
  applyFontScale();
  applyRibbonVisual();
  loadBookmarks();
  if (centerKey) {
    const [s, v] = centerKey.split(':').map(Number);
    ensureSurahRendered(s);
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-s="${s}"][data-v="${v}"]`);
      if (el) el.scrollIntoView({ block: 'center' });
    });
  }
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  const inner = toast.querySelector('.toast');
  inner.textContent = msg;
  inner.style.animation = 'none';
  void inner.offsetWidth;
  inner.style.animation = '';
  toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add('hidden'), 3000);
}

/* ========== JUZ NAV ========== */
function getJuzInfo(surah) {
  for (const j of JUZ_DATA) {
    if (surah >= j.from && surah <= j.to) {
      return { n: j.n, startSurah: j.fromSurah || j.from, startAyah: j.fromAyah || 1 };
    }
  }
  return { n: 30, startSurah: 78, startAyah: 1 };
}
