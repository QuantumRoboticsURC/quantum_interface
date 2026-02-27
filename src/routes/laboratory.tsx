import React, { useState, useEffect, useRef, useCallback } from "react";
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

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

type GasData = {
  key: string;
  label: string;
  unit: string;
  color: string;
  bgColor: string;
  values: number[];
  current: number;
};

type CameraInfo = { id: number; label: string };

const MAX_POINTS = 60;

const INITIAL_GASES: GasData[] = [
  { key: "co2", label: "CO₂", unit: "ppm", color: "#f59e0b", bgColor: "rgba(245,158,11,0.15)", values: [], current: 0 },
  { key: "nh3", label: "NH₃", unit: "ppm", color: "#ef4444", bgColor: "rgba(239,68,68,0.15)", values: [], current: 0 },
  { key: "alcohol", label: "Alcohol", unit: "ppm", color: "#8b5cf6", bgColor: "rgba(139,92,246,0.15)", values: [], current: 0 },
  { key: "benzene", label: "Benzene", unit: "ppm", color: "#10b981", bgColor: "rgba(16,185,129,0.15)", values: [], current: 0 },
];

const QUALITY_PRESETS = [
  { label: "Low", value: 15 },
  { label: "Med", value: 40 },
  { label: "High", value: 70 },
  { label: "Max", value: 95 },
];

// ---------------------------------------------------------------
// Gas Chart
// ---------------------------------------------------------------

