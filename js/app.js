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
  document.getElementById('fontSizeLabel').textContent = fontScale;
}

/* ========== STATE ========== */
let quranData = {};
let ribbonSurah = null, ribbonAyah = null;
let loadedSurahs = new Set();
let sidebarOpen = false;
let searchMode = false;
let currentTab = 'surah';

/* ========== INIT ========== */
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('quran-theme') || 'dark';
  setTheme(savedTheme, false);

  const savedFont = localStorage.getItem('quran-font') || 'uthman';
  setFont(savedFont, false);

  fontScale = parseInt(localStorage.getItem('quran-fontscale')) || 100;
  applyFontScale();

  loadRibbon();
  loadBookmarks();
  loadQuran();
  setupScroll();
  startSessionTimer();
});

/* ========== THEME / FONT ========== */
function setTheme(theme, save = true) {
  document.documentElement.setAttribute('data-theme', theme);
  if (save) localStorage.setItem('quran-theme', theme);
  document.querySelectorAll('[data-theme-opt]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-theme-opt') === theme);
  });
}

function setFont(font, save = true) {
  document.documentElement.setAttribute('data-font', font);
  if (save) localStorage.setItem('quran-font', font);
  document.querySelectorAll('[data-font-opt]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-font-opt') === font);
  });
}

function toggleDropdown(id) {
  const dd = document.getElementById(id);
  const isHidden = dd.classList.contains('hidden');
  document.querySelectorAll('.dropdown-panel').forEach(d => d.classList.add('hidden'));
  if (isHidden) dd.classList.remove('hidden');
}

document.addEventListener('click', e => {
  if (!e.target.closest('.relative')) {
    document.querySelectorAll('.dropdown-panel').forEach(d => d.classList.add('hidden'));
  }
});

/* ========== DATA ========== */
async function loadQuran() {
  try {
    document.getElementById('progressFill').style.width = '30%';
    const res = await fetch(API_URL);
    const data = await res.json();
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
      loadVisibleSurahs();
      applyFontScale();
      restoreLastRead();
    }, 300);
  } catch (err) {
    document.getElementById('loadingText').textContent = 'Failed to load Quran. Check connection.';
    console.error(err);
  }
}

/* ========== RENDER ========== */
function getSurahMeta(n) {
  return SURAHS.find(s => s.n === n);
}

function shouldShowBismillah(n) {
  return n !== 1 && n !== 9;
}

function renderSurah(n) {
  const meta = getSurahMeta(n);
  const verses = quranData[n];
  if (!meta || !verses) return '';

  const hasRibbon = ribbonSurah === n;
  let html = `<div class="surah-card card-bg border rounded-2xl p-6 sm:p-10 fade-in${hasRibbon ? ' has-ribbon' : ''}" id="surah-${n}" data-surah="${n}">`;
  html += `<div class="text-center mb-8">`;
  html += `<div class="inline-block px-4 py-2 rounded-xl mb-4" style="background:var(--bg-nav-active)">`;
  html += `<span class="text-sm font-semibold" style="color:var(--accent)">${meta.n}</span></div>`;
  html += `<h2 class="text-3xl sm:text-4xl mb-2" style="color:var(--text-heading); font-family:'Amiri',serif">${meta.name}</h2>`;
  html += `<h3 class="text-base sm:text-lg font-medium mb-2" style="color:var(--text-heading-secondary)">${meta.en}</h3>`;
  html += `<p class="text-sm" style="color:var(--text-muted)">${meta.type} • ${meta.verses} Ayahs</p>`;
  html += `</div>`;

  if (shouldShowBismillah(n)) {
    html += `<p class="bismillah text-center mb-8" style="color:var(--text-muted)">بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</p>`;
  }

  html += `<div class="quran-text" style="color:var(--text-primary)">`;
  verses.forEach(v => {
    const ribbonKey = `${n}:${v.verse}`;
    const isRibboned = ribbonSurah === n && ribbonAyah === v.verse;
    const isBookmarked = isBookmarkedHere(n, v.verse);
    html += `<span class="verse-wrap" data-s="${n}" data-v="${v.verse}">`;
    html += v.text;
    html += `<span class="aya-num" onclick="handleAyaClick(event,${n},${v.verse})" title="Click to bookmark/ribbon">`;
    html += `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" stroke-width="1.5" fill="none" stroke="var(--verse-num-fill)"/>`;
    html += `<circle cx="20" cy="20" r="18" fill="var(--verse-num-fill)" opacity="0.4"/></svg>`;
    html += `<span>${arabicNum(v.verse)}</span></span>`;
    if (isRibboned) {
      html += `<span class="ribbon-corner" onclick="event.stopPropagation(); scrollToRibbon()" title="Reading ribbon"></span>`;
    }
    if (isBookmarked) {
      html += `<span class="inline-block w-2 h-2 rounded-full mx-0.5 align-middle" style="background:var(--accent);vertical-align:middle"></span>`;
    }
    html += `</span>`;
  });
  html += `</div></div>`;
  return html;
}

