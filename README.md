# Quran Reader

A lightweight, responsive web-based Quran reader built with vanilla HTML, CSS, and JavaScript. Loads Quran text from a public API with no build step required.

## Features

- **Multiple Fonts** — KFGQPC Uthmanic Hafs, Amiri Quran, IndoPak/Nastaleeq, LPMQ Isep Misbah
- **5 Color Themes** — Dark, Light, Sepia, Green, Navy
- **Surah & Juz Navigation** — sidebar with search
- **Bookmarks** — click any ayah number to bookmark it
- **Reading Ribbon** — mark your current place
- **Auto Scroll** — hands-free reading with adjustable speed
- **Font Size Control** — scalable from 60% to 200%
- **Keyboard Shortcuts** — Space, +/−, B, R, F, Arrow keys
- **Swipe Navigation** — swipe left/right on mobile to jump between surahs
- **Reading Progress Bar** — tracks scroll position
- **Session Timer** — shows how long you've been reading
- **Export Verses** — copy or share a verse with its reference
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

## Getting Started

No build step required. Open `index.html` in a browser, or serve it locally:

```bash
# Python
python3 -m http.server 8000

# Node
npx serve .
```

## Project Structure

```
├── index.html        # Main HTML
├── css/
│   └── styles.css    # Themes, fonts, and component styles
└── js/
    ├── data.js       # Surah metadata and Juz data
    └── app.js        # Application logic
```

## Credits

Quran text is fetched from a public Quran API at runtime. Arabic fonts sourced from their respective authors.
