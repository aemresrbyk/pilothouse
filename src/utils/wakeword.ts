// "Hey Pilothouse" detector: a port of openWakeWord's streaming pipeline (openwakeword/utils.py AudioFeatures +
// model.py predict) to onnxruntime-web, so it runs in the renderer on any OS (WASM, no native module).
//   16 kHz int16 audio, 1280-sample (80 ms) chunks
//   -> melspectrogram.onnx (x/10 + 2) -> embedding_model.onnx over the last 76 mel frames -> 96-dim feature
//   -> wake model over the last N features -> score 0..1
// The /wasm entry bundles ORT's JS glue; only the .wasm binary is needed, and main hands it over (no file:// fetch).
import * as ort from 'onnxruntime-web/wasm';

export const CHUNK = 1280;
const MEL_CONTEXT = 160 * 3; // openWakeWord recomputes the mel over the new samples plus 3 hops of history
const MEL_MAX = 10 * 97;
const FEAT_MAX = 120;
const WINDOW = 76;

type Bytes = ArrayBuffer | Uint8Array;

export class WakeWordDetector {
  private mel: Float32Array[] = Array.from({ length: WINDOW }, () => new Float32Array(32).fill(1));
  private feats: Float32Array[] = [];
  private tail = new Int16Array(0);
  private chunks = 0;

  private constructor(
    private melModel: ort.InferenceSession,
    private embModel: ort.InferenceSession,
    private wakeModel: ort.InferenceSession,
    private nInputs: number
  ) {}

  static async create(models: { mel: Bytes; embedding: Bytes; wake: Bytes; wasm?: Bytes }, nInputs = 16): Promise<WakeWordDetector> {
    ort.env.wasm.numThreads = 1; // threads need cross-origin isolation; one thread is plenty (~3 ms per 80 ms chunk)
    if (models.wasm) ort.env.wasm.wasmBinary = new Uint8Array(models.wasm);
    const opts: ort.InferenceSession.SessionOptions = { executionProviders: ['wasm'] };
    const [mel, emb, wake] = await Promise.all([
      ort.InferenceSession.create(new Uint8Array(models.mel), opts),
      ort.InferenceSession.create(new Uint8Array(models.embedding), opts),
      ort.InferenceSession.create(new Uint8Array(models.wake), opts)
    ]);
    const d = new WakeWordDetector(mel, emb, wake, nInputs);
    // Like openWakeWord, start the feature history from 4 s of quiet noise so the first scores are sane.
    const noise = new Int16Array(16000 * 4).map(() => Math.round(Math.random() * 2000 - 1000));
    d.feats = await d.embeddingsOf(noise);
    return d;
  }

  private async melOf(samples: Int16Array): Promise<Float32Array[]> {
    const x = new ort.Tensor('float32', Float32Array.from(samples), [1, samples.length]);
    const out = await this.melModel.run({ [this.melModel.inputNames[0]]: x });
    const t = out[this.melModel.outputNames[0]];
    const data = t.data as Float32Array;
    const frames: Float32Array[] = [];
    for (let i = 0; i + 32 <= data.length; i += 32) frames.push(data.slice(i, i + 32).map((v) => v / 10 + 2));
    return frames;
  }

  private async embed(windows: Float32Array[][]): Promise<Float32Array[]> {
    const flat = new Float32Array(windows.length * WINDOW * 32);
    windows.forEach((w, b) => w.forEach((f, i) => flat.set(f, (b * WINDOW + i) * 32)));
    const x = new ort.Tensor('float32', flat, [windows.length, WINDOW, 32, 1]);
    const out = await this.embModel.run({ [this.embModel.inputNames[0]]: x });
    const data = out[this.embModel.outputNames[0]].data as Float32Array;
    return Array.from({ length: windows.length }, (_, b) => data.slice(b * 96, b * 96 + 96));
  }

  private async embeddingsOf(samples: Int16Array): Promise<Float32Array[]> {
    const spec = await this.melOf(samples);
    const windows: Float32Array[][] = [];
    for (let i = 0; i + WINDOW <= spec.length; i += 8) windows.push(spec.slice(i, i + WINDOW));
    return this.embed(windows);
  }

  // Feed exactly CHUNK samples; returns the wake score for this chunk (0 during the first 5 chunks, as upstream).
  async process(chunk: Int16Array): Promise<number> {
    if (chunk.length !== CHUNK) throw new Error(`expected ${CHUNK} samples`);
    const input = new Int16Array(this.tail.length + CHUNK);
    input.set(this.tail);
    input.set(chunk, this.tail.length);
    this.tail = input.slice(-MEL_CONTEXT);

    this.mel.push(...(await this.melOf(input)));
    if (this.mel.length > MEL_MAX) this.mel = this.mel.slice(-MEL_MAX);
    this.feats.push(...(await this.embed([this.mel.slice(-WINDOW)])));
    if (this.feats.length > FEAT_MAX) this.feats = this.feats.slice(-FEAT_MAX);

    const flat = new Float32Array(this.nInputs * 96);
    this.feats.slice(-this.nInputs).forEach((f, i) => flat.set(f, i * 96));
    const x = new ort.Tensor('float32', flat, [1, this.nInputs, 96]);
    const out = await this.wakeModel.run({ [this.wakeModel.inputNames[0]]: x });
    const score = (out[this.wakeModel.outputNames[0]].data as Float32Array)[0];
    return ++this.chunks <= 5 ? 0 : score;
  }
}

// Fires once per utterance: score above threshold, then a refractory period so one phrase is one trigger.
export class Trigger {
  private quietUntil = 0;
  constructor(private threshold = 0.5, private refractoryMs = 2000) {}
  hit(score: number, now: number): boolean {
    if (now < this.quietUntil || score < this.threshold) return false;
    this.quietUntil = now + this.refractoryMs;
    return true;
  }
}

export interface WakeListener {
  stop: () => void;
}

// Keeps the mic open and calls onWake when the phrase is heard. isPaused() skips audio (e.g. while recording a prompt).
export async function startWakeListener(
  detector: WakeWordDetector,
  onWake: () => void,
  isPaused: () => boolean
): Promise<WakeListener> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });
  const ctx = new AudioContext({ sampleRate: 16000 });
  const source = ctx.createMediaStreamSource(stream);
  // shortcut: ScriptProcessorNode is deprecated but needs no worklet file; move to AudioWorklet if Chromium drops it.
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const trigger = new Trigger();
  let pending = new Int16Array(0);
  let busy = false;

  proc.onaudioprocess = (e) => {
    if (isPaused()) { pending = new Int16Array(0); return; }
    const f = e.inputBuffer.getChannelData(0);
    const next = new Int16Array(pending.length + f.length);
    next.set(pending);
    for (let i = 0; i < f.length; i++) next[pending.length + i] = Math.max(-1, Math.min(1, f[i])) * 0x7fff;
    pending = next;
    if (busy) return;
    busy = true;
    (async () => {
      while (pending.length >= CHUNK) {
        const chunk = pending.slice(0, CHUNK);
        pending = pending.slice(CHUNK);
        if (trigger.hit(await detector.process(chunk), Date.now())) onWake();
      }
      // Never fall more than ~1 s behind real time.
      if (pending.length > 16000) pending = pending.slice(-CHUNK);
    })().catch((err) => console.error('[wakeword]', err)).finally(() => { busy = false; });
  };
  source.connect(proc);
  proc.connect(ctx.destination);

  return {
    stop: () => {
      proc.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
    }
  };
}
