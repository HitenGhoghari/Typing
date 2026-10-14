// =========================================================
//  THEME
// =========================================================
const THEME_KEY = 'typing_test_theme';
const themeToggleBtn = document.getElementById('theme-toggle');

function applyTheme(theme) {
    if (theme === 'light') {
        document.body.classList.add('light-theme');
        themeToggleBtn.textContent = '☀️ Light';
    } else {
        document.body.classList.remove('light-theme');
        themeToggleBtn.textContent = '🌙 Dark';
    }
}

function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    // Default is DARK (image 2)
    applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeToggleBtn.addEventListener('click', () => {
    const isLight = document.body.classList.contains('light-theme');
    const next    = isLight ? 'dark' : 'light';
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
});

// Run before anything else so the page paints in the right theme
initTheme();

// =========================================================
//  DOM
// =========================================================
const timerEl        = document.getElementById('timer');
const wordDisplay    = document.getElementById('word-display');
const textViewport   = document.getElementById('text-viewport');
const textScroll     = document.getElementById('text-scroll');
const loadingEl      = document.getElementById('loading');
const loadingText    = document.getElementById('loading-text');
const tooltip        = document.getElementById('tooltip');
const restartBtn     = document.getElementById('restart-btn');
const soundToggleBtn = document.getElementById('sound-toggle');
const progressWrap   = document.getElementById('progress-wrap');
const progressFill   = document.getElementById('progress-fill');
const pageLabel      = document.getElementById('page-label');
const percentLabel   = document.getElementById('percent-label');
const timeValues     = document.getElementById('time-values');
const pageValues     = document.getElementById('page-values');

const timeInput   = document.getElementById('time-input');
const timeSetBtn  = document.getElementById('time-set-btn');
const timeHint    = document.getElementById('time-hint');
const pagesInput  = document.getElementById('pages-input');
const pagesSetBtn = document.getElementById('pages-set-btn');
const pagesHint   = document.getElementById('pages-hint');

const resultsOverlay = document.getElementById('results-overlay');
const resModeTag  = document.getElementById('res-mode-tag');
const resWpm      = document.getElementById('res-wpm');
const resCpm      = document.getElementById('res-cpm');
const resAccuracy = document.getElementById('res-accuracy');
const resTime     = document.getElementById('res-time');
const resCorrect  = document.getElementById('res-correct');
const resWrong    = document.getElementById('res-wrong');
const resWords    = document.getElementById('res-words');
const resMistakes = document.getElementById('res-mistakes');
const resAgainBtn = document.getElementById('res-again-btn');
const resCloseBtn = document.getElementById('res-close-btn');

// =========================================================
//  STATE
// =========================================================
let mode          = 'time';
let durationSec   = 60;
let pagesTarget   = 1;

let targetText    = '';
let typedText     = '';
let timeRemaining = 60;
let elapsedSec    = 0;
let timerInterval = null;
let isTestRunning = false;
let startTime     = null;
let soundEnabled  = true;
let isLoading     = false;
let isRefilling   = false;
let isFetchingMore = false;

let spanCache = [];
let mistakeMap = {};

const CLIENT_FALLBACK =
    "The quick brown fox jumps over the lazy dog. Typing tests help improve speed and accuracy over time.";

const ENDLESS_THRESHOLD = 800;

// =========================================================
//  CACHE
// =========================================================
const STORAGE_KEY     = 'typing_test_queue_v3';
const PAGES_CACHE_KEY = 'typing_test_pages_cache_v1';
const QUEUE_TARGET    = 3;

function loadQueue() {
    try {
        const arr = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch { return []; }
}
function saveQueue(arr) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr.slice(0, 6))); } catch {}
}
function loadPagesCache() {
    try { return JSON.parse(localStorage.getItem(PAGES_CACHE_KEY) || '{}'); }
    catch { return {}; }
}
function savePagesCache(obj) {
    try { localStorage.setItem(PAGES_CACHE_KEY, JSON.stringify(obj)); } catch {}
}
localStorage.removeItem('typing_test_queue_v2');

let paragraphQueue = loadQueue();
let pagesCache     = loadPagesCache();

