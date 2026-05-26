import React, { useState, useEffect, useRef, useCallback } from "react";
import cv2 from "@techstark/opencv-js";

// ─────────────────────────────────────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────────────────────────────────────

const IMU_WS_PATH = "/ws/connection/move";
const BRIDGE_HOST = "192.168.1.3:8001";

type ProcessingParams = {
  bilateral_d: number; blur: number; canny_low: number; canny_high: number;
  clahe_clip: number; gamma: number; saturation: number;
  morph_op: number; morph_k: number; edge_color: number;
};

const DEFAULT_PARAMS: ProcessingParams = {
  bilateral_d: 9, blur: 5, canny_low: 50, canny_high: 150,
  clahe_clip: 3, gamma: 100, saturation: 100, morph_op: 0, morph_k: 1, edge_color: 0,
};

const PANEL_LABELS = [
  "Original", "Overlay Edges", "Saturación HSV",
  "CLAHE Gray", "Canny Edges", "Morph Edges",
];

const MORPH_NAMES = ["None", "Dilate", "Erode", "Open", "Close"];

const EDGE_COLORS: { name: string; bgr: [number, number, number]; css: string }[] = [
  { name: "Verde",    bgr: [0,   255, 80 ], css: "#50ff00" },
  { name: "Cian",     bgr: [255, 200, 0  ], css: "#00c8ff" },
  { name: "Rojo",     bgr: [0,   60,  255], css: "#ff3c00" },
  { name: "Amarillo", bgr: [0,   220, 255], css: "#ffdc00" },
  { name: "Blanco",   bgr: [255, 255, 255], css: "#ffffff" },
  { name: "Magenta",  bgr: [255, 0,   220], css: "#dc00ff" },
];

const PRESETS: Record<string, Partial<ProcessingParams>> = {
  "Default":          { bilateral_d: 9,  blur: 5,  canny_low: 50,  canny_high: 150, clahe_clip: 3,  gamma: 100, saturation: 100, morph_op: 0, morph_k: 1 },
  "Estratos Finos":   { bilateral_d: 5,  blur: 3,  canny_low: 30,  canny_high: 90,  clahe_clip: 4,  gamma: 110, saturation: 120, morph_op: 0, morph_k: 1 },
  "Estratos Gruesos": { bilateral_d: 15, blur: 7,  canny_low: 80,  canny_high: 200, clahe_clip: 5,  gamma: 90,  saturation: 130, morph_op: 4, morph_k: 2 },
  "Roca Volcánica":   { bilateral_d: 20, blur: 9,  canny_low: 100, canny_high: 220, clahe_clip: 2,  gamma: 85,  saturation: 80,  morph_op: 2, morph_k: 3 },
  "Foto Subexpuesta": { bilateral_d: 9,  blur: 5,  canny_low: 40,  canny_high: 120, clahe_clip: 8,  gamma: 160, saturation: 140, morph_op: 0, morph_k: 1 },
  "Sobreexpuesta":    { bilateral_d: 9,  blur: 5,  canny_low: 60,  canny_high: 160, clahe_clip: 3,  gamma: 65,  saturation: 90,  morph_op: 0, morph_k: 1 },
  "Alto Contraste":   { bilateral_d: 7,  blur: 3,  canny_low: 20,  canny_high: 70,  clahe_clip: 10, gamma: 100, saturation: 150, morph_op: 1, morph_k: 1 },
  "Publicación":      { bilateral_d: 25, blur: 11, canny_low: 60,  canny_high: 180, clahe_clip: 4,  gamma: 100, saturation: 100, morph_op: 4, morph_k: 3 },
};

const SLIDER_DEFS: [string, keyof ProcessingParams, number, number][] = [
  ["Bilateral D",   "bilateral_d",  1,  30],
  ["Gaussian Blur", "blur",         1,  21],
  ["Canny Low",     "canny_low",    1, 254],
  ["Canny High",    "canny_high",   2, 255],
  ["CLAHE Clip",    "clahe_clip",   1,  10],
  ["Gamma ×0.01",   "gamma",       10, 300],
  ["Saturación %",  "saturation",   0, 200],
  ["Morph Kernel",  "morph_k",      1,   7],
];

type CameraInfo = { id: number; label: string; stereo?: boolean };

