# Quran Reader

A lightweight, responsive web-based Quran reader built with vanilla HTML, CSS, and JavaScript. Loads Quran text from a public API with no build step required.

## Features

- **Multiple Fonts** — QPC Uthmani Hafs, Scheherazade New, Amiri Quran, Amiri, IndoPak/Nastaleeq, LPMQ Isep Misbah
- **3 Color Themes** — Dark, Light, Sepia
- **Surah & Juz Navigation** — sidebar with surah search, exact Juz start positions, and swipe support
- **Offline Support (PWA)** — installable, works offline after first load via service worker
- **Material Symbols Icons** — consistent icon set across header, toolbars, and sidebar
- **Translation** — English (Saheeh International, Clear Quran, Taqi Usmani), verse-by-verse, offline-cached
- **Transliteration** — Latin transliteration for pronunciation help
- **Bookmarks** — header bookmark button, `B` key, or tap any ayah number; full reading list with verse text in the sidebar
- **Reading Ribbon** — mark a specific verse to resume from
- **Auto Scroll** — hands-free reading with adjustable speed
- **Font Size Control** — scalable from 60% to 200%
- **Keyboard Shortcuts** — Space, +/−, B, R, F, P, Esc, Arrow keys
- **Swipe Navigation** — swipe left/right on mobile to jump between surahs
- **Reading Progress Bar** — tracks scroll position
- **Export Verses** — copy or share a verse with its reference
- **Audio Recitation** — 6 reciters (Alafasy, Abdul Basit Murattal/Mujawwad, Sudais, Muaiqly, Shuraym), switchable from the player bar, with continuous playback and verse highlighting (`P`); download any surah for fully offline listening with highlighting
- **Verse Search** — sidebar search across all Arabic text (diacritic-insensitive) plus loaded translation/transliteration
- **Khatma Tracker** — mark each of the 30 Juz complete, progress bar, daily reading streak
- **Last Read Persistence** — resumes where you left off
- **Fullscreen Mode**
- **Responsive Design** — optimized for desktop and mobile

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Toggle auto scroll |
| `+` / `−` | Increase / decrease font size |
| `←` / `→` | Jump to next / previous surah |
| `B` | Bookmark nearest verse |
| `R` | Toggle reading ribbon |
| `F` | Toggle fullscreen |
| `P` | Play / pause audio recitation |
| `Esc` | Close menus and sidebar |

## Getting Started

No build step required. Serve it locally (recommended — enables the service worker for offline support):

```bash
# Python
python3 -m http.server 8000

# Node
npx serve .
```

## Project Structure

```
├── index.html        # Main HTML
├── manifest.json     # PWA manifest
├── sw.js             # Service worker (offline caching)
├── icons/            # PWA icons (PNG + SVG)
├── css/
│   └── styles.css    # Themes, fonts, and component styles
└── js/
    ├── data.js       # Surah metadata, Juz data, edition catalog
    └── app.js        # Application logic
```

## Credits

Quran text, translations, and transliteration are fetched from a public Quran API at runtime. Audio recitation (Mishary Rashid Alafasy) streamed from EveryAyah. Arabic fonts sourced from their respective authors.
