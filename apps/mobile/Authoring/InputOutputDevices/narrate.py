"""Voices the activity's narration from content.json.

    python narrate.py

Writes into Assets/ElimuARContent/<this folder's name>/Audio:
  ICT_Computer_Observe.wav          the Observe narration, every caption in turn
  ICT_Computer_Explore_<Part>.wav   what each part says while it is held
  timings.json                      each caption's start and length, which the
                                    scene builder keys the Observe animation to

Uses Microsoft's neural voices through edge-tts (pip install edge-tts) and
ffmpeg. Needs the internet; the results are kept, so it runs once per change.
"""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
import tempfile

import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "Assets", "ElimuARContent", os.path.basename(HERE), "Audio")
GAP = 0.45  # seconds of quiet after each caption
RATE = 44100


def strip_tags(text: str) -> str:
    import re
    return re.sub(r"<[^>]+>", "", text)


async def speak(text: str, voice: str, rate: str, mp3: str) -> None:
    await edge_tts.Communicate(strip_tags(text), voice, rate=rate).save(mp3)


def to_wav(src: str, dst: str, pad: float = 0.0) -> None:
    args = ["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", str(RATE)]
    if pad > 0:
        args += ["-af", f"apad=pad_dur={pad}"]
    subprocess.run(args + [dst], check=True)


def length(path: str) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         check=True, capture_output=True, text=True).stdout
    return float(out.strip())


async def main() -> None:
    with open(os.path.join(HERE, "content.json"), encoding="utf-8") as f:
        content = json.load(f)
    voice, rate = content["voice"], content.get("rate", "+0%")
    prefix = content.get("audioPrefix", "ICT_Computer")
    os.makedirs(OUT, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        # Observe: one clip per caption, padded, then joined.
        pieces, captions, cues, at = [], [], {}, 0.0
        for i, cap in enumerate(content["observe"]["captions"]):
            mp3 = os.path.join(tmp, f"obs{i:02}.mp3")
            wav = os.path.join(tmp, f"obs{i:02}.wav")
            await speak(cap["text"], voice, rate, mp3)
            to_wav(mp3, wav, GAP)
            seconds = length(wav)
            pieces.append(wav)
            captions.append({"text": cap["text"], "duration": round(seconds, 3)})
            cues[cap["cue"]] = round(at, 3)
            at += seconds
        listing = os.path.join(tmp, "list.txt")
        with open(listing, "w", encoding="utf-8") as f:
            f.writelines(f"file '{p.replace(os.sep, '/')}'\n" for p in pieces)
        observe = os.path.join(OUT, prefix + "_Observe.wav")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listing,
                        "-c", "copy", observe], check=True)

        # Explore: what each part says while it is held.
        holds = {}
        for part in content["parts"]:
            mp3 = os.path.join(tmp, f"hold-{part['key']}.mp3")
            name = f"{prefix}_Explore_{part['key']}"
            await speak(f"{part['name']}: {part['text']}", voice, rate, mp3)
            to_wav(mp3, os.path.join(OUT, name + ".wav"))
            holds[part["key"]] = name

    with open(os.path.join(OUT, "timings.json"), "w", encoding="utf-8") as f:
        json.dump({"observeClip": prefix + "_Observe", "observeLength": round(at, 3),
                   "captions": captions, "cues": cues, "holdClips": holds}, f, indent=1)
    print(json.dumps({"observeSeconds": round(at, 1), "captions": len(captions), "holdClips": len(holds)}))


if __name__ == "__main__":
    asyncio.run(main())
