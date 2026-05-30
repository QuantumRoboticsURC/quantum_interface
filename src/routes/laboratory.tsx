import { useState, useEffect, useRef, useCallback } from "react";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Legend, Filler);

// ─────────────────────────────────────────────────────────────────────────────
// Image processing pipeline (Canvas API — browser-side, no server round-trip)
//
// Mirrors the Python pipeline:
//   buildMask  → grayscale threshold + morphological dilation
//   inpaint    → neighbourhood average of non-masked pixels (approximates TELEA)
//   overlay    → tint masked pixels red for visual inspection
// ─────────────────────────────────────────────────────────────────────────────

function buildMask(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number,
  dilatePx: number
): Uint8Array {
  const n = width * height;
  const raw = new Uint8Array(n);

  // Grayscale → threshold: pixels darker than threshold are dirt
  for (let i = 0; i < n; i++) {
    const gray = 0.299 * pixels[i * 4] + 0.587 * pixels[i * 4 + 1] + 0.114 * pixels[i * 4 + 2];
    if (gray <= threshold) raw[i] = 255;
  }

  if (dilatePx <= 0) return raw;

  // Morphological dilation — expand dirt-mask edges by dilatePx pixels (ellipse kernel)
  const dilated = new Uint8Array(n);
  const r2 = dilatePx * dilatePx;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (raw[y * width + x] === 0) continue;
      for (let dy = -dilatePx; dy <= dilatePx; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -dilatePx; dx <= dilatePx; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const nx = x + dx;
          if (nx >= 0 && nx < width) dilated[ny * width + nx] = 255;
        }
      }
    }
  }
  return dilated;
}

function inpaintPixels(
  pixels: Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(pixels);
  const r2 = radius * radius;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 0) continue;

      let R = 0, G = 0, B = 0, count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          if (mask[ny * width + nx] > 0) continue; // skip other masked pixels
          const idx = (ny * width + nx) * 4;
          R += pixels[idx]; G += pixels[idx + 1]; B += pixels[idx + 2];
          count++;
        }
      }
      if (count > 0) {
        const idx = (y * width + x) * 4;
        output[idx] = R / count;
        output[idx + 1] = G / count;
        output[idx + 2] = B / count;
      }
    }
  }
  return output;
}

function overlayMask(pixels: Uint8ClampedArray, mask: Uint8Array): Uint8ClampedArray {
  const output = new Uint8ClampedArray(pixels);
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] > 0) {
      output[i * 4] = 200; output[i * 4 + 1] = 0; output[i * 4 + 2] = 0;
    }
  }
  return output;
}

function uint8ToBase64(arr: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < arr.byteLength; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

function decodeToCanvas(src: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext("2d")!.drawImage(img, 0, 0);
      resolve(c);
    };
    img.onerror = reject;
    img.src = src;
  });
}

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_POINTS = 60;
const CALIBRATION_KEY = "quantum_microscope_calibration";

const QUALITY_PRESETS = [
  { label: "Low", value: 15 },
  { label: "Med", value: 40 },
  { label: "High", value: 70 },
  { label: "Max", value: 95 },
];

const SAMPLES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// ── Types ─────────────────────────────────────────────────────────────────────
type CameraInfo  = { id: number; label: string };
type ViewMode    = "original" | "cleaned" | "mask";

interface MicroState {
  motor1_pos: number; motor2_pos: number; current_sample: number;
  sensors: { mq135_1: number[]; mq135_2: number[]; mics5524: number[] };
}

interface History {
  co2_1: number[]; co2_2: number[];
  alc_1: number[]; alc_2: number[];
  ami_1: number[]; ami_2: number[];
  tol_1: number[]; tol_2: number[];
  eth:   number[]; amm:   number[]; met: number[];
}

const DEFAULT_STATE: MicroState = {
  motor1_pos: 0, motor2_pos: 0, current_sample: 1,
  sensors: { mq135_1: [0,0,0,0,0], mq135_2: [0,0,0,0,0], mics5524: [0,0,0,0] },
};

const EMPTY_HISTORY = (): History => ({
  co2_1: [], co2_2: [], alc_1: [], alc_2: [],
  ami_1: [], ami_2: [], tol_1: [], tol_2: [],
  eth: [], amm: [], met: [],
});

// ── SensorChart ───────────────────────────────────────────────────────────────
interface Dataset { label: string; color: string; data: number[]; current: number; unit?: string }

