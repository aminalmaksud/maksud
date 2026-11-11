"""Command-line use:  python cli.py audio.mp3 [more files…] [--lang bn|en] [--txt] [--corrections FILE] [-o OUTDIR]
Writes <name>.srt (subtitles) and <name>.json (ElevenLabs-style word timestamps).
Also:  python cli.py --download-models   (fetch models ahead of time)"""

import argparse
import sys

import engine


def main():
    ap = argparse.ArgumentParser(description="Bangla or English audio -> subtitles + ElevenLabs-style word timestamp JSON")
    ap.add_argument("files", nargs="*")
    ap.add_argument("-o", "--out-dir")
    ap.add_argument("--lang", choices=sorted(engine.LANGUAGES), default="bn")
    ap.add_argument("--model", help="speech model (default: the recommended one for --lang)")
    ap.add_argument("--beams", type=int, default=5)
    ap.add_argument("--corrections", help="text file of 'wrong => right' fixes")
    ap.add_argument("--txt", action="store_true")
    ap.add_argument("--device", default="auto")
    ap.add_argument("--download-models", action="store_true")
    ap.add_argument("--bundle-models", metavar="DIR", help="store models inside DIR (used by the app build)")
    a = ap.parse_args()
    a.model = a.model or engine.DEFAULT_MODELS[a.lang]

    def status(msg, frac=None):
        print(f"  {msg}", file=sys.stderr, flush=True)

    if a.bundle_models:  # the recommended Bangla and English models plus the aligner
        bn = engine.DEFAULT_MODELS["bn"]
        for repo in (bn, engine.DEFAULT_MODELS["en"], engine.ALIGN_MODEL):
            print("Bundling", repo, "->", engine.bundle_model(repo, a.bundle_models), file=sys.stderr)
        try:  # the Whisper fine-tune must ship its own tokenizer; otherwise bundle OpenAI's
            from transformers import WhisperProcessor

            WhisperProcessor.from_pretrained(engine.Path(a.bundle_models) / bn.replace("/", "__"))
        except Exception:
            engine.bundle_model("openai/whisper-medium", a.bundle_models, weights=False)
        return
    if a.download_models:
        for repo in (a.model, engine.ALIGN_MODEL):
            print(engine.ensure_model(repo, status))
        return
    eng = engine.Engine(a.device)
    for f in a.files:
        print(f"> {f}", file=sys.stderr)
        words, _ = eng.run(f, a.model, a.beams, status, lambda: False, a.lang)
        if a.corrections:
            words, n = engine.apply_corrections(words, open(a.corrections, encoding="utf-8").read())
            status(f"{n} corrections applied")
        out = engine.write_outputs(words, f, a.out_dir, srt=True, json_out=True, txt=a.txt, lang=a.lang)
        print(out["srt"])


if __name__ == "__main__":
    main()
