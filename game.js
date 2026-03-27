(function () {
  'use strict';

  const CONFIG = {
    circleRadiusMin: 25,
    circleRadiusMax: 55,
    approachMultiplier: 3,
    spawnInterval: 500,
    circleDuration: 900,
    maxActiveCircles: 5,
    totalCircles: 30,
    perfectThreshold: 0.85,
    goodThreshold: 0.60,
  };

  const STORAGE_KEY = 'circleAimHistory';
  const MAX_HISTORY = 50;

  let nextId = 0;

  function createState() {
    return {
      isRunning: false,
      score: 0,
      combo: 0,
      maxCombo: 0,
      spawned: 0,
      resolved: 0,
      hits: { perfect: 0, good: 0, miss: 0 },
      circles: [],
      spawnTimer: null,
      timeouts: [],
    };
  }

  let state = createState();

  // DOM refs
  const $ = (sel) => document.querySelector(sel);
  const playfield = $('#playfield');
  const overlay = $('#game-overlay');
  const overlayContent = overlay.querySelector('.overlay-content');
  const btnStart = $('#btn-start');
  const btnStop = $('#btn-stop');
  const btnClear = $('#btn-clear');
  const hudScore = $('#hud-score');
  const hudCombo = $('#hud-combo');
  const hudAccuracy = $('#hud-accuracy');
  const hudProgress = $('#hud-progress');
  const historyBody = $('#history-body');
  const historyTable = $('#history-table');
  const historyEmpty = $('#history-empty');
  const settingCount = $('#setting-count');
  const settingSpeed = $('#setting-speed');
  const btnFullscreen = $('#btn-fullscreen');

  // --- Playfield bounds ---
  function getPlayfieldRect() {
    return playfield.getBoundingClientRect();
  }

  // --- Spawning ---
  function randomRadius() {
    return CONFIG.circleRadiusMin + Math.random() * (CONFIG.circleRadiusMax - CONFIG.circleRadiusMin);
  }

  function spawnCircle() {
    if (state.spawned >= CONFIG.totalCircles) return;
    if (state.circles.filter((c) => !c.hit && !c.missed).length >= CONFIG.maxActiveCircles) return;

    const rect = getPlayfieldRect();
    const radius = randomRadius();
    const approachRadius = radius * CONFIG.approachMultiplier;
    const pad = approachRadius + 10;
    const fieldW = rect.width - pad * 2;
    const fieldH = rect.height - pad * 2 - 50;
    let x, y, attempts = 0;

    do {
      x = pad + Math.random() * fieldW;
      y = pad + 50 + Math.random() * fieldH;
      attempts++;
    } while (attempts < 20 && isTooClose(x, y, approachRadius));

    const circle = {
      id: nextId++,
      x,
      y,
      radius,
      approachRadius,
      spawnTime: Date.now(),
      duration: CONFIG.circleDuration,
      hit: false,
      missed: false,
      el: null,
    };

    const size = radius * 2;
    const appSize = approachRadius * 2;

    const container = document.createElement('div');
    container.className = 'circle-container';
    container.style.left = x + 'px';
    container.style.top = y + 'px';
    container.dataset.id = circle.id;

    const hitCircle = document.createElement('div');
    hitCircle.className = 'hit-circle';
    hitCircle.style.width = size + 'px';
    hitCircle.style.height = size + 'px';
    hitCircle.style.fontSize = (radius * 0.6) + 'px';
    hitCircle.textContent = state.spawned + 1;

    const approach = document.createElement('div');
    approach.className = 'approach-circle';
    approach.style.setProperty('--duration', circle.duration + 'ms');
    approach.style.setProperty('--approach-size', appSize + 'px');
    approach.style.setProperty('--circle-size', size + 'px');

    container.appendChild(hitCircle);
    container.appendChild(approach);
    playfield.appendChild(container);

    circle.el = container;
    state.circles.push(circle);
    state.spawned++;
    updateHUD();

    const timeout = setTimeout(() => handleExpiry(circle.id), circle.duration + 50);
    state.timeouts.push(timeout);
  }

  function isTooClose(x, y, approachRadius) {
    return state.circles
      .filter((c) => !c.hit && !c.missed)
      .some((c) => Math.hypot(c.x - x, c.y - y) < (c.approachRadius + approachRadius) * 0.6);
  }

  // --- Expiry ---
  function handleExpiry(id) {
    const circle = state.circles.find((c) => c.id === id);
    if (!circle || circle.hit || circle.missed) return;

    circle.missed = true;
    state.hits.miss++;
    state.combo = 0;
    state.resolved++;

    circle.el.classList.add('missed');
    showPopup(circle.x, circle.y, 'MISS', 'miss');

    setTimeout(() => circle.el.remove(), 300);
    updateHUD();
    checkGameEnd();
  }

  // --- Click handling ---
  playfield.addEventListener('click', (e) => {
    if (!state.isRunning) return;

    const rect = getPlayfieldRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Ripple effect
    showRipple(clickX, clickY);

    const active = state.circles.filter((c) => !c.hit && !c.missed);
    if (active.length === 0) return;

    // Find closest circle within hit range
    let best = null;
    let bestDist = Infinity;

    for (const c of active) {
      const dist = Math.hypot(c.x - clickX, c.y - clickY);
      if (dist < c.approachRadius && dist < bestDist) {
        best = c;
        bestDist = dist;
      }
    }

    if (!best) {
      // Missed click
      state.hits.miss++;
      state.combo = 0;
      state.resolved++;
      state.spawned = Math.min(state.spawned + 1, CONFIG.totalCircles); // count a phantom miss
      playfield.classList.add('miss-flash');
      setTimeout(() => playfield.classList.remove('miss-flash'), 200);
      showPopup(clickX, clickY, 'MISS', 'miss');
      updateHUD();
      return;
    }

    // Calculate timing
    best.hit = true;
    const elapsed = Date.now() - best.spawnTime;
    const progress = Math.min(elapsed / best.duration, 1);

    let rating, points;
    if (progress >= CONFIG.perfectThreshold) {
      rating = 'perfect';
      points = 300;
    } else if (progress >= CONFIG.goodThreshold) {
      rating = 'good';
      points = 100;
    } else {
      rating = 'good'; // early but hit
      points = 50;
    }

    const comboMultiplier = 1 + Math.floor(state.combo / 10) * 0.1;
    points = Math.round(points * Math.min(comboMultiplier, 2));

    state.combo++;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
    state.hits[rating]++;
    state.score += points;
    state.resolved++;

    // Visual feedback
    showBurst(best, rating);
    showPopup(best.x, best.y - 30, '+' + points, rating);

    best.el.remove();
    updateHUD();
    checkGameEnd();
  });

  // --- Visual feedback ---
  function showBurst(circle, rating) {
    const burst = document.createElement('div');
    burst.className = 'hit-burst ' + rating;
    burst.style.left = circle.x + 'px';
    burst.style.top = circle.y + 'px';
    burst.style.position = 'absolute';
    burst.style.transform = 'translate(-50%, -50%)';
    playfield.appendChild(burst);
    setTimeout(() => burst.remove(), 400);
  }

  function showPopup(x, y, text, cls) {
    const popup = document.createElement('div');
    popup.className = 'score-popup ' + cls;
    popup.style.left = x + 'px';
    popup.style.top = y + 'px';
    popup.textContent = text;
    playfield.appendChild(popup);
    setTimeout(() => popup.remove(), 800);
  }

  function showRipple(x, y) {
    const ripple = document.createElement('div');
    ripple.className = 'click-ripple';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    playfield.appendChild(ripple);
    setTimeout(() => ripple.remove(), 400);
  }

  // --- HUD ---
  function updateHUD() {
    hudScore.textContent = state.score;
    hudCombo.textContent = state.combo > 0 ? state.combo + 'x' : '0';
    hudProgress.textContent = state.resolved + '/' + CONFIG.totalCircles;

    const totalHits = state.hits.perfect + state.hits.good + state.hits.miss;
    if (totalHits > 0) {
      const acc = ((state.hits.perfect * 300 + state.hits.good * 100) / (totalHits * 300) * 100);
      hudAccuracy.textContent = acc.toFixed(1) + '%';
    } else {
      hudAccuracy.textContent = '0%';
    }

    // Bump animation
    bump(hudScore);
    if (state.combo > 0) bump(hudCombo);
  }

  function bump(el) {
    el.classList.remove('bump');
    void el.offsetWidth; // reflow
    el.classList.add('bump');
    setTimeout(() => el.classList.remove('bump'), 100);
  }

  // --- Game lifecycle ---
  function startGame() {
    CONFIG.totalCircles = parseInt(settingCount.value, 10);
    CONFIG.circleDuration = parseInt(settingSpeed.value, 10);

    // Clear previous
    cleanup();
    state = createState();
    state.isRunning = true;

    overlay.classList.add('hidden');
    btnStart.disabled = true;
    btnStop.disabled = false;
    settingCount.disabled = true;
    settingSpeed.disabled = true;

    updateHUD();

    // Spawn first immediately, then on interval
    spawnCircle();
    state.spawnTimer = setInterval(() => {
      if (state.spawned < CONFIG.totalCircles) {
        spawnCircle();
      } else {
        clearInterval(state.spawnTimer);
        state.spawnTimer = null;
      }
    }, CONFIG.spawnInterval);
  }

  function stopGame() {
    if (!state.isRunning) return;
    // Mark remaining as missed
    const remaining = CONFIG.totalCircles - state.resolved;
    state.hits.miss += remaining;
    state.resolved = CONFIG.totalCircles;
    endGame();
  }

  function checkGameEnd() {
    if (state.resolved >= CONFIG.totalCircles) {
      endGame();
    }
  }

  function endGame() {
    state.isRunning = false;
    cleanup();

    btnStart.disabled = false;
    btnStop.disabled = true;
    settingCount.disabled = false;
    settingSpeed.disabled = false;

    const totalHits = state.hits.perfect + state.hits.good + state.hits.miss;
    const accuracy = totalHits > 0
      ? (state.hits.perfect * 300 + state.hits.good * 100) / (totalHits * 300) * 100
      : 0;

    const record = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      score: state.score,
      accuracy: Math.round(accuracy * 10) / 10,
      maxCombo: state.maxCombo,
      totalCircles: CONFIG.totalCircles,
      hits: { ...state.hits },
    };

    saveSession(record);
    renderHistory();
    showEndScreen(record);
  }

  function cleanup() {
    if (state.spawnTimer) {
      clearInterval(state.spawnTimer);
      state.spawnTimer = null;
    }
    state.timeouts.forEach(clearTimeout);
    state.timeouts = [];

    // Remove circle elements
    playfield.querySelectorAll('.circle-container, .hit-burst, .score-popup, .click-ripple').forEach((el) => el.remove());
  }

  function showEndScreen(record) {
    const accClass = record.accuracy >= 80 ? 'accuracy-high' : record.accuracy >= 50 ? 'accuracy-mid' : 'accuracy-low';
    overlayContent.innerHTML = `
      <p>Game Over</p>
      <div class="final-score">${record.score}</div>
      <div class="final-accuracy ${accClass}">${record.accuracy}% accuracy</div>
      <div class="final-breakdown">
        Max Combo: ${record.maxCombo}x &nbsp;|&nbsp;
        <span style="color:var(--perfect)">P:${record.hits.perfect}</span> &nbsp;
        <span style="color:var(--good)">G:${record.hits.good}</span> &nbsp;
        <span style="color:var(--miss)">M:${record.hits.miss}</span>
      </div>
      <p style="margin-top:12px;color:var(--text-dim);font-size:0.85rem">Press Start Game to play again</p>
    `;
    overlay.classList.remove('hidden');
  }

  // --- History / localStorage ---
  function loadHistory() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveSession(record) {
    const history = loadHistory();
    history.unshift(record);
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }

  function clearHistory() {
    if (!confirm('Clear all game history?')) return;
    localStorage.removeItem(STORAGE_KEY);
    renderHistory();
  }

  function renderHistory() {
    const history = loadHistory();
    historyBody.innerHTML = '';

    if (history.length === 0) {
      historyTable.classList.add('hidden');
      historyEmpty.classList.remove('hidden');
      return;
    }

    historyTable.classList.remove('hidden');
    historyEmpty.classList.add('hidden');

    for (const r of history) {
      const tr = document.createElement('tr');
      const accClass = r.accuracy >= 80 ? 'accuracy-high' : r.accuracy >= 50 ? 'accuracy-mid' : 'accuracy-low';
      const date = new Date(r.date);
      const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      tr.innerHTML = `
        <td>${dateStr}</td>
        <td>${r.score}</td>
        <td class="${accClass}">${r.accuracy}%</td>
        <td>${r.maxCombo}x</td>
        <td style="color:var(--perfect)">${r.hits.perfect}</td>
        <td style="color:var(--good)">${r.hits.good}</td>
        <td style="color:var(--miss)">${r.hits.miss}</td>
      `;
      historyBody.appendChild(tr);
    }
  }

  // --- Event bindings ---
  btnStart.addEventListener('click', startGame);
  btnStop.addEventListener('click', stopGame);
  btnClear.addEventListener('click', clearHistory);

  // --- Fullscreen ---
  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      playfield.requestFullscreen().catch(() => {});
    }
  }

  function onFullscreenChange() {
    const isFS = !!document.fullscreenElement;
    btnFullscreen.textContent = isFS ? '\u2716 Exit Fullscreen' : '\u26F6 Fullscreen';
  }

  btnFullscreen.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', onFullscreenChange);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !state.isRunning && document.activeElement === document.body) {
      e.preventDefault();
      startGame();
    }
    if (e.code === 'KeyF' && document.activeElement === document.body) {
      e.preventDefault();
      toggleFullscreen();
    }
  });

  // Init
  renderHistory();
})();