type CapturedImage = {
  src: string; width: number; height: number;
  stereo: boolean; takenAt: number; heading: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Stitch helper (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
function stitchStereoFrame(imgSrc: string, newStripPct = 0.10): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const fw = img.naturalWidth, fh = img.naturalHeight;
      const hw = Math.floor(fw / 2);
      const stripW = Math.round(hw * newStripPct);
      const canvas = document.createElement("canvas");
      canvas.width = hw + stripW;
      canvas.height = fh;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, hw, fh, 0, 0, hw, fh);
      ctx.drawImage(img, fw - stripW, 0, stripW, fh, hw, 0, stripW, fh);
      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = imgSrc;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenCV processing (pure functions — no React dependency)
// ─────────────────────────────────────────────────────────────────────────────
function matToDataURL(mat: any): string {
  const canvas = document.createElement("canvas");
  cv2.imshow(canvas, mat);
  return canvas.toDataURL("image/jpeg", 0.88);
}

function cvApplyGamma(src: any, gammaVal: number): any {
  const g = Math.max(0.01, gammaVal / 100);
  const lut = new cv2.Mat(1, 256, cv2.CV_8UC1);
  for (let i = 0; i < 256; i++)
    lut.data[i] = Math.min(255, Math.round(Math.pow(i / 255, 1 / g) * 255));
  const dst = new cv2.Mat();
  cv2.LUT(src, lut, dst);
  lut.delete();
  return dst;
}

function cvApplySaturation(src: any, sv: number): any {
  const hsv = new cv2.Mat();
  cv2.cvtColor(src, hsv, cv2.COLOR_BGR2HSV);
  const planes = new cv2.MatVector();
  cv2.split(hsv, planes);
  hsv.delete();
  const h = planes.get(0), s = planes.get(1), v = planes.get(2);
  const sScaled = new cv2.Mat();
  s.convertTo(sScaled, cv2.CV_8U, sv / 100);
  s.delete();
  const merged = new cv2.MatVector();
  merged.push_back(h); merged.push_back(sScaled); merged.push_back(v);
  h.delete(); sScaled.delete(); v.delete(); planes.delete();
  const hsvOut = new cv2.Mat();
  cv2.merge(merged, hsvOut);
  merged.delete();
  const bgr = new cv2.Mat();
  cv2.cvtColor(hsvOut, bgr, cv2.COLOR_HSV2BGR);
  hsvOut.delete();
  return bgr;
}

function cvApplyMorph(edges: any, op: number, k: number): any {
  if (op === 0) return edges.clone();
  const ksize = k * 2 + 1;
  const kernel = cv2.getStructuringElement(cv2.MORPH_RECT, new cv2.Size(ksize, ksize));
  const dst = new cv2.Mat();
  if      (op === 1) cv2.dilate(edges, dst, kernel);
  else if (op === 2) cv2.erode(edges, dst, kernel);
  else if (op === 3) cv2.morphologyEx(edges, dst, cv2.MORPH_OPEN,  kernel);
  else               cv2.morphologyEx(edges, dst, cv2.MORPH_CLOSE, kernel);
  kernel.delete();
  return dst;
}

async function processAll(imageSrc: string, p: ProcessingParams): Promise<string[]> {
  const results: string[] = new Array(6).fill("");

  // Load the stitched panorama onto a canvas so cv2.imread gets RGBA
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload  = () => resolve(el);
    el.onerror = () => reject(new Error("Image load failed"));
    el.src = imageSrc;
  });
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width  = img.naturalWidth;
  srcCanvas.height = img.naturalHeight;
  srcCanvas.getContext("2d")!.drawImage(img, 0, 0);

  // RGBA (from canvas) → BGR (OpenCV standard)
  const rgba = cv2.imread(srcCanvas);
  const bgr  = new cv2.Mat();
  cv2.cvtColor(rgba, bgr, (cv2 as any).COLOR_RGBA2BGR ?? 4);
  rgba.delete();

  // Panel 0: Original
  results[0] = matToDataURL(bgr);

  // Gamma + Saturation adjustments
  const gammaAdj = cvApplyGamma(bgr, p.gamma);
  bgr.delete();
  const satAdj = cvApplySaturation(gammaAdj, p.saturation);
  gammaAdj.delete();

  // Bilateral filter (preserve satAdj for panel 1 overlay)
  const d  = Math.max(1, p.bilateral_d);
  const bi = new cv2.Mat();
  cv2.bilateralFilter(satAdj, bi, d, 75, 75, cv2.BORDER_DEFAULT);

  // Panel 2: Saturation channel as JET colormap
  {
    const hsv    = new cv2.Mat();
    cv2.cvtColor(bi, hsv, cv2.COLOR_BGR2HSV);
    const planes = new cv2.MatVector();
    cv2.split(hsv, planes);
    hsv.delete();
    const hCh = planes.get(0); hCh.delete();
    const sCh = planes.get(1);
    const vCh = planes.get(2); vCh.delete();
    planes.delete();
    const jetMap = new cv2.Mat();
    cv2.applyColorMap(sCh, jetMap, cv2.COLORMAP_JET);
    sCh.delete();
    results[2] = matToDataURL(jetMap);
    jetMap.delete();
  }

  // Gaussian blur → Grayscale → CLAHE
  let bv = Math.max(1, p.blur); if (bv % 2 === 0) bv++;
  const blr  = new cv2.Mat();
  cv2.GaussianBlur(bi, blr, new cv2.Size(bv, bv), 0);
  bi.delete();
  const gray = new cv2.Mat();
  cv2.cvtColor(blr, gray, cv2.COLOR_BGR2GRAY);
  blr.delete();
  const claheObj = new (cv2 as any).CLAHE(Math.max(1, p.clahe_clip), new cv2.Size(8, 8));
  const cl1 = new cv2.Mat();
  claheObj.apply(gray, cl1);
  claheObj.delete(); gray.delete();

  // Panel 3: CLAHE grayscale
  { const c = new cv2.Mat(); cv2.cvtColor(cl1, c, cv2.COLOR_GRAY2BGR); results[3] = matToDataURL(c); c.delete(); }

  // Canny edge detection
  const cl    = Math.max(1, p.canny_low);
  const ch    = Math.max(cl + 1, p.canny_high);
  const canny = new cv2.Mat();
  cv2.Canny(cl1, canny, cl, ch);
  cl1.delete();

  // Panel 4: Canny edges
  { const c = new cv2.Mat(); cv2.cvtColor(canny, c, cv2.COLOR_GRAY2BGR); results[4] = matToDataURL(c); c.delete(); }

  // Morphological operation
  const morph = cvApplyMorph(canny, p.morph_op, p.morph_k);
  canny.delete();

  // Panel 5: Morph edges
  { const c = new cv2.Mat(); cv2.cvtColor(morph, c, cv2.COLOR_GRAY2BGR); results[5] = matToDataURL(c); c.delete(); }

  // Panel 1: Original with colored edges overlaid
  {
    const overlay        = satAdj.clone();
    const [B, G, R]      = EDGE_COLORS[p.edge_color].bgr;
    const fill           = new cv2.Mat(overlay.rows, overlay.cols, cv2.CV_8UC3, new cv2.Scalar(B, G, R));
    fill.copyTo(overlay, morph);
    fill.delete();
    results[1] = matToDataURL(overlay);
    overlay.delete();
  }

  morph.delete();
  satAdj.delete();

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Compass rose (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
function bearingToCardinal(bearing: number): string {
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(bearing / 45) % 8];
}

