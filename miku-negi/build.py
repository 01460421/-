#!/usr/bin/env python3
"""Render the loop and mux it into an MP4 (plus an optional GIF).

Frames are drawn across every core and piped straight into ffmpeg as raw
RGB, so nothing but the finished files ever touches disk.

    python3 build.py                  # 1280x720 @30fps -> out/miku-negi.mp4
    python3 build.py --height 480 --gif
"""

import argparse
import os
import subprocess
import sys
import time
from multiprocessing import Pool

import music
import scene

FPS = 30
ASPECT = 16 / 9
_CFG = {}


def _init(cfg):
    _CFG.update(cfg)


def _frame(i):
    t = i / _CFG["fps"]
    beat = t / music.SPB
    img = scene.render(t=t, beat=beat, size=_CFG["height"], ss=_CFG["ss"], aspect=ASPECT)
    return i, img.tobytes()


def ffmpeg_exe():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def render(out_mp4, height, fps, ss, jobs):
    total = int(round(music.DURATION * fps))
    cfg = {"height": height, "ss": ss, "fps": fps}
    _init(cfg)

    probe = scene.render(t=0.0, beat=0.0, size=height, ss=ss, aspect=ASPECT)
    width, height = probe.size

    wav = os.path.join(os.path.dirname(out_mp4) or ".", "soundtrack.wav")
    music.write_wav(wav)

    cmd = [
        ffmpeg_exe(), "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{width}x{height}", "-r", str(fps), "-i", "-",
        "-i", wav,
        # h264 needs even dimensions; the scale is a no-op when they already are
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-c:v", "libx264", "-preset", "slow", "-crf", "18",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        "-c:a", "aac", "-b:a", "192k", "-shortest", out_mp4,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    t0 = time.time()
    with Pool(jobs, initializer=_init, initargs=(cfg,)) as pool:
        for i, raw in pool.imap(_frame, range(total), chunksize=2):
            proc.stdin.write(raw)
            if i % 30 == 0 or i == total - 1:
                done = i + 1
                rate = done / max(1e-6, time.time() - t0)
                eta = (total - done) / max(1e-6, rate)
                print(f"\r  frame {done}/{total}  {rate:.1f} fps  eta {eta:5.1f}s",
                      end="", flush=True)
    proc.stdin.close()
    if proc.wait() != 0:
        sys.exit("ffmpeg failed")
    print(f"\n  -> {out_mp4}  ({time.time() - t0:.0f}s)")
    return wav


def make_gif(src_mp4, out_gif, height=360, fps=15):
    """Two-pass palette GIF -- one shared palette keeps the flat colours clean."""
    ff = ffmpeg_exe()
    pal = out_gif + ".png"
    vf = f"fps={fps},scale=-1:{height}:flags=lanczos"
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", src_mp4,
                    "-vf", f"{vf},palettegen=max_colors=128:stats_mode=diff", pal],
                   check=True)
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", src_mp4, "-i", pal,
                    "-lavfi", f"{vf}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3",
                    "-loop", "0", out_gif], check=True)
    os.remove(pal)
    print(f"  -> {out_gif}  ({os.path.getsize(out_gif) / 1e6:.1f} MB)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--height", type=int, default=720)
    ap.add_argument("--fps", type=int, default=FPS)
    ap.add_argument("--ss", type=int, default=2, help="supersampling factor")
    ap.add_argument("--jobs", type=int, default=os.cpu_count())
    ap.add_argument("--outdir", default="out")
    ap.add_argument("--gif", action="store_true")
    ap.add_argument("--gif-height", type=int, default=360)
    args = ap.parse_args()

    os.makedirs(args.outdir, exist_ok=True)
    mp4 = os.path.join(args.outdir, "miku-negi.mp4")
    print(f"rendering {music.DURATION:.1f}s @ {args.fps}fps, {args.height}p, ss={args.ss}")
    render(mp4, args.height, args.fps, args.ss, args.jobs)
    if args.gif:
        make_gif(mp4, os.path.join(args.outdir, "miku-negi.gif"), args.gif_height)


if __name__ == "__main__":
    main()
