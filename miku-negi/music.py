"""A chiptune polka, synthesised from scratch with numpy.

Original melody written for this clip -- deliberately not a transcription of
any existing recording. 130 BPM in 2/4, 26 bars, which comes out at exactly
24.000 s so the audio and the animation loop seam together.
"""

import numpy as np

SR = 44100
BPM = 130.0
SPB = 60.0 / BPM            # 0.4615 s per beat
BEATS_PER_BAR = 2
EIGHTH = SPB / 2.0
BARS = 26
DURATION = BARS * BEATS_PER_BAR * SPB       # 24.0 s

NOTES = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6,
         "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}


def freq(name):
    """'A4' -> 440.0"""
    step = NOTES[name[:-1]]
    octave = int(name[-1])
    return 440.0 * 2 ** ((step - 9) / 12.0 + (octave - 4))


# --------------------------------------------------------------- material ---
# (note, length in eighth-notes); 4 eighths = 1 bar of 2/4
A_PART = [
    ("A4", 1), ("C5", 1), ("E5", 1), ("C5", 1),
    ("B4", 1), ("D5", 1), ("B4", 2),
    ("A4", 1), ("C5", 1), ("E5", 1), ("A5", 1),
    ("G5", 2), ("E5", 2),
    ("F5", 1), ("E5", 1), ("D5", 1), ("C5", 1),
    ("B4", 1), ("C5", 1), ("D5", 2),
    ("C5", 1), ("B4", 1), ("A4", 1), ("G4", 1),
    ("A4", 4),
]
B_PART = [
    ("E5", 1), ("E5", 1), ("F5", 1), ("E5", 1),
    ("D5", 1), ("C5", 1), ("B4", 2),
    ("C5", 1), ("C5", 1), ("D5", 1), ("C5", 1),
    ("B4", 1), ("A4", 1), ("G4", 2),
    ("A4", 1), ("B4", 1), ("C5", 1), ("D5", 1),
    ("E5", 1), ("F5", 1), ("G5", 2),
    ("E5", 1), ("C5", 1), ("B4", 1), ("A4", 1),
    ("A4", 4),
]

CHORDS = {
    "Am": ("A2", ["A3", "C4", "E4"]),
    "E":  ("E2", ["E3", "G#3", "B3"]),
    "Dm": ("D2", ["D3", "F3", "A3"]),
    "F":  ("F2", ["F3", "A3", "C4"]),
    "C":  ("C3", ["C3", "E3", "G3"]),
}
A_CHORDS = ["Am", "Am", "E", "E", "Dm", "Am", "E", "Am"]
B_CHORDS = ["Am", "Am", "E", "Am", "F", "C", "E", "Am"]

INTRO_BARS = 2
SECTIONS = [("intro", None, None), ("A", A_PART, A_CHORDS),
            ("B", B_PART, B_CHORDS), ("A2", A_PART, A_CHORDS)]


# ------------------------------------------------------------------ synth ---
def _env(n, attack=0.004, release=0.06, sustain=0.72):
    """Percussive-ish AD(S)R shaped for short chiptune notes."""
    e = np.ones(n)
    a = max(1, int(attack * SR))
    r = max(1, int(release * SR))
    d = max(1, int(0.05 * SR))
    if a + d + r >= n:
        a, d, r = max(1, n // 8), max(1, n // 8), max(1, n // 3)
    e[:a] = np.linspace(0, 1, a)
    e[a:a + d] = np.linspace(1, sustain, d)
    e[a + d:n - r] = sustain
    e[n - r:] = np.linspace(sustain, 0, n - (n - r))
    return e


def pulse(f, n, duty=0.5, vibrato=0.0):
    t = np.arange(n) / SR
    phase = f * t
    if vibrato:
        phase = phase + vibrato * np.sin(2 * np.pi * 5.5 * t) / (2 * np.pi)
    return np.where((phase % 1.0) < duty, 1.0, -1.0)


def triangle(f, n):
    t = np.arange(n) / SR
    return 2.0 * np.abs(2.0 * ((f * t) % 1.0) - 1.0) - 1.0


def lowpass(x, cutoff=5200.0):
    """One-pole smoother -- takes the worst of the edge off the square waves."""
    a = np.exp(-2 * np.pi * cutoff / SR)
    out = np.empty_like(x)
    acc = 0.0
    for i in range(x.size):          # short buffers only; clarity over speed
        acc = (1 - a) * x[i] + a * acc
        out[i] = acc
    return out


def add(track, start_s, sig, gain=1.0):
    i = int(round(start_s * SR))
    j = min(track.size, i + sig.size)
    if i < track.size and j > i:
        track[i:j] += sig[:j - i] * gain


def note(f, dur_s, duty=0.5, gain=0.25, vibrato=0.0, release=0.06):
    n = max(2, int(dur_s * SR))
    sig = pulse(f, n, duty, vibrato) * _env(n, release=release)
    return sig * gain


def kick(dur_s=0.16):
    n = int(dur_s * SR)
    t = np.arange(n) / SR
    f = 118.0 * np.exp(-t * 26.0) + 44.0
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 13.0)
    click = np.random.RandomState(7).uniform(-1, 1, n) * np.exp(-t * 320.0) * 0.35
    return (body + click) * 0.9


