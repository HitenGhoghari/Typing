# Typing Test

A clean, fast, single-page typing test built with Flask and vanilla JavaScript. Inspired by Typing.com and Monkeytype.

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.x-000000?logo=flask&logoColor=white)
![Gemini](https://img.shields.io/badge/Google-Gemini-4285F4?logo=google&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

- **Two modes**
  - **Time mode** — countdown from 1, 2, 3, 5 minutes or any custom duration (1–30 min). Text is endless: new paragraphs are fetched automatically as you approach the end.
  - **Pages mode** — no countdown, timer counts up. Passages of 1–10 pages worth of text (~500 words per page). Progress bar and page indicator.
- **Real-time feedback** — correct characters turn green, mistakes turn red. Blinking cursor on the current character.
- **Auto-scrolling text** — the current line always scrolls to the top of the viewport, so you never lose your place.
- **Three distinct keystroke sounds** — one for correct keys, one for backspace, one for mistakes. Muteable.
- **Detailed results screen** — WPM, CPM, Accuracy, Time, correct/incorrect character counts, words typed, and a top-5 list of your most-mistaken characters.
- **Light & dark themes** — toggle in the top-right. Choice is remembered.
- **AI-generated passages** — uses Google Gemini (with a background pool) to generate fresh, non-repeating paragraphs. Falls back to a curated local list when the API is unavailable.
- **Paragraph caching** — used passages are cached locally so re-runs are instant.
- **No build step** — pure HTML, CSS, JS. No npm, no bundlers.

---

## Project Structure

```
typing-test/
├── app.py                  # Flask app + routes
├── gemini_worker.py        # Gemini client, paragraph pool, background refiller
├── paragraphs.py           # Fallback paragraphs (edit this!)
├── requirements.txt        # Python dependencies
├── .env                    # GEMINI_API_KEY (not committed)
├── .gitignore
├── README.md
├── templates/
│   └── index.html          # Page structure
└── static/
    ├── style.css           # All styling + themes
    ├── app.js              # All client-side logic
    ├── type.mp3            # Correct keystroke sound
    ├── backspace.mp3       # Backspace sound
    └── error.mp3           # Mistake sound
```

---

## Getting Started

### Prerequisites

- **Python 3.10 or newer**
- A **Google AI Studio API key** (free): https://aistudio.google.com/app/apikey

### 1. Clone or download

```bash
git clone https://github.com/your-username/typing-test.git
cd typing-test
```

### 2. Create a virtual environment

**Windows**

```bash
python -m venv venv
venv\Scripts\activate
```

**macOS / Linux**

```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Set your Gemini API key

Create a file named `.env` in the project root and add this line:

```
GEMINI_API_KEY=your_api_key_here
```

No quotes, no spaces around `=`. Your key should start with `AIzaSy` and be about 39 characters long.

> Get one for free at **[Google AI Studio](https://aistudio.google.com/app/apikey)**.

### 5. Add sound files

Drop three `.mp3` files into the `static/` folder:

| File | Played when |
|---|---|
| `static/type.mp3` | You press a correct key |
| `static/backspace.mp3` | You press Backspace |
| `static/error.mp3` | You press the wrong key |

Free sound sources: [freesound.org](https://freesound.org), [mixkit.co](https://mixkit.co).

If you don't have sounds yet, the app still works — the browser just logs a 404 in the console.

### 6. Run

```bash
python app.py
```

Open **http://127.0.0.1:5000** in your browser.

Within the first 30 seconds, the terminal should look like this:

```
✅ Gemini client ready. Model: gemini-flash-lite-latest
🚀 Pool refiller thread started.
🚀 Background generator started.
   → calling gemini-flash-lite-latest (25s timeout)...
   → ✅ 402 chars in 3.1s
📝 Pool: 1/12  {'gemini': 1, 'fallback': 0, 'rate_limited': 0}
   ...
📝 Pool: 12/12  {'gemini': 12, 'fallback': 0, 'rate_limited': 0}
```

Once the pool is full, every request is served **instantly** from memory.

---

## Configuration

### Pool and rate limits — `gemini_worker.py`

```python
POOL_TARGET     = 12    # how many ready paragraphs to keep in memory
MIN_GAP_SECONDS = 5     # minimum gap between successful Gemini calls
BACKOFF_ON_429  = 30    # wait this long after a rate-limit error
```

**Free-tier Gemini** allows roughly 15 requests per minute. The defaults above stay under that. If you still hit `429 RESOURCE_EXHAUSTED`:

- Increase `MIN_GAP_SECONDS` to `8` or `10`
- Increase `BACKOFF_ON_429` to `60`
- Lower `POOL_TARGET` to `6`

### Model — `gemini_worker.py`

```python
GEMINI_MODEL = "gemini-flash-lite-latest"
```

Other models that typically work on free tier:

- `gemini-flash-latest`
- `gemini-2.5-flash-lite`

If you get `404 NOT_FOUND`, the model name has been retired. List available models:

```python
from google import genai
client = genai.Client()
for m in client.models.list():
    print(m.name)
```

### Fallback paragraphs — `paragraphs.py`

Edit the `FALLBACK_TEXTS` list. Rules:

- Use triple-quoted strings (`"""..."""`)
- Each paragraph should be a few hundred words
- Plain text only — no HTML, no markdown

```python
FALLBACK_TEXTS = [
    """Your first paragraph goes here...""",
    """Your second paragraph...""",
]
```

These are served when Gemini is unavailable (no API key, rate limited, or timed out).

---

## How to Use

| Action | Result |
|---|---|
| **Start typing** | The test begins automatically on your first keystroke |
| **⏱ Time / 📄 Pages** | Switch between the two test modes |
| **1 min / 2 min / 5 min** | Choose a preset duration (time mode) |
| **Enter minutes → Set** | Custom duration (1–30 min) |
| **1 page / 2 pages / …** | Choose passage length (pages mode) |
| **Enter pages → Set** | Custom page count (1–10) |
| **Restart** | Load a fresh passage immediately |
| **🌙 Dark / ☀️ Light** | Toggle theme (saved to localStorage) |
| **🔊 Sound / 🔇 Muted** | Toggle sounds |
| **Esc** | Close the results panel |

### Keyboard shortcuts

- `Backspace` — delete the previous character
- `Enter` — submit a custom duration/page count in the input field
- `Esc` — close the results overlay

---

## How It Works

### Backend

1. On startup, a **background thread** (`pool_refiller`) asks Gemini for short paragraphs and keeps a queue of `POOL_TARGET` ready texts in memory.
2. `/get-text?mode=time` pops one paragraph from the pool. If the pool is empty, it falls back to a local paragraph from `paragraphs.py` and returns instantly — never blocking.
3. `/get-text?mode=pages&pages=N` pops `N × 4` paragraphs from the pool and joins them.
4. `/get-long-text?words=N` makes a single synchronous Gemini call for a longer passage.

### Frontend

1. **Time mode** — one paragraph is loaded. When fewer than 800 characters remain, another paragraph is fetched and appended to the DOM. New spans are added incrementally so performance stays smooth.
2. **Pages mode** — the whole passage is loaded at once and cached in `localStorage` keyed by page count.
3. **Scrolling** — the text lives in a fixed-height viewport containing a translated inner container. After each keystroke, `updateScroll()` measures the cursor's `offsetTop`, computes which line it's on, and slides the container up by exactly that many line-heights.
4. **Sound** — three `<audio>` elements are preloaded. Each plays on the appropriate keydown, reset with `currentTime = 0` so rapid keystrokes retrigger cleanly.

---

## Troubleshooting

### "No API key was provided"

The `.env` file isn't being read. Check:

1. The file is named exactly `.env` (not `.env.txt`)
2. It sits in the same folder as `app.py`
3. The line looks like `GEMINI_API_KEY=AIza...` with no quotes
4. You restarted `python app.py` after creating it

### `429 RESOURCE_EXHAUSTED`

Free-tier rate limit. Wait about 30 seconds. The pool keeps retrying automatically with backoff.

### `404 NOT_FOUND` for a model

The model name has been retired. List available models with the snippet above and update `GEMINI_MODEL` in `gemini_worker.py`.

### Paragraph appears but typing starts elsewhere

Click somewhere on the page first, or simply start typing — the test auto-starts on the first keystroke.

### Sounds don't play

1. Confirm the `.mp3` files exist in `static/`
2. Open DevTools → Console and look for `404` errors
3. Browsers block autoplay until the user has interacted — click anywhere first

---

## Debug Endpoint

Check pool state any time:

```
http://127.0.0.1:5000/pool-status
```

Returns:

```json
{
  "pool_size": 12,
  "pool_target": 12,
  "stats": {"gemini": 24, "fallback": 0, "rate_limited": 0},
  "gemini_available": true,
  "model": "gemini-flash-lite-latest",
  "threads": ["MainThread", "pool_refiller"]
}
```

---

## Requirements

`requirements.txt`:

```
flask>=3.0.0
google-genai>=1.0.0
python-dotenv>=1.0.0
```

Install with:

```bash
pip install -r requirements.txt
```

---

## Customization

### Change the accent colour

In `static/style.css`, find `--primary` under `:root` (dark theme) and `body.light-theme` (light theme):

```css
:root {
    --primary: #5c9cd6;   /* dark theme blue */
}
body.light-theme {
    --primary: #c08a4f;   /* light theme amber */
}
```

### Change the font

Edit the Google Fonts link in `templates/index.html`:

```html
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
```

Then update the `font-family` in `static/style.css`.

### Change the number of visible lines

In `static/style.css`:

```css
.text-viewport {
    height: 12em;   /* 5 lines × 2.4em line-height */
}
.text-content {
    line-height: 2.4;
}
```

Adjust both together to keep the ruled lines aligned.

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

## Acknowledgements

- Typing.com & Monkeytype — for UI/UX inspiration
- Google Gemini — for text generation
- DM Mono — the typeface used throughout
- Flask, and every open-source library this depends on