// =========================================================
//  AUDIO
// =========================================================
const sounds = {
    type:      new Audio('/static/type.mp3'),
    backspace: new Audio('/static/backspace.mp3'),
    error:     new Audio('/static/error.mp3')
};
sounds.type.volume      = 0.5;
sounds.backspace.volume = 0.5;
sounds.error.volume     = 0.6;

function playSound(name) {
    if (!soundEnabled) return;
    const s = sounds[name]; if (!s) return;
    try { s.currentTime = 0; s.play().catch(() => {}); } catch {}
}

// =========================================================
//  FETCHING
// =========================================================
async function fetchText(timeoutMs = 8000) {
    const ctrl = new AbortController();
    const to   = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch('/get-text?mode=time', { signal: ctrl.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (!data || !data.text) throw new Error('No text');
        return { text: data.text, source: data.source || 'unknown' };
    } finally {
        clearTimeout(to);
    }
}

async function refillQueue() {
    if (isRefilling) return;
    isRefilling = true;
    try {
        while (paragraphQueue.length < QUEUE_TARGET) {
            const res  = await fetch('/get-text?mode=time');
            const data = await res.json();
            if (data.source === 'gemini') {
                paragraphQueue.push(data.text);
                saveQueue(paragraphQueue);
            } else break;
        }
    } catch (e) {}
    finally { isRefilling = false; }
}

function takeNextText() {
    if (paragraphQueue.length === 0) return null;
    const text = paragraphQueue.shift();
    saveQueue(paragraphQueue);
    return text;
}

// =========================================================
//  LOAD
// =========================================================
async function loadTest() {
    hideResults();
    targetText = '';
    typedText  = '';
    spanCache  = [];
    mistakeMap = {};

    if (mode === 'time') {
        const cached = takeNextText();
        if (cached) {
            targetText = cached;
            resetTest();
            refillQueue();
            return;
        }
        showLoading(true, 'Generating a fresh passage...');
        try {
            const { text } = await fetchText(8000);
            targetText = text;
        } catch (e) {
            targetText = CLIENT_FALLBACK;
        }
        resetTest();
        showLoading(false);
        refillQueue();
    } else {
        await loadPagesText();
    }
}

async function loadPagesText() {
    const key      = String(pagesTarget);
    const minChars = pagesTarget * 2000;
    const cached   = pagesCache[key];

    if (cached && cached.length >= minChars) {
        console.log(`📄 pages: using cached ${pagesTarget}-page text`);
        targetText = cached;
        resetTest();
        return;
    }

    const words = pagesTarget * 500;
    showLoading(true, `Generating ${pagesTarget} page${pagesTarget > 1 ? 's' : ''} (${words} words)…`);
    try {
        const t0 = performance.now();
        const res = await fetch(`/get-long-text?words=${words}`);
        const data = await res.json();
        const ms = Math.round(performance.now() - t0);
        console.log(`📄 pages: got ${data.text.length} chars in ${ms}ms (${data.source})`);
        targetText = data.text;
        if (data.source === 'gemini') {
            pagesCache[key] = targetText;
            savePagesCache(pagesCache);
        }
    } catch (e) {
        console.warn('Pages load failed:', e);
        targetText = CLIENT_FALLBACK;
    }
    resetTest();
    showLoading(false);
}

function showLoading(show, text) {
    isLoading = show;
    loadingEl.classList.toggle('active', show);
    textViewport.style.display = show ? 'none' : 'block';
    tooltip.classList.remove('visible');
    restartBtn.disabled = show;
    if (text) loadingText.textContent = text;
}

// =========================================================
//  RENDERING
// =========================================================
function resetTest() {
    isTestRunning = false;
    clearInterval(timerInterval);
    typedText  = '';
    elapsedSec = 0;
    startTime  = null;
    mistakeMap = {};

    textScroll.style.transition = 'none';
    textScroll.style.transform  = 'translateY(0)';
    requestAnimationFrame(() => {
        textScroll.style.transition = '';
    });

    if (mode === 'time') {
        timeRemaining = durationSec;
        timerEl.textContent = formatTime(timeRemaining);
        timerEl.classList.remove('low');
        progressWrap.classList.remove('active');
    } else {
        timerEl.textContent = '0.0s';
        progressWrap.classList.add('active');
        updateProgress();
    }
    timerEl.classList.remove('running');

    fullRenderText();
    positionTooltip();
}

function formatTime(sec) {
    if (sec >= 60) {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return s === 0 ? `${m}m` : `${m}m ${s}s`;
    }
    return `${sec}s`;
}

function fullRenderText() {
    spanCache = [];
    const textChars  = targetText.split('');
    const typedChars = typedText.split('');
    const running    = isTestRunning;
    const frag       = document.createDocumentFragment();

    for (let i = 0; i < textChars.length; i++) {
        const char = textChars[i];
        const span = document.createElement('span');
        const tChar = typedChars[i];
        let cls = '';
        if (tChar == null) {
            if (i === typedChars.length && running) cls = 'current';
        } else if (tChar === char) {
            cls = 'correct';
        } else {
            cls = 'incorrect';
        }
        if (cls) span.className = cls;
        span.textContent = (char === ' ' && cls === 'incorrect') ? '\u00A0' : char;
        spanCache.push(span);
        frag.appendChild(span);
    }
    wordDisplay.innerHTML = '';
    wordDisplay.appendChild(frag);
}

function updateSpans(indices) {
    const running = isTestRunning;
    for (const i of indices) {
        if (i < 0 || i >= spanCache.length) continue;
        const span = spanCache[i];
        const char = targetText[i];
        const tChar = typedText[i];
        let cls = '';
        if (tChar == null) {
            if (i === typedText.length && running) cls = 'current';
        } else if (tChar === char) {
            cls = 'correct';
        } else {
            cls = 'incorrect';
        }
        span.className = cls;
        if (char === ' ') {
            span.textContent = (cls === 'incorrect') ? '\u00A0' : ' ';
        }
    }
}

function appendSpans(fromIndex) {
    const frag = document.createDocumentFragment();
    for (let i = fromIndex; i < targetText.length; i++) {
        const char = targetText[i];
        const span = document.createElement('span');
        span.textContent = char;
        spanCache.push(span);
        frag.appendChild(span);
    }
    wordDisplay.appendChild(frag);
}

function updateScroll() {
    const cur = wordDisplay.querySelector('.current');
    if (!cur) return;
    const cs = getComputedStyle(wordDisplay);
    const lineHeightPx = parseFloat(cs.lineHeight);
    if (!lineHeightPx) return;
    const curTop  = cur.offsetTop;
    const curLine = Math.round(curTop / lineHeightPx);
    const translateY = -curLine * lineHeightPx;
    textScroll.style.transform = `translateY(${translateY}px)`;
}

function updateProgress() {
    if (mode !== 'pages') return;
    const total = targetText.length || 1;
    const pct   = Math.min(100, Math.round((typedText.length / total) * 100));
    progressFill.style.width = pct + '%';
    percentLabel.textContent = pct + '%';
    const charsPerPage = total / pagesTarget;
    const currentPage  = Math.min(pagesTarget,
        Math.floor(typedText.length / charsPerPage) + 1);
    pageLabel.textContent = `Page ${currentPage}/${pagesTarget}`;
}

function positionTooltip() {
    const cur = wordDisplay.querySelector('.current');
    if (!cur || isTestRunning || !targetText || isLoading) {
        tooltip.classList.remove('visible');
        return;
    }
    const vpRect  = textViewport.getBoundingClientRect();
    const curRect = cur.getBoundingClientRect();
    let top = curRect.top - vpRect.top - tooltip.offsetHeight - 10;
    if (top < 0) top = 0;
    tooltip.style.left = (curRect.left - vpRect.left) + 'px';
    tooltip.style.top  = top + 'px';
    tooltip.classList.add('visible');
}

async function ensureEndlessText() {
    if (mode !== 'time') return;
    if (isFetchingMore) return;
    if (targetText.length - typedText.length > ENDLESS_THRESHOLD) return;

    isFetchingMore = true;
    try {
        const { text } = await fetchText(8000);
        const beforeLen = targetText.length;
        targetText = targetText + ' ' + text;
        appendSpans(beforeLen);
        console.log(`➕ Endless: +${targetText.length - beforeLen} chars (total=${targetText.length})`);
    } catch (e) {
        console.warn('Endless fetch failed:', e);
    } finally {
        isFetchingMore = false;
    }
}

// =========================================================
//  TEST FLOW
// =========================================================
function startTest() {
    if (isTestRunning || isLoading || !targetText) return;
    isTestRunning = true;
    startTime     = Date.now();
    tooltip.classList.remove('visible');
    timerEl.classList.add('running');
    updateSpans([typedText.length]);

    timerInterval = setInterval(() => {
        elapsedSec++;
        if (mode === 'time') {
            timeRemaining = durationSec - elapsedSec;
            timerEl.textContent = formatTime(Math.max(0, timeRemaining));
            if (timeRemaining <= 10) timerEl.classList.add('low');
            if (timeRemaining <= 0) endTest();
        } else {
            timerEl.textContent = elapsedSec + '.0s';
        }
    }, 1000);
}

function endTest() {
    if (!isTestRunning) return;
    isTestRunning = false;
    clearInterval(timerInterval);
    timerEl.classList.remove('running', 'low');
    tooltip.classList.remove('visible');
    const cur = wordDisplay.querySelector('.current');
    if (cur) cur.classList.remove('current');

    const elapsedMs = Date.now() - startTime;
    const minutes   = elapsedMs / 60000;

    let correct = 0;
    for (let i = 0; i < typedText.length; i++) {
        if (typedText[i] === targetText[i]) correct++;
    }
    const wrong = typedText.length - correct;

    const wpm = minutes > 0 ? Math.round((correct / 5) / minutes) : 0;
    const cpm = minutes > 0 ? Math.round(correct / minutes) : 0;
    const accuracy = typedText.length > 0
        ? Math.round((correct / typedText.length) * 100) : 0;

    const wordsTyped = typedText.trim().split(/\s+/).filter(w => w.length > 0).length;
    const totalSec   = Math.max(1, Math.round(elapsedMs / 1000));

    showResults({
        wpm, cpm, accuracy, totalSec, correct, wrong, wordsTyped,
        modeLabel: mode === 'time'
            ? `${Math.round(durationSec / 60)} min · Time`
            : `${pagesTarget} page${pagesTarget > 1 ? 's' : ''} · Pages`
    });
}

// =========================================================
//  RESULTS
// =========================================================
function showResults(data) {
    resModeTag.textContent  = data.modeLabel;
    resWpm.textContent      = data.wpm;
    resCpm.textContent      = data.cpm;
    resAccuracy.textContent = `${data.accuracy}%`;
    resTime.textContent     = data.totalSec >= 60
        ? `${Math.floor(data.totalSec/60)}m ${data.totalSec%60}s`
        : `${data.totalSec}s`;
    resCorrect.textContent  = data.correct;
    resWrong.textContent    = data.wrong;
    resWords.textContent    = data.wordsTyped;

    resMistakes.innerHTML = '';
    const entries = Object.entries(mistakeMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    if (entries.length === 0) {
        const span = document.createElement('span');
        span.className = 'no-mistakes';
        span.textContent = typedText.length > 0 ? '🎉 No mistakes!' : 'No data';
        resMistakes.appendChild(span);
    } else {
        entries.forEach(([char, count]) => {
            const chip = document.createElement('span');
            chip.className = 'mistake-chip';
            const display = char === ' ' ? '␣' : char;
            chip.innerHTML = `<span class="char-box">${escapeHtml(display)}</span>
                              <span class="count">×${count}</span>`;
            resMistakes.appendChild(chip);
        });
    }

    resultsOverlay.classList.add('show');
}

function hideResults() { resultsOverlay.classList.remove('show'); }

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
}

// =========================================================
//  KEYBOARD
// =========================================================
document.addEventListener('keydown', (e) => {
    if (document.activeElement &&
        document.activeElement.classList.contains('custom-input')) return;
    if (resultsOverlay.classList.contains('show')) {
        if (e.key === 'Escape') hideResults();
        return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (['Shift','CapsLock','Escape','ArrowUp','ArrowDown',
         'ArrowLeft','ArrowRight','Insert','Home','End',
         'PageUp','PageDown','F1','F2','F3','F4','F5','F6',
         'F7','F8','F9','F10','F11','F12'].includes(e.key)) return;
    if (e.key === 'Tab') { e.preventDefault(); return; }

    if (!isTestRunning && !isLoading
        && (e.key.length === 1 || e.key === 'Backspace')) {
        startTest();
    }
    if (!isTestRunning) return;

    if (e.key === 'Backspace') {
        e.preventDefault();
        if (typedText.length > 0) {
            const prevLen = typedText.length;
            typedText = typedText.slice(0, -1);
            playSound('backspace');
            updateSpans([prevLen - 1, prevLen]);
            updateScroll();
            updateProgress();
        }
        return;
    }

    if (e.key.length === 1) {
        e.preventDefault();
        if (typedText.length >= targetText.length) return;

        const idx       = typedText.length;
        const expected  = targetText[idx];
        const isCorrect = (e.key === expected);

        typedText += e.key;

        if (isCorrect) {
            playSound('type');
        } else {
            playSound('error');
            mistakeMap[expected] = (mistakeMap[expected] || 0) + 1;
        }

        updateSpans([idx, idx + 1]);
        updateScroll();
        updateProgress();

        if (mode === 'time') ensureEndlessText();

        if (typedText.length === targetText.length) endTest();
    }
});

// =========================================================
//  MODE BUTTONS
// =========================================================
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (isLoading) return;
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        mode = btn.dataset.mode;

        if (mode === 'time') {
            timeValues.classList.remove('hidden');
            pageValues.classList.add('hidden');
        } else {
            timeValues.classList.add('hidden');
            pageValues.classList.remove('hidden');
        }
        loadTest();
    });
});