def snare(dur_s=0.13, seed=11):
    n = int(dur_s * SR)
    t = np.arange(n) / SR
    noise = np.random.RandomState(seed).uniform(-1, 1, n) * np.exp(-t * 34.0)
    tone = np.sin(2 * np.pi * 205.0 * t) * np.exp(-t * 45.0) * 0.45
    return (noise * 0.75 + tone) * 0.55


def hat(dur_s=0.045, seed=23, gain=0.16):
    n = int(dur_s * SR)
    t = np.arange(n) / SR
    noise = np.random.RandomState(seed).uniform(-1, 1, n) * np.exp(-t * 150.0)
    return (noise - lowpass(noise, 3000.0)) * gain      # crude high-pass


# ------------------------------------------------------------------ build ---
def build():
    n = int(round(DURATION * SR))
    lead = np.zeros(n)
    harm = np.zeros(n)
    bass = np.zeros(n)
    perc = np.zeros(n)

    # ---- melody, laid out section by section
    bar = INTRO_BARS
    for name, part, _ in SECTIONS:
        if part is None:
            continue
        t0 = bar * BEATS_PER_BAR * SPB
        pos = 0.0
        for pitch, eighths in part:
            dur = eighths * EIGHTH
            start = t0 + pos
            f = freq(pitch)
            vib = 0.03 if eighths >= 2 else 0.0
            add(lead, start, note(f, dur * 0.94, duty=0.5, gain=0.26, vibrato=vib))
            if name == "A2":         # final pass gets a sweeter third above
                add(harm, start, note(f * 1.5, dur * 0.94, duty=0.25, gain=0.10))
            pos += dur
        bar += sum(e for _, e in part) // (BEATS_PER_BAR * 2)

    # ---- oom-pah bass + chord stabs + drums, every bar
    prog = [None] * INTRO_BARS
    prog[-1] = "E"                                  # pickup into the tune
    prog[0] = "Am"
    for _, part, chords in SECTIONS:
        if chords:
            prog += list(chords)
    prog = prog[:BARS]

    for b, chord in enumerate(prog):
        bar_t = b * BEATS_PER_BAR * SPB
        if chord:
            root, triad = CHORDS[chord]
            rn = int(SPB * 0.62 * SR)
            bass_sig = triangle(freq(root), rn) * _env(rn, release=0.05) * 0.30
            add(bass, bar_t, bass_sig)
            for pitch in triad:                     # off-beat stab
                add(bass, bar_t + SPB,
                    note(freq(pitch), SPB * 0.30, duty=0.35, gain=0.075, release=0.04))
        add(perc, bar_t, kick())
        add(perc, bar_t + SPB, snare())
        for e in range(4):
            add(perc, bar_t + e * EIGHTH, hat(gain=0.17 if e % 2 == 0 else 0.11))

    # final downbeat lands on the loop point, so give it a lift
    add(perc, DURATION - 4 * EIGHTH, snare(0.10, seed=5), 0.7)
    add(perc, DURATION - 3 * EIGHTH, snare(0.10, seed=6), 0.8)
    add(perc, DURATION - 2 * EIGHTH, snare(0.10, seed=7), 0.9)
    add(perc, DURATION - EIGHTH, snare(0.10, seed=8), 1.0)

    lead = lowpass(lead, 6200.0)
    bass = lowpass(bass, 2600.0)

    left = lead * 0.92 + harm * 1.0 + bass + perc * 0.95
    right = lead * 1.0 + harm * 0.85 + bass + perc * 0.9

    stereo = np.stack([left, right], axis=1)
    stereo = np.tanh(stereo * 1.25) * 0.82          # glue + soft clip
    peak = np.max(np.abs(stereo)) or 1.0
    return stereo / peak * 0.92


def write_wav(path):
    audio = build()
    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2")
    import wave
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    return path


if __name__ == "__main__":
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else "music.wav"
    write_wav(out)
    print(f"wrote {out}  ({DURATION:.3f} s, {BPM:g} BPM, {BARS} bars)")
