// Microphone capture for voice prompts: records 16 kHz mono until the speaker pauses, returns 16-bit PCM.

// Decides when an utterance is over from per-chunk loudness. Separate from the audio code so it can be tested.
export class Endpointer {
  private heard = false;
  private quietMs = 0;
  private elapsedMs = 0;

  constructor(
    private threshold = 0.015, // RMS that counts as speech (after the browser's auto gain)
    private silenceMs = 1500, // pause that ends the utterance
    private startTimeoutMs = 8000, // give up if nobody speaks
    private maxMs = 30000
  ) {}

  // 'done' = speech then a pause, 'empty' = nothing said, null = keep listening.
  feed(rms: number, chunkMs: number): 'done' | 'empty' | null {
    this.elapsedMs += chunkMs;
    if (rms >= this.threshold) {
      this.heard = true;
      this.quietMs = 0;
    } else {
      this.quietMs += chunkMs;
    }
    if (this.heard && this.quietMs >= this.silenceMs) return 'done';
    if (!this.heard && this.elapsedMs >= this.startTimeoutMs) return 'empty';
    if (this.elapsedMs >= this.maxMs) return this.heard ? 'done' : 'empty';
    return null;
  }
}

export function floatToPcm16(chunks: Float32Array[]): ArrayBuffer {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Int16Array(total);
  let i = 0;
  for (const c of chunks) for (const v of c) out[i++] = Math.max(-1, Math.min(1, v)) * 0x7fff;
  return out.buffer;
}

export interface Recording {
  stop: () => void; // ends early and keeps what was said
  cancel: () => void;
  result: Promise<ArrayBuffer | null>; // null = nothing said / cancelled
}

export interface RecordingOptions {
  startTimeoutMs?: number; // give up if nobody speaks for this long (default 8 s)
  onSpeechStart?: () => void; // fired once speech has lasted ~0.75 s (barge-in: stop talking, the user is speaking)
}

export async function startRecording(onLevel: (level: number) => void, opts: RecordingOptions = {}): Promise<Recording> {
  const RATE = 16000;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });
  const ctx = new AudioContext({ sampleRate: RATE });
  const source = ctx.createMediaStreamSource(stream);
  // shortcut: ScriptProcessorNode is deprecated but needs no worklet file; move to AudioWorklet if Chromium drops it.
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  const endpointer = new Endpointer(undefined, undefined, opts.startTimeoutMs);
  let loud = 0;
  let finish!: (keep: boolean) => void;

  const result = new Promise<ArrayBuffer | null>((resolve) => {
    let done = false;
    finish = (keep) => {
      if (done) return;
      done = true;
      proc.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
      resolve(keep && chunks.length ? floatToPcm16(chunks) : null);
    };
  });

  proc.onaudioprocess = (e) => {
    const data = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(data));
    let sum = 0;
    for (const v of data) sum += v * v;
    const rms = Math.sqrt(sum / data.length);
    onLevel(Math.min(1, rms * 12));
    // Three loud chunks in a row (~0.75 s) count as talking over it; shorter bursts are clicks, coughs or echo.
    loud = rms >= 0.015 ? loud + 1 : 0;
    if (loud === 3) opts.onSpeechStart?.();
    const verdict = endpointer.feed(rms, (data.length / RATE) * 1000);
    if (verdict) finish(verdict === 'done');
  };
  source.connect(proc);
  proc.connect(ctx.destination);

  return { stop: () => finish(true), cancel: () => finish(false), result };
}
