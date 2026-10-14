# gemini_worker.py
import random
import threading
import time
import traceback
from queue import Queue
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from dotenv import load_dotenv
from google import genai

from paragraphs import FALLBACK_TEXTS

load_dotenv()

# ---------- Gemini client ----------
GEMINI_MODEL = "gemini-flash-lite-latest"

try:
    gemini_client = genai.Client()
    print(f"✅ Gemini client ready. Model: {GEMINI_MODEL}")
except Exception as e:
    gemini_client = None
    print(f"⚠️ Gemini init failed: {e}")

# ---------- Prompt + pool config ----------
PROMPT = (
    "Generate a single paragraph of plain English text that is approximately "
    "50 to 60 words long. The paragraph should be a coherent, interesting "
    "passage about any general topic (nature, science, technology, daily life). "
    "Do not include any headings, bullet points, or markdown formatting. "
    "Return only the paragraph text."
)

POOL_TARGET     = 12
MIN_GAP_SECONDS = 5
BACKOFF_ON_429  = 30

paragraph_pool = Queue(maxsize=20)
stats          = {'gemini': 0, 'fallback': 0, 'rate_limited': 0}
last_success_t = 0.0

executor = ThreadPoolExecutor(max_workers=2)


def _call_gemini(prompt):
    resp = gemini_client.models.generate_content(
        model=GEMINI_MODEL, contents=prompt
    )
    return resp.text or ""


def generate_paragraph():
    """Returns (text, source). Handles 429 with backoff, never hangs."""
    global last_success_t

    if not gemini_client:
        stats['fallback'] += 1
        return random.choice(FALLBACK_TEXTS), 'fallback'

    elapsed = time.time() - last_success_t
    if elapsed < MIN_GAP_SECONDS:
        time.sleep(MIN_GAP_SECONDS - elapsed)

    try:
        print(f"   → calling {GEMINI_MODEL} (25s timeout)...")
        t0  = time.time()
        fut = executor.submit(_call_gemini, PROMPT)
        raw = fut.result(timeout=25)
        dt  = time.time() - t0
        last_success_t = time.time()

        text = ' '.join(raw.replace('\n', ' ').split())
        if len(text) > 50:
            print(f"   → ✅ {len(text)} chars in {dt:.1f}s")
            stats['gemini'] += 1
            return text, 'gemini'
        print(f"   → ⚠️ short text ({len(text)} chars)")

    except FuturesTimeout:
        print("   → ❌ TIMEOUT after 25s")
    except Exception as e:
        msg = str(e)
        if '429' in msg or 'RESOURCE_EXHAUSTED' in msg:
            stats['rate_limited'] += 1
            print(f"   → 🛑 Rate limited (429). Backing off {BACKOFF_ON_429}s...")
            time.sleep(BACKOFF_ON_429)
        else:
            print(f"   → ❌ {type(e).__name__}: {msg[:160]}")

    stats['fallback'] += 1
    return random.choice(FALLBACK_TEXTS), 'fallback'


def pool_refiller():
    print("🚀 Pool refiller thread started.")
    while True:
        try:
            if paragraph_pool.qsize() < POOL_TARGET:
                text, source = generate_paragraph()
                if source == 'gemini':
                    paragraph_pool.put(text)
                    print(f"📝 Pool: {paragraph_pool.qsize()}/{POOL_TARGET}  {stats}")
                else:
                    print(f"   ⏸  Fallback (not pooled). Retrying in 10s  {stats}")
                    time.sleep(10)
            else:
                time.sleep(1)
        except Exception as e:
            print(f"❌ Refiller error: {e}")
            traceback.print_exc()
            time.sleep(5)