function wireValueButtons(containerId, setter) {
    const container = document.getElementById(containerId);
    container.querySelectorAll('.val-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (isLoading) return;
            container.querySelectorAll('.val-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            setter(parseInt(btn.dataset.value, 10));
            loadTest();
        });
    });
}
wireValueButtons('time-values',  v => { durationSec = v; });
wireValueButtons('page-values',  v => { pagesTarget = v; });

// =========================================================
//  CUSTOM INPUTS
// =========================================================
function clearActiveIn(container) {
    container.querySelectorAll('.val-btn').forEach(b => b.classList.remove('active'));
}

function applyTimeInput() {
    if (isLoading) return;
    const raw = timeInput.value.trim();
    const n   = parseInt(raw, 10);
    if (!raw || isNaN(n) || n < 1 || n > 30) {
        timeInput.classList.add('error');
        timeHint.classList.add('show');
        timeInput.focus();
        return;
    }
    timeInput.classList.remove('error');
    timeHint.classList.remove('show');
    durationSec = n * 60;
    clearActiveIn(timeValues);
    timeInput.value = `${n} min`;
    timeInput.blur();
    loadTest();
}

function applyPagesInput() {
    if (isLoading) return;
    const raw = pagesInput.value.trim();
    const n   = parseInt(raw, 10);
    if (!raw || isNaN(n) || n < 1 || n > 10) {
        pagesInput.classList.add('error');
        pagesHint.classList.add('show');
        pagesInput.focus();
        return;
    }
    pagesInput.classList.remove('error');
    pagesHint.classList.remove('show');
    pagesTarget = n;
    clearActiveIn(pageValues);
    pagesInput.value = `${n} page${n > 1 ? 's' : ''}`;
    pagesInput.blur();
    loadTest();
}

timeSetBtn.addEventListener('click', applyTimeInput);
pagesSetBtn.addEventListener('click', applyPagesInput);

timeInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); applyTimeInput(); }
});
pagesInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); applyPagesInput(); }
});
timeInput.addEventListener('input', () => {
    timeInput.classList.remove('error');
    timeHint.classList.remove('show');
});
pagesInput.addEventListener('input', () => {
    pagesInput.classList.remove('error');
    pagesHint.classList.remove('show');
});

// =========================================================
//  RESULTS BUTTONS
// =========================================================
resAgainBtn.addEventListener('click', () => { hideResults(); loadTest(); });
resCloseBtn.addEventListener('click', () => { hideResults(); });
resultsOverlay.addEventListener('click', (e) => {
    if (e.target === resultsOverlay) hideResults();
});

// =========================================================
//  RESTART / SOUND
// =========================================================
restartBtn.addEventListener('click', loadTest);
soundToggleBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    soundToggleBtn.textContent = soundEnabled ? '🔊 Sound' : '🔇 Muted';
    soundToggleBtn.classList.toggle('muted', !soundEnabled);
});
window.addEventListener('resize', () => {
    updateScroll();
    positionTooltip();
});

// =========================================================
//  GO
// =========================================================
loadTest();