const CompassRose: React.FC<{ yaw: number; frozen: boolean }> = ({ yaw, frozen }) => {
  const rotation = yaw - 90;
  const bearing  = ((90 - yaw) % 360 + 360) % 360;
  const cardinal = bearingToCardinal(bearing);
  const ticks    = Array.from({ length: 12 }, (_, i) => i * 30);
  const pt = (deg: number, r: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: 50 + r * Math.sin(rad), y: 50 - r * Math.cos(rad) };
  };
  const cardinals = [
    { label: "N", deg: 0,   color: "#fbbf24" },
    { label: "E", deg: 90,  color: "#e5e7eb" },
    { label: "S", deg: 180, color: "#e5e7eb" },
    { label: "W", deg: 270, color: "#e5e7eb" },
  ];
  return (
    <div className="absolute top-3 right-3 z-20 pointer-events-none select-none">
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 100 100" className="absolute inset-0"
          style={{ transform: `rotate(${rotation}deg)`, transition: frozen ? "none" : "transform 0.12s linear" }}>
          {ticks.map(deg => {
            const major = deg % 90 === 0;
            const a = pt(deg, 40), b = pt(deg, major ? 33 : 36);
            return <line key={deg} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={major ? "#9ca3af" : "#4b5563"} strokeWidth={major ? 1.4 : 0.8} />;
          })}
          {cardinals.map(c => {
            const p = pt(c.deg, 24);
            return <text key={c.label} x={p.x} y={p.y} fill={c.color} fontSize="11"
              fontWeight="700" textAnchor="middle" dominantBaseline="central">{c.label}</text>;
          })}
        </svg>
        <svg viewBox="0 0 100 100" className="absolute inset-0">
          <circle cx="50" cy="50" r="46" fill="rgba(17,24,39,0.55)" />
          <circle cx="50" cy="50" r="46" fill="none" stroke="#374151" strokeWidth="1.5" />
          <polygon points="50,6 46,17 54,17" fill="#f59e0b" />
          <circle cx="50" cy="50" r="2" fill="#6b7280" />
          <text x="50" y="62" fill="#f3f4f6" fontSize="13" fontWeight="700" textAnchor="middle">
            {Math.round(bearing)}°
          </text>
          <text x="50" y="72" fill="#9ca3af" fontSize="7" letterSpacing="1" textAnchor="middle">
            {cardinal}
          </text>
        </svg>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
const Strat: React.FC = () => {
  // ── Existing state ──────────────────────────────────────────────────────────
  const [frame,       setFrame]       = useState<string | null>(null);
  const [captured,    setCaptured]    = useState<CapturedImage | null>(null);
  const [connected,   setConnected]   = useState(false);
  const [capturing,   setCapturing]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [cameraLabel, setCameraLabel] = useState("ZED 2i");
  const [stitching,   setStitching]   = useState(false);
  const [newStripPct, setNewStripPct] = useState(0.10);
  const [liveYaw,     setLiveYaw]     = useState(0);

  // ── Analysis state ──────────────────────────────────────────────────────────
  const [cvReady,       setCvReady]       = useState(false);
  const [params,        setParams]        = useState<ProcessingParams>(DEFAULT_PARAMS);
  const [panels,        setPanels]        = useState<string[]>([]);
  const [processing,    setProcessing]    = useState(false);
  const [expandedPanel, setExpandedPanel] = useState<number | null>(null);
  const [activePreset,  setActivePreset]  = useState<string | null>(null);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const wsRef               = useRef<WebSocket | null>(null);
  const imuWsRef            = useRef<WebSocket | null>(null);
  const selectedCameraIdRef = useRef<number | null>(null);
  const pendingRawRef       = useRef<string | null>(null);
  const newStripPctRef      = useRef(newStripPct);
  const yawRef              = useRef(0);
  const processTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestParamsRef     = useRef(params);

  useEffect(() => { newStripPctRef.current  = newStripPct;  }, [newStripPct]);
  useEffect(() => { latestParamsRef.current = params;       }, [params]);

  // ── OpenCV initialization ───────────────────────────────────────────────────
  useEffect(() => {
    if ((cv2 as any).Mat) setCvReady(true);
    else cv2.onRuntimeInitialized = () => setCvReady(true);
  }, []);

  // ── Re-process when capture or params change ────────────────────────────────
  useEffect(() => {
    if (!cvReady || !captured) { setPanels([]); return; }
    if (processTimerRef.current) clearTimeout(processTimerRef.current);
    setProcessing(true);
    processTimerRef.current = setTimeout(async () => {
      try {
        const result = await processAll(captured.src, latestParamsRef.current);
        setPanels(result);
      } catch (e) {
        console.error("OpenCV processing error:", e);
      } finally {
        setProcessing(false);
      }
    }, 150);
    return () => { if (processTimerRef.current) clearTimeout(processTimerRef.current); };
  }, [captured, params, cvReady]);

  // ── Re-stitch when strip % changes ─────────────────────────────────────────
  const restitch = useCallback(async (rawSrc: string) => {
    try {
      setStitching(true);
      const stitched = await stitchStereoFrame(rawSrc, newStripPct);
      const img = new Image();
      img.onload = () => {
        setCaptured(prev => prev
          ? { ...prev, src: stitched, width: img.naturalWidth, height: img.naturalHeight }
          : prev);
        setStitching(false);
      };
      img.src = stitched;
    } catch { setStitching(false); }
  }, [newStripPct]);

  useEffect(() => {
    if (pendingRawRef.current && captured) restitch(pendingRawRef.current);
  }, [newStripPct, restitch, captured]);

  // ── Camera WebSocket ────────────────────────────────────────────────────────
  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${BRIDGE_HOST}/ws/connection/camera`);
    wsRef.current = ws;

    ws.onopen  = () => { setConnected(true); ws.send(JSON.stringify({ type: "get_cameras" })); };
    ws.onclose = () => { setConnected(false); setFrame(null); };
    ws.onerror = () => setConnected(false);

    ws.onmessage = async (e) => {
      if (typeof e.data !== "string") return;
      let msg: any;
      try { msg = JSON.parse(e.data); } catch { return; }

      if (msg.type === "cameras" && Array.isArray(msg.data)) {
        const cams: CameraInfo[] = msg.data;
        const zed = cams.find(c => c.stereo) ?? cams[0];
        if (zed && selectedCameraIdRef.current !== zed.id) {
          selectedCameraIdRef.current = zed.id;
          setCameraLabel(zed.label || "ZED 2i");
          ws.send(JSON.stringify({ type: "config", camera_id: zed.id, quality: 60 }));
        } else if (!zed) {
          setError("No camera detected on the bridge");
        }
      } else if (msg.type === "frame" && msg.data) {
        setFrame(`data:image/jpeg;base64,${msg.data}`);
      } else if (msg.type === "capture" && msg.data) {
        const raw = `data:image/jpeg;base64,${msg.data}`;
        pendingRawRef.current = raw;
        const headingSnapshot = yawRef.current;
        try {
          const stitched = await stitchStereoFrame(raw, newStripPctRef.current);
          const img = new Image();
          img.onload = () => {
            setCaptured({ src: stitched, width: img.naturalWidth, height: img.naturalHeight, stereo: !!msg.stereo, takenAt: Date.now(), heading: headingSnapshot });
            setCapturing(false);
            setError(null);
          };
          img.src = stitched;
        } catch {
          setCapturing(false);
          setError("Stitch failed");
          setCaptured({ src: raw, width: msg.width ?? 0, height: msg.height ?? 0, stereo: !!msg.stereo, takenAt: Date.now(), heading: headingSnapshot });
        }
      } else if (msg.type === "capture_error") {
        setCapturing(false);
        setError(msg.message || "Capture failed");
      }
    };
    return () => ws.close();
  }, []);

  // ── IMU WebSocket ───────────────────────────────────────────────────────────
  useEffect(() => {
    let stop = false;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      if (stop) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${BRIDGE_HOST}${IMU_WS_PATH}`);
      imuWsRef.current = ws;
      ws.onmessage = (e) => {
        if (typeof e.data !== "string") return;
        let msg: any;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (msg.type === "imu_data" && msg.data && typeof msg.data.yaw === "number") {
          yawRef.current = msg.data.yaw;
          setLiveYaw(msg.data.yaw);
        }
      };
      ws.onclose = () => { if (!stop) retry = setTimeout(connect, 2000); };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => { stop = true; clearTimeout(retry); imuWsRef.current?.close(); };
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const requestCapture = () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) { setError("Not connected to bridge"); return; }
    if (selectedCameraIdRef.current == null)      { setError("Camera not selected yet"); return; }
    setError(null); setCapturing(true);
    ws.send(JSON.stringify({ type: "capture" }));
  };

  const resumeLive = () => {
    setCaptured(null);
    pendingRawRef.current = null;
    setPanels([]);
    setExpandedPanel(null);
    setActivePreset(null);
    setError(null);
  };

  const downloadCapture = () => {
    if (!captured) return;
    const a = document.createElement("a");
    a.href = captured.src;
    a.download = `panorama_${new Date(captured.takenAt).toISOString().replace(/[:.]/g, "_")}.jpg`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const applyPreset = (name: string) => {
    const p = PRESETS[name];
    if (!p) return;
    setParams(prev => ({ ...prev, ...p }));
    setActivePreset(name);
  };

  const updateParam = (key: keyof ProcessingParams, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }));
    setActivePreset(null);
  };

  // ── Derived ─────────────────────────────────────────────────────────────────
  const isCaptured = captured !== null;
  const displayYaw = isCaptured ? captured!.heading : liveYaw;

  // ── Shared header ────────────────────────────────────────────────────────────
  const headerRow = (
    <div className="flex items-center justify-between mb-3 flex-shrink-0 flex-wrap gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-2xl font-bold">Stratigraphic Profile</h2>
        <span className="flex items-center gap-1.5 text-xs text-gray-300 bg-gray-700 px-2 py-0.5 rounded-full">
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
          {connected ? cameraLabel : "Disconnected"}
        </span>
        {!cvReady && (
          <span className="text-xs text-yellow-300 bg-yellow-900/40 border border-yellow-700 px-2 py-0.5 rounded-full animate-pulse">
            Loading analysis tools…
          </span>
        )}
        {isCaptured && (
          <span className="text-xs text-amber-300 bg-amber-900/40 border border-amber-700 px-2 py-0.5 rounded-full">
            Panorama · {Math.round(((90 - captured!.heading) % 360 + 360) % 360)}°
          </span>
        )}
        {processing && (
          <span className="text-xs text-cyan-300 bg-cyan-900/40 border border-cyan-700 px-2 py-0.5 rounded-full animate-pulse">
            Processing…
          </span>
        )}
        {stitching && (
          <span className="text-xs text-cyan-300 bg-cyan-900/40 border border-cyan-700 px-2 py-0.5 rounded-full animate-pulse">
            Stitching…
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {isCaptured ? (
          <>
            <button onClick={downloadCapture}
              className="text-xs font-semibold text-white bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg transition">
              Download
            </button>
            <button onClick={resumeLive}
              className="text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 px-4 py-1.5 rounded-lg transition">
              Resume Live
            </button>
          </>
        ) : (
          <button onClick={requestCapture} disabled={!connected || capturing}
            className={`text-xs font-semibold px-4 py-1.5 rounded-lg transition ${!connected || capturing ? "bg-gray-700 text-gray-400 cursor-not-allowed" : "bg-amber-600 hover:bg-amber-500 text-white"}`}>
            {capturing ? "Capturing…" : "Capture Panorama"}
          </button>
        )}
      </div>
    </div>
  );

  // ── Live view ────────────────────────────────────────────────────────────────
  if (!isCaptured) {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden">
        {headerRow}
        <div className="flex-1 min-h-0 bg-gray-800 rounded-2xl shadow-lg border border-gray-700 p-2 overflow-hidden">
          <div className="relative w-full h-full bg-black rounded-xl overflow-hidden flex items-center justify-center">
            {frame ? (
              <img src={frame} alt="ZED 2i live" className="max-w-full max-h-full object-contain" />
            ) : (
              <div className="text-gray-500 text-sm">{connected ? "Waiting for frames…" : "Disconnected"}</div>
            )}
            <CompassRose yaw={displayYaw} frozen={false} />
            <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-md px-2 py-1 text-xs text-white font-semibold">
              {cameraLabel} · Live Raw
            </div>
            {error && (
              <div className="absolute bottom-2 left-2 right-2 bg-red-900/80 border border-red-700 text-red-100 text-xs px-3 py-2 rounded-md">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Analysis view (after capture) ───────────────────────────────────────────
  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {headerRow}

      {/* Strip slider */}
      {pendingRawRef.current && (
        <div className="flex items-center gap-3 mb-2 flex-shrink-0 bg-gray-800 rounded-xl px-4 py-2">
          <span className="text-xs text-gray-400 whitespace-nowrap">Right strip</span>
          <input type="range" min={2} max={30} step={1}
            value={Math.round(newStripPct * 100)}
            onChange={ev => setNewStripPct(Number(ev.target.value) / 100)}
            className="flex-1 accent-amber-500" />
          <span className="text-xs text-amber-300 w-8 text-right">{Math.round(newStripPct * 100)}%</span>
        </div>
      )}

      <div className="flex flex-row flex-1 min-h-0 gap-3">

        {/* 6-panel analysis grid */}
        <div className="flex-1 min-w-0 grid grid-cols-3 grid-rows-2 gap-2">
          {PANEL_LABELS.map((label, i) => (
            <div key={i} onClick={() => panels[i] && setExpandedPanel(i)}
              className="relative bg-gray-900 rounded-xl overflow-hidden border border-gray-700 hover:border-amber-500/60 transition-colors group cursor-pointer">
              {panels[i] ? (
                <img src={panels[i]} alt={label} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  {processing
                    ? <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                    : <div className="text-gray-600 text-xs">—</div>
                  }
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/75 to-transparent px-2 py-1.5">
                <span className="text-xs text-gray-200 font-semibold">{label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Control panel */}
        <div className="w-64 flex-shrink-0 flex flex-col bg-gray-900 rounded-2xl border border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700 flex-shrink-0">
            <p className="text-xs font-bold text-amber-400 tracking-widest">STRATIGRAPH ANALYZER</p>
            <p className="text-xs text-gray-500 mt-0.5">Quantum Robotics · URC 2026</p>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">

            {/* Presets */}
            <div className="pt-3">
              <p className="text-xs text-gray-500 font-bold tracking-widest mb-2">PRESETS</p>
              <div className="grid grid-cols-2 gap-1">
                {Object.keys(PRESETS).map(name => (
                  <button key={name} onClick={() => applyPreset(name)}
                    className={`text-xs px-2 py-1.5 rounded-lg transition font-medium truncate text-left ${
                      activePreset === name
                        ? "bg-amber-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                    }`}>
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* Sliders */}
            <div>
              <p className="text-xs text-gray-500 font-bold tracking-widest mb-2">PARAMETERS</p>
              <div className="space-y-1.5">
                {SLIDER_DEFS.map(([label, key, min, max]) => (
                  <div key={key} className="bg-gray-800 rounded-lg px-3 py-2">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-gray-400">{label}</span>
                      <span className="text-xs text-amber-400 font-bold w-9 text-right tabular-nums">{params[key]}</span>
                    </div>
                    <input type="range" min={min} max={max} step={1}
                      value={params[key]}
                      onChange={ev => updateParam(key, Number(ev.target.value))}
                      className="w-full accent-amber-500 h-1 cursor-pointer" />
                  </div>
                ))}
              </div>
            </div>

            {/* Morphology */}
            <div>
              <p className="text-xs text-gray-500 font-bold tracking-widest mb-2">MORPHOLOGY</p>
              <div className="flex flex-wrap gap-1">
                {MORPH_NAMES.map((name, i) => (
                  <button key={i} onClick={() => updateParam("morph_op", i)}
                    className={`text-xs px-2.5 py-1 rounded-lg transition ${
                      params.morph_op === i
                        ? "bg-amber-600 text-white font-semibold"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                    }`}>
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* Edge color */}
            <div>
              <p className="text-xs text-gray-500 font-bold tracking-widest mb-2">EDGE COLOR</p>
              <div className="flex flex-wrap gap-1">
                {EDGE_COLORS.map((ec, i) => (
                  <button key={i} onClick={() => updateParam("edge_color", i)}
                    style={params.edge_color === i ? { backgroundColor: ec.css, color: "#000" } : {}}
                    className={`text-xs px-2.5 py-1 rounded-lg transition ${
                      params.edge_color === i
                        ? "font-bold"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                    }`}>
                    {ec.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Reset */}
            <div className="pt-1">
              <button onClick={() => { setParams(DEFAULT_PARAMS); setActivePreset(null); }}
                className="w-full text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg transition">
                ↺ Reset Parameters
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Expanded panel modal */}
      {expandedPanel !== null && panels[expandedPanel] && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-6"
          onClick={() => setExpandedPanel(null)}>
          <div className="relative w-full max-w-5xl" onClick={e => e.stopPropagation()}>
            <div className="bg-gray-900 rounded-2xl overflow-hidden border border-gray-600 shadow-2xl">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700">
                <div className="flex gap-1 flex-wrap">
                  {PANEL_LABELS.map((lbl, i) => (
                    <button key={i} onClick={() => setExpandedPanel(i)}
                      className={`text-xs px-2.5 py-1 rounded-lg transition ${
                        expandedPanel === i
                          ? "bg-amber-600 text-white font-semibold"
                          : "text-gray-400 hover:text-white hover:bg-gray-800"
                      }`}>
                      {lbl}
                    </button>
                  ))}
                </div>
                <button onClick={() => setExpandedPanel(null)}
                  className="text-gray-400 hover:text-white text-xl leading-none ml-3">✕</button>
              </div>
              <img src={panels[expandedPanel]} alt={PANEL_LABELS[expandedPanel]}
                className="w-full max-h-[76vh] object-contain bg-black" />
              <div className="px-4 py-2 flex items-center gap-2">
                <span className="text-xs text-amber-400 font-bold tracking-wide">{PANEL_LABELS[expandedPanel]}</span>
                <span className="text-xs text-gray-600">· click outside to close</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Strat;