function SensorChart({ title, datasets }: { title: string; datasets: Dataset[] }) {
  const n = Math.max(...datasets.map((d) => d.data.length), 0);
  const labels = Array.from({ length: n }, (_, i) => {
    const ago = n - 1 - i;
    return i % 15 === 0 || ago === 0 ? (ago === 0 ? "now" : `-${ago}s`) : "";
  });
  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-3 flex flex-col">
      <div className="flex items-start justify-between mb-1 flex-shrink-0">
        <span className="text-xs font-bold text-gray-300">{title}</span>
        <div className="flex flex-col items-end gap-0.5">
          {datasets.map((d) => (
            <span key={d.label} className="text-[10px] font-mono" style={{ color: d.color }}>
              {d.label}: <strong>{d.current.toFixed(1)}</strong>{d.unit ? ` ${d.unit}` : ""}
            </span>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-[80px]">
        <Line
          data={{
            labels,
            datasets: datasets.map((d) => ({
              label: d.label, data: d.data,
              borderColor: d.color, backgroundColor: `${d.color}18`,
              borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: false,
            })),
          }}
          options={{
            responsive: true, maintainAspectRatio: false, animation: { duration: 0 },
            plugins: { legend: { display: false }, tooltip: { enabled: true, mode: "index", intersect: false } },
            scales: {
              x: { ticks: { color: "#6b7280", font: { size: 7 }, maxRotation: 0 }, grid: { color: "rgba(107,114,128,0.1)" } },
              y: { ticks: { color: "#6b7280", font: { size: 7 } }, grid: { color: "rgba(107,114,128,0.1)" } },
            },
          }}
        />
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Laboratory() {
  // Connection + state
  const [connected, setConnected]    = useState(false);
  const [microState, setMicroState]  = useState<MicroState>(DEFAULT_STATE);
  const [history, setHistory]        = useState<History>(EMPTY_HISTORY);
  const [statusLog, setStatusLog]    = useState<string[]>([]);
  const [sensorsRunning, setSensors] = useState(false);

  // LED
  const [ledOn, setLedOn] = useState(true);
  const [ledR, setLedR]   = useState(255);
  const [ledG, setLedG]   = useState(255);
  const [ledB, setLedB]   = useState(255);

  // Motors
  const [m1Steps, setM1Steps] = useState(10);
  const [m2Steps, setM2Steps] = useState(50);

  // Camera
  const [availableCameras, setAvailableCameras] = useState<CameraInfo[]>([]);
  const [cameraIndex, setCameraIndex]           = useState(0);
  const [quality, setQuality]                   = useState(40);
  const [cameraFrame, setCameraFrame]           = useState<string | null>(null);
  const [cameraConnected, setCameraConnected]   = useState(false);
  const [fps, setFps]                           = useState(0);

  // ── Image processing pipeline state ──────────────────────────────────
  const [viewMode, setViewMode]         = useState<ViewMode>("original");
  const [threshold, setThreshold]       = useState(80);
  const [dilatePx, setDilatePx]         = useState(3);
  const [inpaintRadius, setInpaintR]    = useState(5);
  const [calibrated, setCalibrated]     = useState(false);
  const [calibratedAt, setCalibratedAt] = useState<string | null>(null);
  const [dirtPct, setDirtPct]           = useState(0);
  const [displayFrame, setDisplayFrame] = useState<string | null>(null);

  // Mask is stored in a ref (not state) so it doesn't trigger re-renders
  const maskRef = useRef<{ data: Uint8Array; w: number; h: number } | null>(null);

  // Websockets + misc refs
  const wsRef       = useRef<WebSocket | null>(null);
  const cameraWsRef = useRef<WebSocket | null>(null);
  const fpsCounter  = useRef(0);
  const fpsTick     = useRef<number | null>(null);
  const logRef      = useRef<HTMLDivElement>(null);

  const activeCamera = availableCameras.length > 0 ? availableCameras[cameraIndex] : null;

  // ── Microscope WebSocket ──────────────────────────────────────────────
  useEffect(() => {
    const url = `${window.location.protocol === "https:" ? "wss" : "ws"}://192.168.1.3:8001/ws/connection/microscope`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen  = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "microscope_state" && msg.data) {
          setMicroState((prev) => ({ ...prev, ...msg.data }));
          const s = msg.data.sensors;
          if (s) {
            const q1 = (s.mq135_1  as number[]) ?? [];
            const q2 = (s.mq135_2  as number[]) ?? [];
            const mc = (s.mics5524 as number[]) ?? [];
            const push = (arr: number[], val: number) => {
              const next = [...arr, val ?? 0];
              return next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next;
            };
            setHistory((p) => ({
              co2_1: push(p.co2_1, q1[0]), co2_2: push(p.co2_2, q2[0]),
              alc_1: push(p.alc_1, q1[1]), alc_2: push(p.alc_2, q2[1]),
              ami_1: push(p.ami_1, q1[2]), ami_2: push(p.ami_2, q2[2]),
              tol_1: push(p.tol_1, q1[4]), tol_2: push(p.tol_2, q2[4]),
              eth:   push(p.eth,   mc[0]),
              amm:   push(p.amm,   mc[1]),
              met:   push(p.met,   mc[2]),
            }));
          }
        }
        if (msg.type === "microscope_status" && msg.data) {
          setStatusLog((prev) => {
            const next = [...prev, msg.data as string];
            return next.length > 40 ? next.slice(-40) : next;
          });
        }
      } catch { /* ignore */ }
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [statusLog]);

  // ── Camera WebSocket ──────────────────────────────────────────────────
  useEffect(() => {
    const url = `${window.location.protocol === "https:" ? "wss" : "ws"}://192.168.1.3:8001/ws/connection/camera`;
    const ws = new WebSocket(url);
    cameraWsRef.current = ws;
    ws.onopen  = () => { setCameraConnected(true); ws.send(JSON.stringify({ type: "get_cameras" })); };
    ws.onclose = () => { setCameraConnected(false); setCameraFrame(null); };
    ws.onerror = () => setCameraConnected(false);
    ws.onmessage = (e) => {
      if (typeof e.data === "string") {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "frame" && msg.data) {
            setCameraFrame(`data:image/jpeg;base64,${msg.data}`);
            fpsCounter.current++;
          } else if (msg.type === "cameras" && Array.isArray(msg.data)) {
            setAvailableCameras(msg.data);
            setCameraIndex((p) => (p < msg.data.length ? p : 0));
          }
        } catch { /* ignore */ }
      } else if (e.data instanceof Blob) {
        setCameraFrame(URL.createObjectURL(e.data));
        fpsCounter.current++;
      }
    };
    fpsTick.current = window.setInterval(() => { setFps(fpsCounter.current); fpsCounter.current = 0; }, 1000);
    return () => { ws.close(); if (fpsTick.current) clearInterval(fpsTick.current); };
  }, []);

  useEffect(() => {
    const ws = cameraWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && activeCamera)
      ws.send(JSON.stringify({ type: "config", camera_id: activeCamera.id, quality }));
  }, [activeCamera?.id, quality]);

  // ── Image processing: apply pipeline on every new frame ───────────────
  useEffect(() => {
    if (!cameraFrame || viewMode === "original" || !maskRef.current) {
      setDisplayFrame(cameraFrame);
      return;
    }

    let cancelled = false;
    const mask = maskRef.current;

    decodeToCanvas(cameraFrame)
      .then((canvas) => {
        if (cancelled) return;
        if (canvas.width !== mask.w || canvas.height !== mask.h) {
          setDisplayFrame(cameraFrame);
          return;
        }
        const ctx = canvas.getContext("2d")!;
        const id  = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const result =
          viewMode === "cleaned"
            ? inpaintPixels(id.data, mask.data, canvas.width, canvas.height, inpaintRadius)
            : overlayMask(id.data, mask.data);

        ctx.putImageData(new ImageData(result as unknown as Uint8ClampedArray<ArrayBuffer>, canvas.width, canvas.height), 0, 0);
        setDisplayFrame(canvas.toDataURL("image/jpeg", 0.85));
      })
      .catch(() => setDisplayFrame(cameraFrame));

    return () => { cancelled = true; };
  }, [cameraFrame, viewMode, inpaintRadius]);

  // ── Load saved calibration on mount ──────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CALIBRATION_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.version !== 1 || !saved.mask) return;
      maskRef.current = { data: base64ToUint8(saved.mask), w: saved.w, h: saved.h };
      setThreshold(saved.threshold);
      setDilatePx(saved.dilatePx);
      setDirtPct(saved.dirtPct);
      setCalibrated(true);
      setCalibratedAt(saved.timestamp);
    } catch { /* ignore corrupt data */ }
  }, []);

  // ── Calibrate: build mask from current frame ──────────────────────────
  const calibrate = useCallback(async () => {
    if (!cameraFrame) return;
    try {
      const canvas = await decodeToCanvas(cameraFrame);
      const ctx = canvas.getContext("2d")!;
      const id  = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const mask = buildMask(id.data, canvas.width, canvas.height, threshold, dilatePx);
      const dirty = mask.reduce((s, v) => s + (v > 0 ? 1 : 0), 0);
      const pct = (dirty / (canvas.width * canvas.height)) * 100;
      const ts  = new Date().toISOString();
      maskRef.current = { data: mask, w: canvas.width, h: canvas.height };
      setCalibrated(true);
      setDirtPct(pct);
      setCalibratedAt(ts);
      try {
        localStorage.setItem(CALIBRATION_KEY, JSON.stringify({
          version: 1, timestamp: ts,
          threshold, dilatePx, dirtPct: pct,
          w: canvas.width, h: canvas.height,
          mask: uint8ToBase64(mask),
        }));
      } catch { /* storage full or unavailable */ }
    } catch { /* ignore */ }
  }, [cameraFrame, threshold, dilatePx]);

  // ── Send helpers ──────────────────────────────────────────────────────
  const sendWS = useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }, []);

  const moveMotor   = (motor: 1 | 2, steps: number) => sendWS({ type: "microscope_motor", data: { motor, steps } });
  const goSample    = (n: number) => sendWS({ type: "microscope_sample", data: n });
  const doHome      = () => sendWS({ type: "microscope_home" });
  const applyColor  = (r: number, g: number, b: number) => sendWS({ type: "microscope_led", data: `${r},${g},${b}` });
  const turnLedOn   = () => { setLedOn(true);  sendWS({ type: "microscope_led", data: "1" }); };
  const turnLedOff  = () => { setLedOn(false); sendWS({ type: "microscope_led", data: "0" }); };
  const handleR     = (v: number) => { setLedR(v); applyColor(v, ledG, ledB); };
  const handleG     = (v: number) => { setLedG(v); applyColor(ledR, v, ledB); };
  const handleB     = (v: number) => { setLedB(v); applyColor(ledR, ledG, v); };
  const applyPreset = (r: number, g: number, b: number) => { setLedR(r); setLedG(g); setLedB(b); setLedOn(true); sendWS({ type: "microscope_led", data: `${r},${g},${b}` }); };
  const toggleSensors = () => { const next = !sensorsRunning; setSensors(next); sendWS({ type: "microscope_sensors", data: next }); };
  const cycleCamera   = (dir: number) => { if (availableCameras.length <= 1) return; setCameraIndex((p) => (p + dir + availableCameras.length) % availableCameras.length); };
  const refreshCameras = () => { const ws = cameraWsRef.current; if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "get_cameras" })); };

  const { motor1_pos, motor2_pos, current_sample, sensors } = microState;
  const { mq135_1, mq135_2, mics5524 } = sensors;

  // What the camera panel actually displays
  const shownFrame = viewMode === "original" || !calibrated ? cameraFrame : displayFrame;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full w-full overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-3 mb-3 flex-shrink-0">
        <h2 className="text-2xl font-bold">Laboratory — Microscope</h2>
        <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
        <span className="text-xs text-gray-400">{connected ? "ESP32 Connected" : "Disconnected"}</span>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_1fr_340px] gap-3 min-h-0 overflow-hidden">

        {/* ══ COL 1: Charts ══════════════════════════════════════════════ */}
        <div className="flex flex-col gap-2 min-h-0 overflow-y-auto">
          <div className="flex items-center justify-between flex-shrink-0">
            <h3 className="text-sm font-bold">Sensor Readings</h3>
            <button onClick={toggleSensors}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition
                ${sensorsRunning ? "bg-red-600 hover:bg-red-500" : "bg-green-700 hover:bg-green-600"}`}>
              {sensorsRunning ? "⏹ Stop" : "▶ Start Reading"}
            </button>
          </div>

          <SensorChart title="CO₂ (ppm)" datasets={[
            { label: "MQ135-1", color: "#f59e0b", data: history.co2_1, current: mq135_1[0] ?? 0, unit: "ppm" },
            { label: "MQ135-2", color: "#fb923c", data: history.co2_2, current: mq135_2[0] ?? 0, unit: "ppm" },
          ]} />
          <SensorChart title="Alcohol (ppm)" datasets={[
            { label: "MQ135-1", color: "#8b5cf6", data: history.alc_1, current: mq135_1[1] ?? 0, unit: "ppm" },
            { label: "MQ135-2", color: "#a78bfa", data: history.alc_2, current: mq135_2[1] ?? 0, unit: "ppm" },
          ]} />
          <SensorChart title="Amonio log (ratio)" datasets={[
            { label: "MQ135-1", color: "#ef4444", data: history.ami_1, current: mq135_1[2] ?? 0 },
            { label: "MQ135-2", color: "#f87171", data: history.ami_2, current: mq135_2[2] ?? 0 },
          ]} />
          <SensorChart title="Tolueno (ppm)" datasets={[
            { label: "MQ135-1", color: "#06b6d4", data: history.tol_1, current: mq135_1[4] ?? 0, unit: "ppm" },
            { label: "MQ135-2", color: "#67e8f9", data: history.tol_2, current: mq135_2[4] ?? 0, unit: "ppm" },
          ]} />
          <SensorChart title="MICS5524" datasets={[
            { label: "Ethanol", color: "#10b981", data: history.eth, current: mics5524[0] ?? 0, unit: "ppm" },
            { label: "Ammonia", color: "#34d399", data: history.amm, current: mics5524[1] ?? 0, unit: "ppm" },
            { label: "Methane", color: "#6ee7b7", data: history.met, current: mics5524[2] ?? 0, unit: "ppm" },
          ]} />
        </div>

        {/* ══ COL 2: Camera + Processing Pipeline ════════════════════════ */}
        <div className="bg-gray-800 rounded-2xl shadow-lg border border-gray-700 flex flex-col min-h-0 overflow-hidden">

          {/* Row 1: Title + FPS + quality */}
          <div className="flex items-center justify-between px-3 py-1.5 flex-shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold">Microscope Camera</h3>
              <div className={`w-2 h-2 rounded-full ${cameraConnected ? "bg-green-400" : "bg-red-400"}`} />
              <span className="text-[11px] text-gray-400">{fps} FPS</span>
              {calibrated && (
                <span className="text-[10px] font-mono text-green-400 flex items-center gap-1">
                  ✓ {dirtPct.toFixed(1)}% dirt
                  {calibratedAt && (
                    <span className="text-gray-500">
                      · {new Date(calibratedAt).toLocaleString()}
                    </span>
                  )}
                </span>
              )}
            </div>
            <div className="flex gap-1">
              {QUALITY_PRESETS.map((q) => (
                <button key={q.value} onClick={() => setQuality(q.value)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition
                    ${quality === q.value ? "bg-amber-600 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}>
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          {/* Row 2: Processing pipeline controls */}
          <div className="flex items-center flex-wrap gap-x-2 gap-y-1 px-3 py-1.5 flex-shrink-0 border-t border-gray-700/60 bg-gray-900/40">
            {/* Calibrate */}
            <button
              onClick={calibrate}
              disabled={!cameraFrame}
              className={`px-2.5 py-1 rounded text-[10px] font-semibold transition
                ${!cameraFrame ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                  : calibrated   ? "bg-yellow-700 hover:bg-yellow-600 text-white"
                  :                "bg-yellow-600 hover:bg-yellow-500 text-white"}`}>
              {calibrated ? "↺ Re-calibrate" : "Calibrate"}
            </button>

            {/* View mode */}
            {(["original", "cleaned", "mask"] as ViewMode[]).map((m) => (
              <button key={m}
                onClick={() => setViewMode(m)}
                disabled={m !== "original" && !calibrated}
                className={`px-2 py-1 rounded text-[10px] font-semibold capitalize transition
                  ${viewMode === m
                    ? "bg-cyan-600 text-white"
                    : m !== "original" && !calibrated
                      ? "bg-gray-700 text-gray-600 cursor-not-allowed"
                      : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}>
                {m}
              </button>
            ))}

            {/* Parameter sliders */}
            <div className="flex items-center gap-1.5 ml-1">
              <span className="text-[9px] text-gray-500">thr</span>
              <input type="range" min={20} max={200} value={threshold}
                onChange={(e) => setThreshold(parseInt(e.target.value))}
                className="w-14 h-0.5 accent-yellow-500" />
              <span className="text-[9px] font-mono text-gray-400 w-5">{threshold}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-gray-500">dil</span>
              <input type="range" min={0} max={10} value={dilatePx}
                onChange={(e) => setDilatePx(parseInt(e.target.value))}
                className="w-12 h-0.5 accent-yellow-500" />
              <span className="text-[9px] font-mono text-gray-400 w-3">{dilatePx}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-gray-500">r</span>
              <input type="range" min={1} max={15} value={inpaintRadius}
                onChange={(e) => setInpaintR(parseInt(e.target.value))}
                className="w-12 h-0.5 accent-cyan-500" />
              <span className="text-[9px] font-mono text-gray-400 w-3">{inpaintRadius}</span>
            </div>
          </div>

          {/* Camera image */}
          <div className="flex-1 px-2 min-h-0 overflow-hidden">
            <div className="relative w-full h-full bg-black rounded-xl overflow-hidden flex items-center justify-center">
              {shownFrame ? (
                <img src={shownFrame} alt="Microscope" className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="text-gray-500 text-sm">
                  {cameraConnected ? "Waiting for frames..." : "Disconnected"}
                </span>
              )}
              {activeCamera && (
                <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-md px-2 py-1 text-xs text-white font-semibold">
                  {activeCamera.label}
                </div>
              )}
              {viewMode !== "original" && calibrated && (
                <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-semibold backdrop-blur-sm
                  ${viewMode === "cleaned" ? "bg-green-700/80 text-green-200" : "bg-red-700/80 text-red-200"}`}>
                  {viewMode === "cleaned" ? "CLEANED" : "MASK OVERLAY"}
                </div>
              )}
              <button onClick={() => cycleCamera(-1)} disabled={availableCameras.length <= 1}
                className={`absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm transition
                  ${availableCameras.length > 1 ? "bg-black/50 hover:bg-black/70" : "bg-black/20 text-white/30 cursor-not-allowed"}`}>◀</button>
              <button onClick={() => cycleCamera(1)} disabled={availableCameras.length <= 1}
                className={`absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm transition
                  ${availableCameras.length > 1 ? "bg-black/50 hover:bg-black/70" : "bg-black/20 text-white/30 cursor-not-allowed"}`}>▶</button>
              {availableCameras.length > 0 && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {availableCameras.map((cam, i) => (
                    <button key={cam.id} onClick={() => setCameraIndex(i)}
                      className={`w-2 h-2 rounded-full transition ${i === cameraIndex ? "bg-cyan-400 scale-125" : "bg-white/40 hover:bg-white/60"}`} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between px-3 py-1 flex-shrink-0">
            <span className="text-[10px] text-gray-400">
              {availableCameras.length > 0 ? `${cameraIndex + 1}/${availableCameras.length}` : "No cameras"}
            </span>
            <button onClick={refreshCameras}
              className="text-[10px] text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 px-1.5 py-0.5 rounded transition">
              refresh
            </button>
          </div>
        </div>

        {/* ══ COL 3: Controls ════════════════════════════════════════════ */}
        <div className="bg-gray-800 rounded-2xl shadow-lg border border-gray-700 p-4 flex flex-col min-h-0 overflow-y-auto gap-4">

          {/* Sample Selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400">Sample Position</h4>
              <span className="text-[10px] font-mono text-cyan-400">#{current_sample}</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5 mb-2">
              {SAMPLES.map((n) => (
                <button key={n} onClick={() => goSample(n)}
                  className={`py-2 rounded-lg text-sm font-bold transition
                    ${current_sample === n ? "bg-cyan-600 text-white ring-2 ring-cyan-400" : "bg-gray-700 hover:bg-gray-600 text-gray-300"}`}>
                  {n}
                </button>
              ))}
            </div>
            <button onClick={doHome} className="w-full py-1.5 rounded-lg text-xs font-semibold bg-green-700 hover:bg-green-600 transition">
              🏠 HOME — Reset Positions
            </button>
          </div>

          {/* Motor 1 — Focus */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1.5">
              Motor 1 — Focus &nbsp;<span className="text-cyan-400 font-mono">{motor1_pos} steps</span>
            </h4>
            <div className="grid grid-cols-6 gap-1 mb-1.5">
              {([-100, -50, -10, 10, 50, 100] as const).map((s) => (
                <button key={s} onClick={() => moveMotor(1, s)}
                  className={`py-1.5 rounded text-[10px] font-semibold transition ${s < 0 ? "bg-gray-600 hover:bg-gray-500" : "bg-blue-700 hover:bg-blue-600"}`}>
                  {s > 0 ? `+${s}` : s}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input type="number" value={m1Steps} onChange={(e) => setM1Steps(Math.abs(parseInt(e.target.value) || 0))}
                className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white min-w-0" />
              <button onClick={() => moveMotor(1, m1Steps)} className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs font-semibold transition">+</button>
              <button onClick={() => moveMotor(1, -m1Steps)} className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs font-semibold transition">−</button>
            </div>
          </div>

          {/* Motor 2 — Rail */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1.5">
              Motor 2 — Rail &nbsp;<span className="text-purple-400 font-mono">{motor2_pos} steps</span>
            </h4>
            <div className="grid grid-cols-6 gap-1 mb-1.5">
              {([-100, -50, -10, 10, 50, 100] as const).map((s) => (
                <button key={s} onClick={() => moveMotor(2, s)}
                  className={`py-1.5 rounded text-[10px] font-semibold transition ${s < 0 ? "bg-gray-600 hover:bg-gray-500" : "bg-purple-700 hover:bg-purple-600"}`}>
                  {s > 0 ? `+${s}` : s}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input type="number" value={m2Steps} onChange={(e) => setM2Steps(Math.abs(parseInt(e.target.value) || 0))}
                className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white min-w-0" />
              <button onClick={() => moveMotor(2, m2Steps)} className="px-2 py-1 bg-purple-600 hover:bg-purple-500 rounded text-xs font-semibold transition">+</button>
              <button onClick={() => moveMotor(2, -m2Steps)} className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs font-semibold transition">−</button>
            </div>
          </div>

          {/* LEDs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400">LEDs (NeoPixel)</h4>
              <div className="flex gap-1">
                <button onClick={turnLedOn} className={`px-2.5 py-0.5 rounded text-[10px] font-semibold transition ${ledOn ? "bg-green-600 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}>ON</button>
                <button onClick={turnLedOff} className={`px-2.5 py-0.5 rounded text-[10px] font-semibold transition ${!ledOn ? "bg-red-600 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}>OFF</button>
              </div>
            </div>
            <div className="w-full h-5 rounded-md mb-2 border border-gray-600"
              style={{ backgroundColor: ledOn ? `rgb(${ledR},${ledG},${ledB})` : "#111" }} />
            {([["R", ledR, handleR, "accent-red-500"], ["G", ledG, handleG, "accent-green-500"], ["B", ledB, handleB, "accent-blue-500"]] as [string, number, (v: number) => void, string][]).map(([label, val, handler, accent]) => (
              <div key={label} className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-gray-400 w-3">{label}</span>
                <input type="range" min={0} max={255} value={val} onChange={(e) => handler(parseInt(e.target.value))} className={`flex-1 h-1 ${accent}`} />
                <span className="text-[10px] font-mono text-gray-400 w-7 text-right">{val}</span>
              </div>
            ))}
            <div className="grid grid-cols-4 gap-1 mt-1.5">
              {([{ label: "White", r: 255, g: 255, b: 255 }, { label: "Warm", r: 255, g: 180, b: 80 }, { label: "Blue", r: 80, g: 150, b: 255 }, { label: "Green", r: 80, g: 255, b: 120 }]).map(({ label, r, g, b }) => (
                <button key={label} onClick={() => applyPreset(r, g, b)}
                  className="py-0.5 rounded text-[9px] font-semibold bg-gray-700 hover:bg-gray-600 transition"
                  style={{ borderBottom: `2px solid rgb(${r},${g},${b})` }}>{label}</button>
              ))}
            </div>
          </div>

          {/* Serial Log */}
          <div className="flex flex-col min-h-0">
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">ESP32 Serial Log</h4>
            <div ref={logRef}
              className="bg-gray-900 rounded-lg p-2 overflow-y-auto font-mono text-[10px] text-green-400 space-y-px border border-gray-700"
              style={{ maxHeight: "140px", minHeight: "60px" }}>
              {statusLog.length === 0
                ? <span className="text-gray-600">Waiting for messages...</span>
                : statusLog.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