function loadVisibleSurahs() {
  const container = document.getElementById('surahContainer');
  const fragment = document.createDocumentFragment();
  for (let i = 1; i <= 114; i++) {
    if (loadedSurahs.has(i)) continue;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderSurah(i);
    fragment.appendChild(wrapper.firstElementChild);
    loadedSurahs.add(i);
  }
  container.appendChild(fragment);
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
  clearTimeout(scrollSaveTimer);
  scrollSaveTimer = setTimeout(saveLastRead, 1000);
}

/* ========== RIBBON ========== */
function toggleRibbon() {
  if (ribbonSurah) {
    ribbonSurah = null; ribbonAyah = null;
    localStorage.removeItem('quran-ribbon');
    showToast('Ribbon removed');
    updateRibbonUI();
    refreshView();
  } else {
    const midY = window.innerHeight / 2;
    let best = null, bestDist = Infinity;
    document.querySelectorAll('.verse-wrap').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.height === 0) return;
      const dist = Math.abs((r.top + r.height / 2) - midY);
      if (dist < bestDist) { bestDist = dist; best = el; }
    });
    if (!best) { showToast('Scroll to a verse first'); return; }
    const s = parseInt(best.dataset.s);
    const v = parseInt(best.dataset.v);
    ribbonSurah = s; ribbonAyah = v;
    localStorage.setItem('quran-ribbon', `${s}:${v}`);
    showToast(`Ribbon set at ${getSurahMeta(s).en} : ${arabicNum(v)}`);
    updateRibbonUI();
    refreshView();
  }
}

function scrollToRibbon() {
  if (!ribbonSurah) return;
  const el = document.querySelector(`[data-s="${ribbonSurah}"][data-v="${ribbonAyah}"]`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.transition = 'background 0.3s';
    el.style.background = 'rgba(153,27,27,0.2)';
    setTimeout(() => { el.style.background = ''; }, 2000);
  }
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
  runAutoScroll();
  showToast('Auto scroll started — press Space to stop');
}

function runAutoScroll() {
  if (!autoScrolling) return;
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
  if (window.innerWidth <= 640) {
    document.getElementById('mobileToolbar').classList.add('visible');
  }
}

function setAutoScrollSpeed(val) {
  autoScrollSpeed = parseInt(val);
  document.getElementById('autoScrollSpeed').textContent = val;
}

function autoScrollDir(dir) {
  if (!autoScrolling) startAutoScroll();
  const slider = document.getElementById('autoScrollSlider');
  const newVal = Math.max(1, Math.min(20, autoScrollSpeed + dir * 2));
  slider.value = newVal;
  setAutoScrollSpeed(newVal);
}

/* ========== LAST READ ========== */
function saveLastRead() {
  const scrollTop = window.scrollY;
  if (scrollTop < 200) return;
  const midY = window.innerHeight / 2;
  let best = null, bestDist = Infinity;
  document.querySelectorAll('.verse-wrap').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.height === 0) return;
    const dist = Math.abs((r.top + r.height / 2) - midY);
    if (dist < bestDist) { bestDist = dist; best = el; }
  });
  if (best) {
    localStorage.setItem('quran-lastread', `${best.dataset.s}:${best.dataset.v}`);
  }
}

function restoreLastRead() {
  const saved = localStorage.getItem('quran-lastread');
  if (!saved) return;
  const [s, v] = saved.split(':').map(Number);
  if (!s || !v) return;
  loadVisibleSurahs();
  setTimeout(() => {
    const el = document.querySelector(`[data-s="${s}"][data-v="${v}"]`);
    if (el) el.scrollIntoView({ block: 'center' });
  }, 400);
}

