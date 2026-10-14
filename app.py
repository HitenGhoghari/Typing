# app.py
from flask import Flask, render_template, jsonify, request
import random
import threading
import time
import traceback
from queue import Empty

from paragraphs import FALLBACK_TEXTS
from gemini_worker import (
    paragraph_pool, stats, pool_refiller, executor,
    _call_gemini, GEMINI_MODEL, gemini_client,
)

app = Flask(__name__)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/get-text')
def get_text():
    mode = request.args.get('mode', 'time')

    if mode == 'pages':
        pages  = max(1, min(5, int(request.args.get('pages', 1))))
        needed = pages * 4
        chunks = []
        for _ in range(needed):
            try:
                chunks.append(paragraph_pool.get_nowait())
            except Empty:
                break

        if chunks:
            print(f"⚡ pages={pages} → {len(chunks)}/{needed} chunks "
                  f"(pool left={paragraph_pool.qsize()})")
            return jsonify({
                'text':   ' '.join(chunks),
                'source': 'gemini',
                'chunks': len(chunks),
                'needed': needed,
            })

        print(f"💤 pages={pages} → pool empty, live fallback")
        return jsonify({
            'text':   ' '.join(random.choices(FALLBACK_TEXTS, k=pages * 2)),
            'source': 'fallback',
        })

    try:
        text = paragraph_pool.get_nowait()
        print(f"⚡ time → gemini (pool left={paragraph_pool.qsize()})")
        return jsonify({'text': text, 'source': 'gemini'})
    except Empty:
        print("💤 time → pool empty, live fallback")
        return jsonify({'text': random.choice(FALLBACK_TEXTS), 'source': 'fallback'})


@app.route('/get-long-text')
def get_long_text():
    words = int(request.args.get('words', 500))
    words = max(200, min(6000, words))

    prompt = (
        f"Generate a single, continuous passage of plain English prose that is "
        f"approximately {words} words long. The passage should flow naturally as "
        f"one coherent narrative or essay about any interesting topic such as "
        f"nature, science, history, technology, or daily life. "
        f"Do not include headings, bullet points, markdown formatting, or any "
        f"meta-commentary. Return only the passage text."
    )

    if not gemini_client:
        needed = words // 60 + 1
        return jsonify({
            'text':   ' '.join(random.choices(FALLBACK_TEXTS, k=needed)),
            'source': 'fallback',
        })

    try:
        print(f"📖 long-text: requesting ~{words} words...")
        t0  = time.time()
        fut = executor.submit(_call_gemini, prompt)
        raw = fut.result(timeout=180)
        dt  = time.time() - t0

        text = ' '.join(raw.replace('\n', ' ').split())
        wc   = len(text.split())
        print(f"📖 long-text: {len(text)} chars / {wc} words in {dt:.1f}s")

        if len(text) > 200:
            return jsonify({'text': text, 'source': 'gemini', 'words': wc})
    except Exception as e:
        print(f"📖 long-text failed: {type(e).__name__}: {e}")
        traceback.print_exc()

    needed = words // 60 + 1
    return jsonify({
        'text':   ' '.join(random.choices(FALLBACK_TEXTS, k=needed)),
        'source': 'fallback',
    })


@app.route('/pool-status')
def pool_status():
    return jsonify({
        'pool_size':        paragraph_pool.qsize(),
        'pool_target':      12,
        'stats':            stats,
        'gemini_available': gemini_client is not None,
        'model':            GEMINI_MODEL,
        'threads':          [t.name for t in threading.enumerate()],
    })


if __name__ == '__main__':
    threading.Thread(target=pool_refiller, name='pool_refiller', daemon=True).start()
    print("🚀 Background generator started.")
    app.run(debug=True, use_reloader=False)