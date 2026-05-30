import React, { useState, useEffect, useRef, useCallback } from "react";
import CompassRose, { bearingToCardinal } from "../components/CompassRose";

const BRIDGE_HOST  = "192.168.1.3:8001";
const IMU_WS_PATH  = "/ws/connection/move";
const GPS_WS_URL   = "ws://localhost:8000/ws/connection/lab";
const ZED_HFOV_DEG = 110;
const MAX_FRAMES   = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type CameraInfo = { id: number; label: string; stereo?: boolean };
type GPS = { lat: number; lon: number };

type Frame = {
  src: string;
  yaw: number;      // raw IMU yaw  (fed into CompassRose)
  bearing: number;  // compass 0=N  (used for stitcher sorting)
  gps: GPS | null;  // coordinates at capture time
  takenAt: number;
  width: number;
  height: number;
};

type Pano = {
  dataUrl: string;
  yaw: number;     // center yaw  → CompassRose
  bearing: number; // center bearing (shown in UI)
  fovDeg: number;  // total horizontal FOV of the stitched image (for scale bar)
  gps: GPS | null; // frozen GPS at capture / center frame for sweep
};

// ─────────────────────────────────────────────────────────────────────────────
// Stereo stitch  (same algorithm as stratigraphic.tsx)
// ─────────────────────────────────────────────────────────────────────────────
function stitchStereo(src: string, stripPct = 0.10): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const fw = img.naturalWidth, fh = img.naturalHeight;
      const hw = Math.floor(fw / 2), sw = Math.round(hw * stripPct);
      const c  = document.createElement("canvas");
      c.width  = hw + sw; c.height = fh;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0,       0, hw, fh, 0,  0, hw, fh);
      ctx.drawImage(img, fw - sw, 0, sw, fh, hw, 0, sw, fh);
      res(c.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = () => rej(new Error("stereo stitch failed"));
    img.src = src;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-frame heading-based stitcher (pure Canvas API, no OpenCV needed)
//
// Each frame covers ZED_HFOV_DEG degrees. Frames are sorted by bearing and
// placed on a wide canvas according to their angular offset from the leftmost
// frame. Overlapping regions are simply overwritten left-to-right, which is
// sufficient for URC field conditions.
// ─────────────────────────────────────────────────────────────────────────────
async function stitchByHeading(frames: Frame[]): Promise<Pano> {
  if (frames.length === 1)
    return { dataUrl: frames[0].src, yaw: frames[0].yaw, bearing: frames[0].bearing, fovDeg: ZED_HFOV_DEG, gps: frames[0].gps };

  // Compute bearing offset relative to the first frame (handles 0/360 wrap)
  const ref = frames[0].bearing;
  const off  = (b: number) => { let d = b - ref; if (d > 180) d -= 360; if (d < -180) d += 360; return d; };
  const sorted = [...frames].map(f => ({ ...f, off: off(f.bearing) })).sort((a, b) => a.off - b.off);

  const imgs = await Promise.all(sorted.map(f => new Promise<HTMLImageElement>((res, rej) => {
    const el = new Image(); el.onload = () => res(el); el.onerror = rej; el.src = f.src;
  })));

  const fw       = imgs[0].naturalWidth;
  const fh       = imgs[0].naturalHeight;
  const pxPerDeg = fw / ZED_HFOV_DEG;
  const minOff   = sorted[0].off  - ZED_HFOV_DEG / 2;
  const maxOff   = sorted[sorted.length - 1].off + ZED_HFOV_DEG / 2;
  const totalDeg = maxOff - minOff;

  const canvas  = document.createElement("canvas");
  canvas.width  = Math.max(1, Math.round(totalDeg * pxPerDeg));
  canvas.height = fh;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < sorted.length; i++) {
    const x = Math.round((sorted[i].off - ZED_HFOV_DEG / 2 - minOff) * pxPerDeg);
    ctx.drawImage(imgs[i], x, 0, fw, fh);
  }

  const centerBearing = ((ref + (minOff + maxOff) / 2) % 360 + 360) % 360;
  const centerYaw     = (90 - centerBearing + 360) % 360;

  return { dataUrl: canvas.toDataURL("image/jpeg", 0.92), yaw: centerYaw, bearing: centerBearing, fovDeg: totalDeg, gps: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scale bar
// Computes the physical width of the image from distance + FOV and draws a
// labelled bar whose pixel width updates when the image element is resized.
// ─────────────────────────────────────────────────────────────────────────────
function niceLen(m: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(m, 0.01))));
  const n = m / p;
  return n < 1.5 ? p : n < 3.5 ? 2 * p : n < 7.5 ? 5 * p : 10 * p;
}

