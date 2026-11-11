# Bangla Transcriber (Mac app)

Drop in **Bangla or English** audio and get **accurately timed subtitles (.srt)**, plus an
**ElevenLabs-style JSON with word-level timestamps**. No transcript needed, no credits, no internet:
everything runs on your Mac.

বাংলা অডিও দিন → অ্যাপ নিজেই ট্রান্সক্রাইব করবে → টাইমিংসহ বাংলা সাবটাইটেল (.srt) আর শব্দভিত্তিক JSON পাবেন।

## Install (easiest)

On your Mac (Apple Silicon, macOS 14 or newer), open **Terminal** and paste:

```bash
curl -fsSL https://raw.githubusercontent.com/aminalmaksud/maksud/bangla-transcriber/install.sh | bash
```

This downloads the app (273 MB, stored in `release/` as three parts because GitHub limits files to 100 MB), checks that
the download is intact, puts **Bangla Transcriber** in Applications and opens it. Installed this way, macOS shows no
"can't verify the developer" warning. The AI models download the first time you transcribe in each language.

To download the DMG by hand instead, download the three `release/Bangla-Transcriber-1.2.dmg.part*` files, then join them in Terminal:
`cat Bangla-Transcriber-1.2.dmg.part0 Bangla-Transcriber-1.2.dmg.part1 Bangla-Transcriber-1.2.dmg.part2 > Bangla-Transcriber-1.2.dmg`

## Build the app (once)

On your Mac, in Terminal:

```bash
cd ~/Downloads/BanglaTranscriber
bash build_mac_app.sh --install
```

The build takes about 10–20 minutes and downloads around 8 GB once: Python, PyTorch, and the Bangla, English and alignment models.
When it finishes, **Bangla Transcriber** is in your Applications folder. It also leaves a
shareable `dist/Bangla Transcriber.dmg`. Everything is inside the app, so it works offline from then on.

Requirements: macOS 12 or newer. An Apple Silicon Mac (M1–M4) is recommended because it uses the GPU.
Intel Macs work but are slower. You need about 12 GB of free disk space while building.

| Option | What it does |
|---|---|
| `--install` | copy the finished app to /Applications |
| `--no-models` | smaller app; the models download the first time you transcribe |
| `--no-dmg` | skip creating the .dmg |

## Using it

1. Pick the language (**বাংলা** or **English**) at the bottom left, then drag audio files onto the window or click **Add audio…**.
   MP3, WAV, M4A, FLAC, OGG, MP4 and MOV all work, and you can add a whole folder. Each file remembers the language it was
   added with (shown as a BN/EN tag). To change one file, use the **Language** switch at the top of that file.
2. Click **Transcribe**. Files are processed one after another.
3. You get `my-audio.srt` (subtitles) and `my-audio.json` (word timestamps), saved next to the audio or in a folder you choose.
   A plain `.txt` transcript is optional.
4. **Check and fix the subtitles** on the *Subtitles* tab:
   - Press play. The current subtitle and word light up as they are spoken. Click any word to play from there.
   - **Double-click a word to fix it.** The word's timing is kept, and the `.srt` and `.json` update instantly.
     Use **＋ next word** to fix words that were wrongly split (বলে ছিলাম → বলেছিলাম), and **Delete** to remove a stutter.
   - Words the model was unsure about have an orange dotted underline. Check those first.
5. **Corrections list** (sidebar, one list per language): every fix you make with "Remember this fix" ticked is added here as
   `wrong => right`, and it is applied automatically to every new file. This is the best way to get lore names right every time
   (for example `বেনে জেসারিট => বেনে জেসেরিট`). You can also edit the list by hand, then use **Save & fix all open files**.

**Already have a transcript JSON** (from ElevenLabs or from this app)? Drop the `.json` in. The app makes the `.srt` straight
away and applies your corrections. Your original JSON is never changed; the corrected version is saved as `name_corrected.json`.

### English

