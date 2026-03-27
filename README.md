# Circle Aim

A browser-based aim trainer inspired by osu! — click randomly spawning circles as the approach ring shrinks to score points.

## Play

Open `index.html` in any modern browser. No server or build tools required.

Or play online: [GitHub Pages link after enabling]

## Features

- Random circle spawning with varying sizes and positions
- Shrinking approach ring animation (osu!-style timing mechanic)
- Scoring: **Perfect** (300pts), **Good** (100pts), **Miss** (0pts + combo reset)
- Combo multiplier system (up to 2x)
- Live HUD: score, combo, accuracy, progress
- Fullscreen mode (click button or press `F`)
- Difficulty settings: circle count (15/20/30/50) and speed (Easy/Normal/Hard)
- Game history persisted in localStorage
- Clear history with one click
- Dark theme with visual feedback (hit bursts, score popups, click ripples)

## Controls

| Input | Action |
|-------|--------|
| Click | Aim at circles |
| Space | Start game |
| F | Toggle fullscreen |
| Esc | Exit fullscreen |

## Tech

Vanilla HTML/CSS/JavaScript — zero dependencies, three files:

```
index.html  — page structure
style.css   — dark theme, animations
game.js     — game logic, scoring, persistence
```

## License

MIT