const ScaleBar: React.FC<{ distanceM: number; fovDeg: number; imgEl: HTMLImageElement | null }> =
  ({ distanceM, fovDeg, imgEl }) => {
  const [barPx, setBarPx] = useState(80);
  const [label, setLabel] = useState("5 m");

  useEffect(() => {
    const update = () => {
      if (!imgEl) return;
      const dispW  = imgEl.getBoundingClientRect().width;
      if (dispW === 0) return;
      const widthM = 2 * distanceM * Math.tan((fovDeg * Math.PI) / 360);
      const nice   = niceLen(widthM * 0.12);
      setBarPx(nice * (dispW / widthM));
      setLabel(nice >= 1000 ? `${nice / 1000} km` : `${Math.round(nice * 10) / 10} m`);
    };
    update();
    const ro = new ResizeObserver(update);
    if (imgEl) ro.observe(imgEl);
    return () => ro.disconnect();
  }, [distanceM, fovDeg, imgEl]);

  return (
    <div className="absolute bottom-8 left-6 pointer-events-none select-none">
      <div style={{
        width: barPx, height: 3,
        borderLeft: "2px solid #fff", borderRight: "2px solid #fff", background: "#fff",
      }} />
      <p className="text-white text-xs font-bold mt-0.5" style={{ textShadow: "0 1px 4px #000" }}>
        {label}
      </p>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
const PanoramaView: React.FC = () => {
  const [mode,        setMode]        = useState<"single" | "sweep">("single");
  const [liveFrame,   setLiveFrame]   = useState<string | null>(null);
  const [connected,   setConnected]   = useState(false);
  const [camLabel,    setCamLabel]    = useState("ZED 2i");
  const [capturing,   setCapturing]   = useState(false);
  const [stitching,   setStitching]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [liveYaw,     setLiveYaw]     = useState(0);
  const [distanceM,   setDistanceM]   = useState(10);

  const [singlePano,  setSinglePano]  = useState<Pano | null>(null);
  const [sweepFrames, setSweepFrames] = useState<Frame[]>([]);
  const [sweepPano,   setSweepPano]   = useState<Pano | null>(null);

  // imgEl is tracked via callback ref so the ScaleBar ResizeObserver has a live element
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const imgCallbackRef    = useCallback((el: HTMLImageElement | null) => setImgEl(el), []);

  const [liveGps, setLiveGps] = useState<GPS | null>(null);

  const wsRef    = useRef<WebSocket | null>(null);
  const imuWsRef = useRef<WebSocket | null>(null);
  const gpsWsRef = useRef<WebSocket | null>(null);
  const camIdRef = useRef<number | null>(null);
  const yawRef   = useRef(0);
  const modeRef  = useRef(mode);
  const gpsRef   = useRef<GPS | null>(null);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { yawRef.current  = liveYaw; }, [liveYaw]);
  useEffect(() => { gpsRef.current  = liveGps; }, [liveGps]);

  const activePano = mode === "single" ? singlePano : sweepPano;

  // ── Camera WebSocket ─────────────────────────────────────────────────────
  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws    = new WebSocket(`${proto}://${BRIDGE_HOST}/ws/connection/camera`);
    wsRef.current = ws;

    ws.onopen  = () => { setConnected(true); ws.send(JSON.stringify({ type: "get_cameras" })); };
    ws.onclose = () => { setConnected(false); setLiveFrame(null); };
    ws.onerror = () => setConnected(false);

    ws.onmessage = async (e) => {
      if (typeof e.data !== "string") return;
      let msg: any; try { msg = JSON.parse(e.data); } catch { return; }

      if (msg.type === "cameras" && Array.isArray(msg.data)) {
        const zed = (msg.data as CameraInfo[]).find(c => c.stereo) ?? msg.data[0];
        if (zed && camIdRef.current !== zed.id) {
          camIdRef.current = zed.id;
          setCamLabel(zed.label || "ZED 2i");
          ws.send(JSON.stringify({ type: "config", camera_id: zed.id, quality: 60 }));
        }
      } else if (msg.type === "frame" && msg.data) {
        setLiveFrame(`data:image/jpeg;base64,${msg.data}`);
      } else if (msg.type === "capture" && msg.data) {
        const raw = `data:image/jpeg;base64,${msg.data}`;
        try {
          const stitched = await stitchStereo(raw);
          const yaw      = yawRef.current;
          const bearing  = ((90 - yaw) % 360 + 360) % 360;
          const gps      = gpsRef.current;
          const el       = new Image();
          el.onload = () => {
            const frame: Frame = {
              src: stitched, yaw, bearing, gps,
              takenAt: Date.now(), width: el.naturalWidth, height: el.naturalHeight,
            };
            if (modeRef.current === "single") {
              setSinglePano({ dataUrl: stitched, yaw, bearing, fovDeg: ZED_HFOV_DEG, gps });
            } else {
              setSweepFrames(prev => prev.length < MAX_FRAMES ? [...prev, frame] : prev);
            }
            setCapturing(false); setError(null);
          };
          el.src = stitched;
        } catch { setCapturing(false); setError("Stitch failed"); }
      } else if (msg.type === "capture_error") {
        setCapturing(false); setError(msg.message || "Capture failed");
      }
    };
    return () => ws.close();
  }, []);

  // ── IMU WebSocket ────────────────────────────────────────────────────────
  useEffect(() => {
    let stop = false;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      if (stop) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws    = new WebSocket(`${proto}://${BRIDGE_HOST}${IMU_WS_PATH}`);
      imuWsRef.current = ws;
      ws.onmessage = (e) => {
        if (typeof e.data !== "string") return;
        let msg: any; try { msg = JSON.parse(e.data); } catch { return; }
        if (msg.type === "imu_data" && typeof msg.data?.yaw === "number") {
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

  // ── GPS WebSocket ─────────────────────────────────────────────────────────
  useEffect(() => {
    let stop = false;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      if (stop) return;
      const ws = new WebSocket(GPS_WS_URL);
      gpsWsRef.current = ws;
      ws.onmessage = (e) => {
        if (typeof e.data !== "string") return;
        let msg: any; try { msg = JSON.parse(e.data); } catch { return; }
        if (msg.type === "gps_data" && msg.data) {
          const g = { lat: msg.data.latitude, lon: msg.data.longitude };
          gpsRef.current = g;
          setLiveGps(g);
        }
      };
      ws.onclose = () => { if (!stop) retry = setTimeout(connect, 2000); };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => { stop = true; clearTimeout(retry); gpsWsRef.current?.close(); };
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────
  const capture = () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) { setError("Not connected to bridge"); return; }
    if (camIdRef.current == null)                { setError("Camera not selected yet"); return; }
    if (mode === "sweep" && sweepFrames.length >= MAX_FRAMES) { setError(`Max ${MAX_FRAMES} frames`); return; }
    setError(null); setCapturing(true);
    ws.send(JSON.stringify({ type: "capture" }));
  };

  const runStitch = async () => {
    if (sweepFrames.length < 2) { setError("Need at least 2 frames to stitch"); return; }
    setStitching(true); setError(null);
    try {
      const result = await stitchByHeading(sweepFrames);
      // Use GPS from the center frame (closest to the middle bearing)
      const centerFrame = sweepFrames.reduce((best, f) => {
        const da = Math.abs(((f.bearing - result.bearing + 540) % 360) - 180);
        const db = Math.abs(((best.bearing - result.bearing + 540) % 360) - 180);
        return da < db ? f : best;
      });
      setSweepPano({ ...result, gps: centerFrame.gps });
    }
    catch { setError("Stitching failed — check frame headings"); }
    finally { setStitching(false); }
  };

  const clearSweep  = () => { setSweepFrames([]); setSweepPano(null); };
  const resetSingle = () => setSinglePano(null);

  const download = () => {
    if (!activePano) return;
    const a      = document.createElement("a");
    a.href       = activePano.dataUrl;
    a.download   = `panorama_${new Date().toISOString().replace(/[:.]/g, "_")}.jpg`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const imageWidthM = activePano
    ? Math.round(2 * distanceM * Math.tan((activePano.fovDeg * Math.PI) / 360))
    : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full w-full overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-2xl font-bold">Panorama</h2>
          <span className="flex items-center gap-1.5 text-xs text-gray-300 bg-gray-700 px-2 py-0.5 rounded-full">
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
            {connected ? camLabel : "Disconnected"}
          </span>
          {activePano && (
            <span className="text-xs text-amber-300 bg-amber-900/40 border border-amber-700 px-2 py-0.5 rounded-full">
              {Math.round(activePano.bearing)}° {bearingToCardinal(activePano.bearing)} · {Math.round(activePano.fovDeg)}° FOV
              {imageWidthM !== null && ` · ~${imageWidthM} m wide`}
            </span>
          )}
          {capturing && (
            <span className="text-xs text-cyan-300 bg-cyan-900/40 border border-cyan-700 px-2 py-0.5 rounded-full animate-pulse">
              Capturing…
            </span>
          )}
          {stitching && (
            <span className="text-xs text-cyan-300 bg-cyan-900/40 border border-cyan-700 px-2 py-0.5 rounded-full animate-pulse">
              Stitching…
            </span>
          )}
          {error && (
            <span className="text-xs text-red-300 bg-red-900/40 border border-red-700 px-2 py-0.5 rounded-full">
              {error}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {activePano && (
            <button onClick={download}
              className="text-xs font-semibold text-white bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg transition">
              Download
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-row flex-1 min-h-0 gap-3">

        {/* ── Image area ── */}
        <div className="flex-1 min-w-0 bg-black rounded-2xl overflow-hidden border border-gray-700 relative flex items-center justify-center">
          {activePano ? (
            <>
              <img ref={imgCallbackRef} src={activePano.dataUrl} alt="Panorama"
                className="max-w-full max-h-full object-contain" />
              <CompassRose yaw={activePano.yaw} frozen />
              <ScaleBar distanceM={distanceM} fovDeg={activePano.fovDeg} imgEl={imgEl} />
              {/* GPS overlay — frozen at capture time */}
              <div className="absolute top-2 left-2 pointer-events-none select-none">
                <div className="bg-black/65 backdrop-blur-sm rounded-lg px-2.5 py-2 font-mono">
                  {activePano.gps ? (
                    <>
                      <p className="text-[10px] text-green-400 font-bold mb-1 tracking-widest">GPS</p>
                      <p className="text-xs text-white leading-tight">{activePano.gps.lat.toFixed(7)}°</p>
                      <p className="text-xs text-white leading-tight">{activePano.gps.lon.toFixed(7)}°</p>
                    </>
                  ) : (
                    <p className="text-[10px] text-gray-500">No GPS</p>
                  )}
                </div>
              </div>
            </>
          ) : liveFrame ? (
            <>
              <img src={liveFrame} alt="Live feed" className="max-w-full max-h-full object-contain" />
              <CompassRose yaw={liveYaw} frozen={false} />
              {/* Live GPS indicator */}
              <div className="absolute top-2 left-2 pointer-events-none select-none">
                <div className="bg-black/65 backdrop-blur-sm rounded-lg px-2.5 py-2 font-mono">
                  {liveGps ? (
                    <>
                      <p className="text-[10px] text-green-400 font-bold mb-1 tracking-widest animate-pulse">● GPS LIVE</p>
                      <p className="text-xs text-white leading-tight">{liveGps.lat.toFixed(7)}°</p>
                      <p className="text-xs text-white leading-tight">{liveGps.lon.toFixed(7)}°</p>
                    </>
                  ) : (
                    <p className="text-[10px] text-gray-500 tracking-widest">GPS —</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="text-gray-500 text-sm">{connected ? "Waiting for frames…" : "Disconnected"}</p>
          )}
        </div>

        {/* ── Control panel ── */}
        <div className="w-64 flex-shrink-0 flex flex-col bg-gray-900 rounded-2xl border border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700 flex-shrink-0">
            <p className="text-xs font-bold text-amber-400 tracking-widest">PANORAMA</p>
            <p className="text-xs text-gray-500 mt-0.5">Quantum Robotics · URC 2026</p>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">

            {/* Mode */}
            <div className="pt-3">
              <p className="text-xs text-gray-500 font-bold tracking-widest mb-2">MODE</p>
              <div className="flex gap-1">
                {(["single", "sweep"] as const).map(m => (
                  <button key={m} onClick={() => { setMode(m); setError(null); }}
                    className={`flex-1 text-xs px-2 py-2 rounded-lg transition font-medium ${
                      mode === m ? "bg-amber-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                    }`}>
                    {m === "single" ? "Single" : "Multi-Sweep"}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                {mode === "single"
                  ? "One stereo frame · ~130° FOV"
                  : "Rotate rover, add frames · up to 360°"}
              </p>
            </div>

            {/* Scale distance */}
            <div>
              <p className="text-xs text-gray-500 font-bold tracking-widest mb-2">SCALE</p>
              <div className="bg-gray-800 rounded-lg px-3 py-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-gray-400">Est. Distance</span>
                  <span className="text-xs text-amber-400 font-bold">{distanceM} m</span>
                </div>
                <input type="range" min={1} max={500} step={1} value={distanceM}
                  onChange={e => setDistanceM(Number(e.target.value))}
                  className="w-full accent-amber-500 h-1 cursor-pointer" />
                {imageWidthM !== null && (
                  <p className="text-xs text-gray-600 mt-1">Frame width ≈ {imageWidthM} m</p>
                )}
              </div>
            </div>

            {/* GPS status */}
            <div>
              <p className="text-xs text-gray-500 font-bold tracking-widest mb-2">GPS</p>
              <div className="bg-gray-800 rounded-lg px-3 py-2 font-mono">
                {liveGps ? (
                  <>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-[10px] text-green-400 font-bold tracking-widest">LIVE</span>
                    </div>
                    <p className="text-xs text-gray-300">{liveGps.lat.toFixed(7)}°</p>
                    <p className="text-xs text-gray-300">{liveGps.lon.toFixed(7)}°</p>
                  </>
                ) : (
                  <p className="text-xs text-gray-600">Sin señal GPS</p>
                )}
                {activePano?.gps && (
                  <div className="mt-2 pt-2 border-t border-gray-700">
                    <p className="text-[10px] text-amber-400 font-bold tracking-widest mb-1">CAPTURADO</p>
                    <p className="text-xs text-gray-300">{activePano.gps.lat.toFixed(7)}°</p>
                    <p className="text-xs text-gray-300">{activePano.gps.lon.toFixed(7)}°</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Single mode ── */}
            {mode === "single" && (
              <div>
                <p className="text-xs text-gray-500 font-bold tracking-widest mb-2">CAPTURE</p>
                <button onClick={capture} disabled={!connected || capturing}
                  className={`w-full text-xs font-semibold px-4 py-2.5 rounded-lg transition mb-2 ${
                    !connected || capturing
                      ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                      : "bg-amber-600 hover:bg-amber-500 text-white"
                  }`}>
                  {capturing ? "Capturing…" : "Capture Panorama"}
                </button>
                {singlePano && (
                  <button onClick={resetSingle}
                    className="w-full text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg transition">
                    ↺ New Capture
                  </button>
                )}
              </div>
            )}

            {/* ── Sweep mode ── */}
            {mode === "sweep" && (
              <div>
                <p className="text-xs text-gray-500 font-bold tracking-widest mb-2">
                  SWEEP FRAMES — {sweepFrames.length}/{MAX_FRAMES}
                </p>

                <button onClick={capture}
                  disabled={!connected || capturing || sweepFrames.length >= MAX_FRAMES}
                  className={`w-full text-xs font-semibold px-4 py-2.5 rounded-lg transition mb-2 ${
                    !connected || capturing || sweepFrames.length >= MAX_FRAMES
                      ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                      : "bg-amber-600 hover:bg-amber-500 text-white"
                  }`}>
                  {capturing ? "Capturing…" : "+ Add Frame"}
                </button>

                {/* Frame thumbnails */}
                {sweepFrames.length > 0 && (
                  <div className="space-y-1 mb-2 max-h-48 overflow-y-auto pr-1">
                    {sweepFrames.map((f, i) => (
                      <div key={f.takenAt}
                        className="flex items-center gap-2 bg-gray-800 rounded-lg p-1.5">
                        <img src={f.src} alt={`frame ${i + 1}`}
                          className="w-12 h-8 object-cover rounded flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-200 font-bold leading-none">
                            {Math.round(f.bearing)}°
                          </p>
                          <p className="text-xs text-gray-500">
                            {bearingToCardinal(f.bearing)}
                          </p>
                        </div>
                        <button onClick={() => setSweepFrames(prev => prev.filter((_, j) => j !== i))}
                          className="text-gray-600 hover:text-red-400 transition text-sm leading-none px-1 flex-shrink-0">
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {sweepFrames.length >= 2 && (
                  <button onClick={runStitch} disabled={stitching}
                    className={`w-full text-xs font-semibold px-4 py-2.5 rounded-lg transition mb-1 ${
                      stitching
                        ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                        : "bg-cyan-700 hover:bg-cyan-600 text-white"
                    }`}>
                    {stitching ? "Stitching…" : `Stitch ${sweepFrames.length} Frames`}
                  </button>
                )}

                {sweepFrames.length > 0 && (
                  <button onClick={clearSweep}
                    className="w-full text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 py-2 rounded-lg transition">
                    ✕ Clear All
                  </button>
                )}

                {sweepFrames.length === 0 && (
                  <p className="text-xs text-gray-600 text-center mt-2 leading-relaxed">
                    Point rover, add a frame. Rotate ~60°, add another. Repeat, then stitch.
                  </p>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default PanoramaView;