/* ========== KEYBOARD SHORTCUTS ========== */
document.addEventListener('keydown', e => {
  const tag = e.target.tagName;
  const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

  if (e.key === ' ' && !isInput) {
    e.preventDefault();
    toggleAutoScroll();
    return;
  }

  if (isInput) return;

  if (e.key === '+' || e.key === '=') { adjustFontSize(1); return; }
  if (e.key === '-' || e.key === '_') { adjustFontSize(-1); return; }
  if (e.key === 'ArrowRight') { jumpSurah(-1); return; }
  if (e.key === 'ArrowLeft') { jumpSurah(1); return; }
  if (e.key === 'b' || e.key === 'B') { bookmarkNearestVerse(); return; }
  if (e.key === 'r' || e.key === 'R') { toggleRibbon(); return; }
  if (e.key === 'f' || e.key === 'F') { toggleFullscreen(); return; }
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
  const current = parseInt(best.dataset.surah);
  const next = Math.max(1, Math.min(114, current + dir));
  goToSurah(next);
}

function bookmarkNearestVerse() {
  const midY = window.innerHeight / 2;
  let best = null, bestDist = Infinity;
  document.querySelectorAll('.verse-wrap').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.height === 0) return;
    const dist = Math.abs((r.top + r.height / 2) - midY);
    if (dist < bestDist) { bestDist = dist; best = el; }
  });
  if (!best) return;
  toggleBookmark(parseInt(best.dataset.s), parseInt(best.dataset.v));
}

/* ========== SESSION TIMER ========== */
let sessionSeconds = 0;
let sessionInterval = null;

function startSessionTimer() {
  sessionInterval = setInterval(() => {
    sessionSeconds++;
    const m = Math.floor(sessionSeconds / 60);
    const s = sessionSeconds % 60;
    document.getElementById('sessionTimer').textContent = `${m}:${String(s).padStart(2, '0')}`;
  }, 1000);
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
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  const dt = Date.now() - touchStartTime;
  if (dt > 500 || Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 60) return;
  if (dx > 0) jumpSurah(-1);
  else jumpSurah(1);
}, { passive: true });