function GasChart({ gas }: { gas: GasData }) {
  const labels = gas.values.map((_, i) => {
    const secsAgo = gas.values.length - 1 - i;
    return secsAgo === 0 ? "now" : `-${secsAgo}s`;
  });
  const sparseLabels = labels.map((l, i) =>
    i % 10 === 0 || i === labels.length - 1 ? l : ""
  );

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-3 flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: gas.color }} />
          <span className="text-xs font-bold">{gas.label}</span>
        </div>
        <span className="text-sm font-mono font-bold" style={{ color: gas.color }}>
          {gas.current.toFixed(1)} <span className="text-[10px] text-gray-400">{gas.unit}</span>
        </span>
      </div>
      <div className="flex-1 min-h-[100px]">
        <Line
          data={{
            labels: sparseLabels,
            datasets: [{
              data: gas.values,
              borderColor: gas.color,
              backgroundColor: gas.bgColor,
              borderWidth: 1.5,
              pointRadius: 0,
              tension: 0.3,
              fill: true,
            }],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            plugins: { legend: { display: false }, tooltip: { enabled: true } },
            scales: {
              x: { ticks: { color: "#6b7280", font: { size: 8 } }, grid: { color: "rgba(107,114,128,0.1)" } },
              y: { ticks: { color: "#6b7280", font: { size: 8 } }, grid: { color: "rgba(107,114,128,0.1)" } },
            },
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Hold Button
// ---------------------------------------------------------------

function HoldButton({
  label, pressValue, onSend, className = "",
}: {
  label: string; pressValue: number; onSend: (v: number) => void; className?: string;
}) {
  return (
    <button
      className={`px-4 py-2 rounded-lg text-xs font-semibold transition select-none ${className}`}
      onMouseDown={() => onSend(pressValue)}
      onMouseUp={() => onSend(0)}
      onPointerDown={() => onSend(pressValue)}
      onPointerUp={() => onSend(0)}
      onMouseLeave={() => onSend(0)}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------
// Laboratory
// ---------------------------------------------------------------

const Laboratory: React.FC = () => {
  const [gases, setGases] = useState<GasData[]>(INITIAL_GASES);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const [servoRight, setServoRight] = useState(90);
  const [servoLeft, setServoLeft] = useState(90);
  const [labCamera, setLabCamera] = useState(90);

  // Camera state
  const [availableCameras, setAvailableCameras] = useState<CameraInfo[]>([]);
  const [cameraIndex, setCameraIndex] = useState(0);
  const [quality, setQuality] = useState(40);
  const [cameraFrame, setCameraFrame] = useState<string | null>(null);
  const [cameraConnected, setCameraConnected] = useState(false);
  const [fps, setFps] = useState(0);
  const cameraWsRef = useRef<WebSocket | null>(null);
  const fpsCounterRef = useRef(0);
  const fpsTimerRef = useRef<number | null>(null);

  const activeCamera = availableCameras.length > 0 ? availableCameras[cameraIndex] : null;

  // --- Lab WebSocket ---
  useEffect(() => {
    const wsUrl =
      `${window.location.protocol === "https:" ? "wss" : "ws"}://` +
      `${window.location.hostname}:8000/ws/connection/lab`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => { setConnected(true); };
    ws.onclose = () => { setConnected(false); };
    ws.onerror = (e) => console.warn("Lab WS error:", e);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        // { type: "gas_data", data: { co2: N, nh3: N, alcohol: N, benzene: N } }
        if (msg.type === "gas_data" && msg.data) {
          setGases((prev) =>
            prev.map((g) => {
              const newVal = msg.data[g.key] ?? g.current;
              const newValues = [...g.values, newVal];
              if (newValues.length > MAX_POINTS) newValues.shift();
              return { ...g, current: newVal, values: newValues };
            })
          );
        }
      } catch { /* ignore */ }
    };
    return () => ws.close();
  }, []);

  // --- Camera WebSocket ---
  useEffect(() => {
    const wsUrl =
      `${window.location.protocol === "https:" ? "wss" : "ws"}://` +
      `192.168.0.102:8000/ws/connection/camera`;
    const ws = new WebSocket(wsUrl);
    cameraWsRef.current = ws;
    ws.onopen = () => {
      setCameraConnected(true);
      ws.send(JSON.stringify({ type: "get_cameras" }));
    };
    ws.onclose = () => { setCameraConnected(false); setCameraFrame(null); };
    ws.onerror = () => setCameraConnected(false);
    ws.onmessage = (e) => {
      if (typeof e.data === "string") {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "frame" && msg.data) {
            setCameraFrame(`data:image/jpeg;base64,${msg.data}`);
            fpsCounterRef.current++;
          } else if (msg.type === "cameras" && Array.isArray(msg.data)) {
            setAvailableCameras(msg.data);
            setCameraIndex((prev) => (prev < msg.data.length ? prev : 0));
          }
        } catch { /* ignore */ }
      } else if (e.data instanceof Blob) {
        setCameraFrame(URL.createObjectURL(e.data));
        fpsCounterRef.current++;
      }
    };
    fpsTimerRef.current = window.setInterval(() => {
      setFps(fpsCounterRef.current); fpsCounterRef.current = 0;
    }, 1000);
    return () => { ws.close(); if (fpsTimerRef.current) clearInterval(fpsTimerRef.current); };
  }, []);

  useEffect(() => {
    const ws = cameraWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && activeCamera) {
      ws.send(JSON.stringify({ type: "config", camera_id: activeCamera.id, quality }));
    }
  }, [activeCamera?.id, quality]);

  const cycleCamera = (dir: number) => {
    if (availableCameras.length <= 1) return;
    setCameraIndex((p) => (p + dir + availableCameras.length) % availableCameras.length);
  };

  const refreshCameras = () => {
    const ws = cameraWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "get_cameras" }));
  };

  const sendWS = useCallback((payload: any) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }, []);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Laboratory</h2>
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
            <span className="text-xs text-gray-400">{connected ? "Connected" : "Disconnected"}</span>
          </div>
        </div>
      </div>

      {/* Main: 3 columns — Charts | Camera | Controls */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_1fr_340px] gap-3 min-h-0 overflow-hidden">

        {/* ======== COL 1: Gas Charts 2x2 ======== */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 min-h-0 overflow-auto">
          {gases.map((gas) => (
            <GasChart key={gas.key} gas={gas} />
          ))}
        </div>

        {/* ======== COL 2: Camera ======== */}
        <div className="bg-gray-800 rounded-2xl shadow-lg border border-gray-700 flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 flex-shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold">Camera</h3>
              <div className={`w-2 h-2 rounded-full ${cameraConnected ? "bg-green-400" : "bg-red-400"}`} />
              <span className="text-[11px] text-gray-400">{fps} FPS</span>
            </div>
            <div className="flex items-center gap-1">
              {QUALITY_PRESETS.map((q) => (
                <button key={q.value} onClick={() => setQuality(q.value)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition
                    ${quality === q.value ? "bg-amber-600 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}>
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 px-2 min-h-0 overflow-hidden">
            <div className="relative w-full h-full bg-black rounded-xl overflow-hidden flex items-center justify-center">
              {cameraFrame ? (
                <img src={cameraFrame} alt="Camera feed" className="max-w-full max-h-full object-contain" />
              ) : (
                <div className="text-gray-500 text-sm flex flex-col items-center gap-2">
                  <span className="text-3xl">📷</span>
                  <span>{cameraConnected ? "Waiting..." : "Disconnected"}</span>
                </div>
              )}

              {activeCamera && (
                <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-md px-2 py-1 text-xs text-white font-semibold">
                  {activeCamera.label}
                </div>
              )}

              <button onClick={() => cycleCamera(-1)}
                className={`absolute left-2 top-1/2 -translate-y-1/2 backdrop-blur-sm
                  w-8 h-8 rounded-full flex items-center justify-center text-white text-sm transition
                  ${availableCameras.length > 1 ? "bg-black/50 hover:bg-black/70" : "bg-black/20 text-white/30 cursor-not-allowed"}`}
                disabled={availableCameras.length <= 1}>◀</button>
              <button onClick={() => cycleCamera(1)}
                className={`absolute right-2 top-1/2 -translate-y-1/2 backdrop-blur-sm
                  w-8 h-8 rounded-full flex items-center justify-center text-white text-sm transition
                  ${availableCameras.length > 1 ? "bg-black/50 hover:bg-black/70" : "bg-black/20 text-white/30 cursor-not-allowed"}`}
                disabled={availableCameras.length <= 1}>▶</button>

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

        {/* ======== COL 3: Controls ======== */}
        <div className="bg-gray-800 rounded-2xl shadow-lg border border-gray-700 p-4 flex flex-col min-h-0 overflow-y-auto">
          <h3 className="text-sm font-bold uppercase tracking-wide text-gray-300 mb-3">Controls</h3>

          {/* Elevator */}
          <div className="mb-4">
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Extraction Elevator</h4>
            <div className="flex gap-2">
              <HoldButton label="▲ Up" pressValue={1}
                onSend={(v) => sendWS({ type: "elevator", data: v })}
                className="flex-1 bg-blue-600 hover:bg-blue-500" />
              <HoldButton label="▼ Down" pressValue={-1}
                onSend={(v) => sendWS({ type: "elevator", data: v })}
                className="flex-1 bg-gray-600 hover:bg-gray-500" />
            </div>
          </div>

          {/* Servo Right */}
          <div className="mb-4">
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
              Servo Right — {servoRight}°
            </h4>
            <input type="range" min={0} max={180} value={servoRight}
              onChange={(e) => { const v = parseInt(e.target.value); setServoRight(v); sendWS({ type: "servo_right", data: v }); }}
              className="w-full accent-cyan-500 h-1.5" />
            <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
              <span>0°</span><span>90°</span><span>180°</span>
            </div>
          </div>

          {/* Servo Left */}
          <div className="mb-4">
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
              Servo Left — {servoLeft}°
            </h4>
            <input type="range" min={0} max={180} value={servoLeft}
              onChange={(e) => { const v = parseInt(e.target.value); setServoLeft(v); sendWS({ type: "servo_left", data: v }); }}
              className="w-full accent-amber-500 h-1.5" />
            <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
              <span>0°</span><span>90°</span><span>180°</span>
            </div>
          </div>

          {/* Gates */}
          <div className="mb-4">
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Left Gate</h4>
            <div className="flex gap-2 mb-3">
              <HoldButton label="Open" pressValue={1}
                onSend={(v) => sendWS({ type: "gate_left", data: v })}
                className="flex-1 bg-blue-600 hover:bg-blue-500" />
              <HoldButton label="Close" pressValue={-1}
                onSend={(v) => sendWS({ type: "gate_left", data: v })}
                className="flex-1 bg-gray-600 hover:bg-gray-500" />
            </div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Right Gate</h4>
            <div className="flex gap-2">
              <HoldButton label="Open" pressValue={1}
                onSend={(v) => sendWS({ type: "gate_right", data: v })}
                className="flex-1 bg-blue-600 hover:bg-blue-500" />
              <HoldButton label="Close" pressValue={-1}
                onSend={(v) => sendWS({ type: "gate_right", data: v })}
                className="flex-1 bg-gray-600 hover:bg-gray-500" />
            </div>
          </div>

          {/* Lab Camera Servo */}
          <div className="mb-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
              Lab Camera — {labCamera}°
            </h4>
            <input type="range" min={0} max={180} value={labCamera}
              onChange={(e) => { const v = parseInt(e.target.value); setLabCamera(v); sendWS({ type: "lab_camera", data: v }); }}
              className="w-full accent-green-500 h-1.5" />
            <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
              <span>0°</span><span>90°</span><span>180°</span>
            </div>
          </div>

          {/* Status */}
          <div className="mt-auto pt-3 border-t border-gray-700">
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <span>R Servo: <span className="text-cyan-400">{servoRight}°</span></span>
              <span>L Servo: <span className="text-amber-400">{servoLeft}°</span></span>
              <span>Camera: <span className="text-green-400">{labCamera}°</span></span>
              <span className="flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
                {connected ? "Online" : "Offline"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Laboratory;