English uses OpenAI's **Whisper Large v3 Turbo** by default. It is one of the most accurate English speech models and
writes proper punctuation and capitals. You can also choose **Distil-Whisper Large v3.5** (faster) or **Whisper Large v3**
(slowest, very slightly more accurate). The word timing uses the same alignment model as Bangla, and numbers and amounts
(2024, $1,200, 3.5%) are matched to how they are spoken. English subtitles follow the usual broadcast layout: up to two
lines of about 42 characters each. The English models download the first time you transcribe in English, about 1.6 GB.

### How the subtitles are timed

These are the Bangla rules. English uses the same rules with longer lines (84 characters per subtitle, 42 per line).
Each subtitle uses the exact start time of its first word and the end time of its last word. A new subtitle starts when:
- you pause for 0.6 s or longer,
- the line would go over about 62 characters, or
- the subtitle would last longer than 6 s.

Once a subtitle is longer than 30 characters, it also breaks at a short pause (0.3 s) or at the end of a sentence (। ? !).
Subtitles longer than 40 characters are split into two balanced lines. A subtitle shorter than half a second stays on screen
0.2 s longer, but never overlaps the next one.

**Mode:** *Most accurate* (beam search, the default) or *Fast* (about 2–3× quicker, slightly more mistakes).

## Output format

The JSON uses the same layout as the ElevenLabs Speech-to-Text API, so anything that reads ElevenLabs JSON can read these files:

```json
{
  "language_code": "ben",
  "language_probability": 1.0,
  "text": "আমি আজকে একটা মজার কাজ করেছি।",
  "words": [
    { "text": "আমি",  "start": 0.24, "end": 0.52, "type": "word",    "speaker_id": "speaker_0", "logprob": -0.21 },
    { "text": " ",    "start": 0.52, "end": 0.58, "type": "spacing", "speaker_id": "speaker_0", "logprob": 0.0 },
    { "text": "আজকে", "start": 0.58, "end": 0.98, "type": "word",    "speaker_id": "speaker_0", "logprob": -0.35 }
  ]
}
```

Times are in seconds. A `spacing` entry covers the silence between two words. When you pause, its start and end are far apart.

## How it works

1. **Splitting:** the audio is cut into pieces of 15 seconds or less, always at a pause, so no word is cut in half.
   Short pieces matter, because the Bangla model was trained on short clips and can skip words in long ones.
2. **Transcription:** each piece goes through
   [`bengaliAI/tugstugi_bengaliai-asr_whisper-medium`](https://huggingface.co/bengaliAI/tugstugi_bengaliai-asr_whisper-medium).
   This is the Whisper-medium model that won 1st place in the Bengali.AI Speech Recognition competition on Kaggle.
   Recent long-form Bangla benchmarks (2026) use it as the reference model. It is much more accurate than plain OpenAI Whisper, which is weak at Bangla.
3. **Word timing:** Meta's MMS forced-alignment model
   ([`MahmoudAshraf/mms-300m-1130-forced-aligner`](https://huggingface.co/MahmoudAshraf/mms-300m-1130-forced-aligner))
   lines every transcribed word up against the audio, frame by frame (20 ms). This gives much tighter
   word boundaries and pause detection than Whisper's built-in timestamps.
   Numbers such as `২০২৪` are expanded to how they are spoken (দুই হাজার চব্বিশ) so they align properly.

In the sidebar you can also switch to the **regional-dialect** version of the Bangla model, or to OpenAI Whisper Large v3 Turbo.
These download the first time you use them.

## Command line (optional)

```bash
"/Applications/Bangla Transcriber.app/Contents/Resources/python/bin/python3" \
  "/Applications/Bangla Transcriber.app/Contents/Resources/app/cli.py" audio1.mp3 audio2.wav --corrections fixes.txt
```

## Troubleshooting

- **Log file:** `~/Library/Logs/Bangla Transcriber.log`
- **Speed:** this depends on your Mac. On Apple Silicon, *Most accurate* mode is roughly real-time or faster, and *Fast* mode is several times quicker. The progress bar shows the time left. The first file takes longer because the models are loading.
- **Sharing the DMG with another Mac:** the app is signed only for this Mac. On another Mac, right-click the app, choose **Open**, then click **Open** again (needed only the first time).
- **Run without building:** for development you can run `pip install -r requirements.txt`, then `python app/main.py` (add `--browser` to use your web browser instead of a window).