/* ========== EXPORT VERSE ========== */
function exportNearestVerse() {
  const midY = window.innerHeight / 2;
  let best = null, bestDist = Infinity;
  document.querySelectorAll('.verse-wrap').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.height === 0) return;
    const dist = Math.abs((r.top + r.height / 2) - midY);
    if (dist < bestDist) { bestDist = dist; best = el; }
  });
  if (!best) return;
  const s = parseInt(best.dataset.s);
  const v = parseInt(best.dataset.v);
  const verse = quranData[s]?.find(x => x.verse === v);
  if (!verse) return;
  const meta = getSurahMeta(s);
  const text = `${verse.text}\n\n— ${meta.name} (${meta.en}) ${arabicNum(v)} : ${v}`;
  if (navigator.share) {
    navigator.share({ text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => showToast('Verse copied with reference'));
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
  return getBookmarks().some(b => b.s === s && b.v === v);
}

function toggleBookmark(s, v) {
  let marks = getBookmarks();
  const idx = marks.findIndex(m => m.s === s && m.v === v);
  if (idx >= 0) {
    marks.splice(idx, 1);
    showToast('Bookmark removed');
  } else {
    marks.push({ s, v });
    showToast(`Bookmarked ${getSurahMeta(s).en} : ${v}`);
  }
  localStorage.setItem('quran-bookmarks', JSON.stringify(marks));
  refreshView();
}

function loadBookmarks() {
  const panel = document.getElementById('bookmarksPanel');
  const marks = getBookmarks();
  if (!marks.length) {
    panel.innerHTML = '<p class="text-sm text-center py-4" style="color:var(--text-muted)">No bookmarks yet. Click an ayah number to bookmark.</p>';
    return;
  }
  panel.innerHTML = marks.map(m => {
    const meta = getSurahMeta(m.s);
    return `<div class="flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-colors" style="background:var(--bg-hover)" onclick="goToVerse(${m.s},${m.v})">
      <div><span class="font-medium" style="color:var(--text-primary)">${meta.en}</span> <span style="color:var(--text-muted)" class="text-sm">${arabicNum(m.v)}</span></div>
      <span class="text-sm" style="color:var(--text-muted)">${meta.name}</span>
    </div>`;
  }).join('');
}

function clearBookmarks() {
  localStorage.removeItem('quran-bookmarks');
  loadBookmarks();
  refreshView();
  showToast('All bookmarks cleared');
}

/* ========== NAVIGATION ========== */
function goToSurah(n) {
  closeSidebar();
  searchMode = false;
  currentTab = 'surah';
  document.getElementById('searchInput').value = '';
  filterSidebar();

  const el = document.getElementById(`surah-${n}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    loadVisibleSurahs();
    setTimeout(() => {
      document.getElementById(`surah-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }
}

function goToJuz(n) {
  const juz = JUZ_DATA.find(j => j.n === n);
  if (!juz) return;
  closeSidebar();
  goToSurah(juz.from);
}

function goToVerse(s, v) {
  closeSidebar();
  const el = document.querySelector(`[data-s="${s}"][data-v="${v}"]`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.transition = 'background 0.3s';
    el.style.background = 'rgba(217,119,6,0.2)';
    setTimeout(() => { el.style.background = ''; }, 2000);
  } else {
    loadVisibleSurahs();
    setTimeout(() => {
      const el2 = document.querySelector(`[data-s="${s}"][data-v="${v}"]`);
      if (el2) {
        el2.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el2.style.transition = 'background 0.3s';
        el2.style.background = 'rgba(217,119,6,0.2)';
        setTimeout(() => { el2.style.background = ''; }, 2000);
      }
    }, 100);
  }
}

function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

/* ========== SIDEBAR ========== */
function openSidebar() {
  document.getElementById('sidebarOverlay').classList.remove('hidden');
  document.getElementById('sidebarPanel').style.transform = 'translateX(0)';
  sidebarOpen = true;
}

function closeSidebar() {
  document.getElementById('sidebarOverlay').classList.add('hidden');
  document.getElementById('sidebarPanel').style.transform = 'translateX(-100%)';
  sidebarOpen = false;
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('[data-nav-tab]').forEach(el => {
    el.classList.toggle('active-tab', el.dataset.navTab === tab);
  });
  document.getElementById('tabSurah').classList.toggle('hidden', tab !== 'surah');
  document.getElementById('tabJuz').classList.toggle('hidden', tab !== 'juz');
  document.getElementById('tabBookmarks').classList.toggle('hidden', tab !== 'bookmarks');

  if (tab === 'bookmarks') loadBookmarks();
  if (tab === 'surah' || tab === 'juz') {
    document.getElementById('searchInput').parentElement.classList.remove('hidden');
  } else {
    document.getElementById('searchInput').parentElement.classList.add('hidden');
  }
}

function filterSidebar() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const items = document.querySelectorAll(`#tabSurah > div, #tabJuz > div`);
  items.forEach(el => {
    const text = el.textContent.toLowerCase();
    el.style.display = text.includes(q) ? '' : 'none';
  });
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
  menu.style.cssText = 'position:fixed;z-index:999;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:12px;padding:8px;box-shadow:0 8px 32px rgba(0,0,0,0.4);min-width:160px;';

  const rect = document.querySelector(`[data-s="${s}"][data-v="${v}"] .aya-num`).getBoundingClientRect();
  menu.style.left = `${Math.min(rect.left, window.innerWidth - 180)}px`;
  menu.style.top = `${rect.bottom + 8}px`;

  let items = '';
  items += `<div class="dropdown-item" onclick="toggleBookmark(${s},${v});this.closest('#ayaMenu').remove()">`;
  items += `${isBookmarkedHere(s,v) ? '★ Remove Bookmark' : '☆ Bookmark'}</div>`;
  items += `<div class="dropdown-item" onclick="${ribboned ? 'ribbonSurah=null;ribbonAyah=null;localStorage.removeItem(\'quran-ribbon\');showToast(\'Ribbon removed\')' : `ribbonSurah=${s};ribbonAyah=${v};localStorage.setItem('quran-ribbon','${s}:${v}');showToast('Ribbon set')`};updateRibbonUI();refreshView();this.closest('#ayaMenu').remove()">`;
  items += `${ribboned ? '● Remove Ribbon' : '○ Set Ribbon'}</div>`;
  items += `<div class="dropdown-item" onclick="copyVerse(${s},${v});this.closest('#ayaMenu').remove()">Export verse</div>`;
  menu.innerHTML = items;
  document.body.appendChild(menu);

  setTimeout(() => {
    document.addEventListener('click', function handler() {
      menu.remove();
      document.removeEventListener('click', handler);
    }, { once: true });
  }, 10);
}

function copyVerse(s, v) {
  const verse = quranData[s]?.find(x => x.verse === v);
  if (!verse) return;
  const meta = getSurahMeta(s);
  const text = `${verse.text}\n\n— ${meta.name} (${meta.en}) ${arabicNum(v)}`;
  navigator.clipboard.writeText(text).then(() => showToast('Verse copied!'));
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
function refreshView() {
  const container = document.getElementById('surahContainer');
  const scrollY = window.scrollY;
  loadedSurahs.clear();
  container.innerHTML = '';
  loadVisibleSurahs();
  applyFontScale();
  window.scrollTo(0, scrollY);
  loadBookmarks();
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.querySelector('.toast').textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

/* ========== JUZ NAV ========== */
function getJuzInfo(surah) {
  for (const j of JUZ_DATA) {
    if (surah >= j.from && surah <= j.to) {
      return { n: j.n, startSurah: j.from, startAyah: j.n === 1 ? 1 : 1 };
    }
  }
  return { n: 30, startSurah: 67, startAyah: 1 };
}
