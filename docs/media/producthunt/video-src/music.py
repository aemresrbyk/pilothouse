# Original cyber/darksynth backing track for the PH video, synthesised from scratch (no samples, no licence needed).
# 120 BPM, A minor, Am-F-C-G. The drums drop in at 4 s (bar 3), when the title cuts to the app.
# Usage: python3 music.py out.wav seconds
import math, random, struct, sys, wave
SR = 32000; out, secs = sys.argv[1], float(sys.argv[2]); N = int(SR * secs)
BEAT = 0.5; BAR = 4 * BEAT; DROP = 4.0; random.seed(7)
mix = [0.0] * N
def hz(m): return 440 * 2 ** ((m - 69) / 12)
CH = [[45, 48, 52], [41, 45, 48], [48, 52, 55], [43, 47, 50]]  # Am F C G (MIDI)
def chord(t): return CH[int(t // BAR) % 4]
def add(start, dur, fn, gain):
    a = int(start * SR); b = min(N, a + int(dur * SR))
    for i in range(a, b): mix[i] += gain * fn((i - a) / SR)
def saw(f, t): x = f * t; return 2 * (x - math.floor(x + 0.5))
def lp_saw(f, dur, cut0, cut1, gain, start):  # saw through a one-pole low-pass whose cutoff falls
    a = int(start * SR); b = min(N, a + int(dur * SR)); y = 0.0
    for i in range(a, b):
        t = (i - a) / SR; c = cut1 + (cut0 - cut1) * math.exp(-t * 18)
        k = 1 - math.exp(-2 * math.pi * c / SR); y += k * (saw(f, t) + 0.6 * saw(f * 1.005, t) - y)
        env = min(1, t * 400) * math.exp(-t * 6); mix[i] += gain * y * env
t = 0.0
while t < secs:
    step = round(t / (BEAT / 4)) % 16; ch = chord(t)
    # bass: 16ths on the root, octave on the off-16ths
    if t >= 2 * BAR - 0.01 or step % 4 == 0:
        lp_saw(hz(ch[0] - 12 + (12 if step % 4 == 2 else 0)), 0.13, 1800 if t >= DROP else 700, 160, 0.33, t)
    # arp lead after the drop: chord tones two octaves up, every 16th
    if t >= DROP + 2 * BAR:
        f = hz(ch[[0, 1, 2, 1][step % 4]] + 24 + (12 if step >= 12 else 0))
        add(t, 0.12, lambda x, f=f: (1 if math.sin(2 * math.pi * f * x) > 0 else -1) * math.exp(-x * 22), 0.045)
    if t >= DROP:
        if step % 4 == 0: add(t, 0.35, lambda x: math.sin(2 * math.pi * (45 * x + 105 * (1 - math.exp(-x * 30)) / 30)) * math.exp(-x * 9), 0.75)  # kick
        if step % 8 == 4: add(t, 0.2, lambda x: (random.random() * 2 - 1) * math.exp(-x * 20) + 0.4 * math.sin(2 * math.pi * 190 * x) * math.exp(-x * 30), 0.28)  # snare
        if step % 4 == 2: add(t, 0.05, lambda x: (random.random() * 2 - 1) * math.exp(-x * 90), 0.12)  # open-ish hat
        elif step % 2 == 1: add(t, 0.03, lambda x: (random.random() * 2 - 1) * math.exp(-x * 160), 0.05)
    t += BEAT / 4
# pad: detuned saws on the chord, whole bars, soft attack
b = 0.0
while b < secs:
    for m in chord(b):
        for d in (1.0, 1.006):
            add(b, BAR, lambda x, f=hz(m + 12) * d: saw(f, x) * min(1, x * 3, (BAR - x) * 6), 0.035)
    b += BAR
# riser into the drop
add(DROP - 2, 2, lambda x: (random.random() * 2 - 1) * (x / 2) ** 2, 0.18)
# master: soft clip, fade the tail
w = wave.open(out, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
fade = 3 * SR
w.writeframes(b''.join(struct.pack('<h', int(32000 * math.tanh(1.3 * v) * min(1, (N - i) / fade) * min(1, i / (SR * 0.5)))) for i, v in enumerate(mix)))
assert w.getnframes() == N
w.close(); print('ok', secs)
