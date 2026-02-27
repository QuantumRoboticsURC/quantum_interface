import { useState, useEffect, useRef, useCallback } from "react";
import {
  Chart as ChartJS, LineElement, PointElement, LinearScale, Title, Tooltip, Legend,
} from "chart.js";
import Arm3D from "../components/Arm3D";
ChartJS.register(LineElement, PointElement, LinearScale, Title, Tooltip, Legend);

type Angles = { q1: number; q2: number; q3: number; q4: number; q5: number };
type Position = {
  x: number; y: number; z: number; roll: number; pitch: number;
  joint8: number; joint9: number; joint10: number; joint11: number;
};
type CameraInfo = { id: number; label: string };

const limits = { camera: [0, 180] };
const l1 = 0.1, l2 = 0.43, l3 = 0.43, l4 = 0.213;

const QUALITY_PRESETS = [
  { label: "Low", value: 15 },
  { label: "Med", value: 40 },
  { label: "High", value: 70 },
  { label: "Max", value: 95 },
];

export default function Arm() {
  const [angles, setAngles] = useState<Angles>({ q1: 0, q2: 190, q3: -140, q4: -50, q5: 0 });
  const [pos, setPos] = useState<Position>({
    x: 0.15, y: 0, z: 0.35, roll: 0, pitch: 0, joint8: 80, joint9: 45, joint10: 90, joint11: 90,
  });

  const [remoteControl, setRemoteControl] = useState(false);
  const [relativeMode, setRelativeMode] = useState(false); // NEW: move relative to arm orientation
  const wsRef = useRef<WebSocket | null>(null);
  const updatingFromWS = useRef(false);

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

  // --- Control WebSocket ---
  useEffect(() => {
    const wsUrl =
      `${window.location.protocol === "https:" ? "wss" : "ws"}://` +
      `${window.location.hostname}:8000/ws/connection/move`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => console.log("🛰️ Control WS connected");
    ws.onclose = () => console.log("🔴 Control WS closed");
    ws.onerror = (e) => console.warn("Control WS error:", e);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (remoteControl && msg?.type === "pose" && msg?.data) {
          const { x, y, z, roll, pitch } = msg.data;
          const nf = (v: any, fb: number) => Number.isFinite(Number(v)) ? Number(v) : fb;
          updatingFromWS.current = true;
          setPos((p) => ({
            ...p, x: nf(x, p.x), y: nf(y, p.y), z: nf(z, p.z),
            roll: nf(roll, p.roll), pitch: nf(pitch, p.pitch),
          }));
          queueMicrotask(() => { updatingFromWS.current = false; });
        }
      } catch (err) { console.warn("WS parse error:", err); }
    };
    return () => ws.close();
  }, [remoteControl]);

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
    ws.onerror = (e) => console.warn("Camera WS error:", e);
    ws.onmessage = (e) => {
      if (typeof e.data === "string") {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "frame" && msg.data) {
            setCameraFrame(`data:image/jpeg;base64,${msg.data}`);
            fpsCounterRef.current++;
          } else if (msg.type === "cameras" && Array.isArray(msg.data)) {
            console.log("📷 Available cameras:", msg.data);
            setAvailableCameras(msg.data);
            setCameraIndex((prev) => prev < msg.data.length ? prev : 0);
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

  const cycleCamera = (direction: number) => {
    if (availableCameras.length <= 1) return;
    setCameraIndex((prev) => (prev + direction + availableCameras.length) % availableCameras.length);
  };

  const refreshCameras = () => {
    const ws = cameraWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "get_cameras" }));
    }
  };

  const sendWS = useCallback((payload: any) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }, []);

  const radToDeg = (r: number) => (r * 180) / Math.PI;
  const deg2rad = (d: number) => (d * Math.PI) / 180;

  function inverseKinematics(x: number, y: number, z: number, roll: number, pitch: number) {
    const q1 = Math.atan2(y, x);
    const q5 = roll;
    const a = Math.sqrt(x ** 2 + y ** 2) - l4 * Math.cos(pitch);
    const b = z - l4 * Math.sin(pitch) - l1;
    let d = (a ** 2 + b ** 2 - l2 ** 2 - l3 ** 2) / (2 * l2 * l3);
    d = Math.max(-1, Math.min(1, d));
    const q3 = -Math.atan2(Math.sqrt(1 - d ** 2), d);
    const q2 = Math.atan2(b, a) - Math.atan2(l3 * Math.sin(q3), l2 + l3 * Math.cos(q3));
    const q4 = pitch - q2 - q3;
    return { q1: radToDeg(q1), q2: radToDeg(q2), q3: radToDeg(q3), q4: radToDeg(q4), q5: radToDeg(q5) };
  }

  useEffect(() => {
    const { x, y, z, roll, pitch } = pos;
    setAngles(inverseKinematics(x, y, z, deg2rad(roll), deg2rad(pitch)));
  }, [pos]);

  useEffect(() => { sendWS({ type: "joint_angles", data: angles }); }, [angles, sendWS]);

  const poseTimer = useRef<number | null>(null);
  useEffect(() => {
    if (updatingFromWS.current) return;
    const { x, y, z, roll, pitch } = pos;
    if (poseTimer.current) clearTimeout(poseTimer.current);
    poseTimer.current = window.setTimeout(() => {
      sendWS({ type: "pose", data: { x, y, z, roll, pitch } });
    }, 40);
    return () => { if (poseTimer.current) clearTimeout(poseTimer.current); };
  }, [pos.x, pos.y, pos.z, pos.roll, pos.pitch, sendWS]);

  const moveCamera = (delta: number) => {
    setPos((p) => {
      const next = Math.max(limits.camera[0], Math.min(limits.camera[1], p.joint8 + delta));
      sendWS({ type: "camera", data: next });
      return { ...p, joint8: next };
    });
  };

  const moveCamera2 = (delta: number) => {
    setPos((p) => {
      const next = Math.max(limits.camera[0], Math.min(limits.camera[1], p.joint9 + delta));
      sendWS({ type: "camera2", data: next });
      return { ...p, joint9: next };
    });
  };

  const moveCamera3 = (delta: number) => {
    setPos((p) => {
      const next = Math.max(limits.camera[0], Math.min(limits.camera[1], p.joint10 + delta));
      sendWS({ type: "camera3", data: next });
      return { ...p, joint10: next };
    });
  };

  const moveCamera4 = (delta: number) => {
    setPos((p) => {
      const next = Math.max(limits.camera[0], Math.min(limits.camera[1], p.joint11 + delta));
      sendWS({ type: "camera4", data: next });
      return { ...p, joint11: next };
    });
  };

  /**
   * Adjust position value.
   * In relative mode, X and Y deltas are rotated by q1 angle so movement
   * is relative to the arm's current orientation:
   *   "x+" = forward (away from base along arm direction)
   *   "y+" = left (perpendicular to arm direction)
   */
  const adjustValue = (key: keyof Position, delta: number) => {
    setPos((p) => {
      if (relativeMode && (key === "x" || key === "y")) {
        const q1Rad = deg2rad(angles.q1);
        const cosQ1 = Math.cos(q1Rad);
        const sinQ1 = Math.sin(q1Rad);

        // Build local delta: dx = forward/back, dy = left/right
        const localDx = key === "x" ? delta : 0;
        const localDy = key === "y" ? delta : 0;

        // Rotate to world frame
        const worldDx = localDx * cosQ1 - localDy * sinQ1;
        const worldDy = localDx * sinQ1 + localDy * cosQ1;

        return {
          ...p,
          x: +(p.x + worldDx).toFixed(4),
          y: +(p.y + worldDy).toFixed(4),
        };
      }
      // Normal (absolute) mode
      return { ...p, [key]: +(p[key] + delta).toFixed(3) };
    });
  };

  const setPreset = (preset: string) => {
    const next: Position = { ...pos };
    switch (preset) {
      case "HOME": Object.assign(next, { x: 0.15, y: 0, z: 0.35, roll: 0, pitch: 0 }); break;
      case "INTERMEDIATE": Object.assign(next, { x: 0.2, y: 0, z: 0.6, roll: 0, pitch: 0 }); break;
      case "PREFLOOR": Object.assign(next, { x: 0.25, y: 0, z: 0.35, roll: 0, pitch: -75 }); break;
      case "FLOOR": Object.assign(next, { x: 0.35, y: 0, z: 0.1, roll: 0, pitch: -75 }); break;
      case "STORAGE": Object.assign(next, { x: 0, y: 0, z: 0.55, roll: 0, pitch: 100 }); break;
    }
    setPos(next);
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* ========== TOP ROW: Camera + 3D side by side ========== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3" style={{ height: "55vh", minHeight: "280px" }}>

        {/* Camera */}
        <div className="bg-gray-800 rounded-2xl shadow-lg border border-gray-700 flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 flex-shrink-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold">Camera</h2>
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
                  <span>{cameraConnected ? "Waiting for frames..." : "Disconnected"}</span>
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
                  ${availableCameras.length > 1
                    ? "bg-black/50 hover:bg-black/70" : "bg-black/20 text-white/30 cursor-not-allowed"}`}
                disabled={availableCameras.length <= 1}>◀</button>
              <button onClick={() => cycleCamera(1)}
                className={`absolute right-2 top-1/2 -translate-y-1/2 backdrop-blur-sm
                  w-8 h-8 rounded-full flex items-center justify-center text-white text-sm transition
                  ${availableCameras.length > 1
                    ? "bg-black/50 hover:bg-black/70" : "bg-black/20 text-white/30 cursor-not-allowed"}`}
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

        {/* 3D */}
        <div className="bg-gray-800 rounded-2xl shadow-lg border border-gray-700 flex flex-col min-h-0 overflow-hidden">
          <div className="px-3 py-1.5 flex-shrink-0">
            <span className="text-sm font-bold">3D Preview</span>
          </div>
          <div className="flex-1 px-2 pb-2 min-h-0 overflow-hidden">
            <Arm3D q1={angles.q1} q2={angles.q2} q3={angles.q3} q4={angles.q4} />
          </div>
        </div>
      </div>

      {/* ========== BOTTOM ROW: Controls ========== */}
      <div className="flex-1 bg-gray-800 rounded-2xl shadow-lg border border-gray-700 p-4 min-h-0 overflow-y-auto">

        {/* Header + presets */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold">Arm Control</h2>
          <div className="flex gap-2">
            <button onClick={() => setRelativeMode((v) => !v)}
              className={`px-2.5 py-1 rounded-lg font-semibold transition text-xs
                ${relativeMode ? "bg-purple-600 hover:bg-purple-500" : "bg-gray-600 hover:bg-gray-500"}`}
              title="When ON, X/Y movement is relative to the arm's current orientation (q1 angle)">
              Relative: {relativeMode ? "ON" : "OFF"}
            </button>
            <button onClick={() => setRemoteControl((v) => !v)}
              className={`px-2.5 py-1 rounded-lg font-semibold transition text-xs
                ${remoteControl ? "bg-green-600 hover:bg-green-500" : "bg-gray-600 hover:bg-gray-500"}`}>
              Joystick: {remoteControl ? "ON" : "OFF"}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {["HOME", "INTERMEDIATE", "PREFLOOR", "FLOOR", "STORAGE"].map((p) => (
            <button key={p} onClick={() => setPreset(p)}
              className="px-2.5 py-1 rounded-lg shadow font-semibold transition text-[11px] bg-cyan-600 hover:bg-cyan-500">
              {p}
            </button>
          ))}
        </div>

        {/* Controls grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* IK */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Inverse Kinematics</h3>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${remoteControl ? "bg-green-700 text-green-100" : "bg-gray-700 text-gray-200"}`}>
                {remoteControl ? "JOY" : "UI"}
              </span>
              {relativeMode && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-700 text-purple-100">
                  REL
                </span>
              )}
            </div>
            {(["x", "y", "z", "roll", "pitch"] as (keyof Position)[]).map((axis) => (
              <div key={axis} className="flex items-center gap-1.5 mb-1">
                <label className={`w-10 capitalize text-xs font-mono ${
                  relativeMode && (axis === "x" || axis === "y") ? "text-purple-400" : "text-gray-400"
                }`}>
                  {relativeMode && axis === "x" ? "fwd" : relativeMode && axis === "y" ? "lat" : axis}
                </label>
                <input type="number" step={axis === "roll" || axis === "pitch" ? 1 : 0.01}
                  className="bg-gray-700 text-white px-1.5 py-0.5 w-20 rounded text-xs font-mono"
                  value={pos[axis]}
                  onChange={(e) => setPos({ ...pos, [axis]: parseFloat(e.target.value) || 0 })} />
                <button className={`px-1.5 py-0.5 rounded text-xs transition ${
                  relativeMode && (axis === "x" || axis === "y")
                    ? "bg-purple-600 hover:bg-purple-500" : "bg-blue-600 hover:bg-blue-500"
                }`}
                  onClick={() => adjustValue(axis, 0.05)}>+</button>
                <button className="bg-gray-600 px-1.5 py-0.5 rounded text-xs hover:bg-gray-500 transition"
                  onClick={() => adjustValue(axis, -0.05)}>−</button>
              </div>
            ))}
          </div>

          {/* Gripper + Linear */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Gripper</h3>
            <div className="flex gap-2 mb-4">
              <button className="flex-1 bg-blue-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-500 transition select-none"
                onMouseDown={() => sendWS({ type: "gripper", data: -1 })}
                onMouseUp={() => sendWS({ type: "gripper", data: 0 })}
                onPointerDown={() => sendWS({ type: "gripper", data: -1 })}
                onPointerUp={() => sendWS({ type: "gripper", data: 0 })}
                onMouseLeave={() => sendWS({ type: "gripper", data: 0 })}>Close</button>
              <button className="flex-1 bg-cyan-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-cyan-500 transition select-none"
                onMouseDown={() => sendWS({ type: "gripper", data: 1 })}
                onMouseUp={() => sendWS({ type: "gripper", data: 0 })}
                onPointerDown={() => sendWS({ type: "gripper", data: 1 })}
                onPointerUp={() => sendWS({ type: "gripper", data: 0 })}
                onMouseLeave={() => sendWS({ type: "gripper", data: 0 })}>Open</button>
            </div>

            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Linear Actuator</h3>
            <div className="flex gap-2">
              <button className="flex-1 bg-blue-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-500 transition select-none"
                onMouseDown={() => sendWS({ type: "linear_actuator", data: 1 })}
                onMouseUp={() => sendWS({ type: "linear_actuator", data: 0 })}
                onPointerDown={() => sendWS({ type: "linear_actuator", data: 1 })}
                onPointerUp={() => sendWS({ type: "linear_actuator", data: 0 })}
                onMouseLeave={() => sendWS({ type: "linear_actuator", data: 0 })}>Extend</button>
              <button className="flex-1 bg-gray-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-500 transition select-none"
                onMouseDown={() => sendWS({ type: "linear_actuator", data: -1 })}
                onMouseUp={() => sendWS({ type: "linear_actuator", data: 0 })}
                onPointerDown={() => sendWS({ type: "linear_actuator", data: -1 })}
                onPointerUp={() => sendWS({ type: "linear_actuator", data: 0 })}
                onMouseLeave={() => sendWS({ type: "linear_actuator", data: 0 })}>Retract</button>
            </div>
          </div>

          {/* Camera Servos */}
          <div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
                Camera Servo 1 — {pos.joint8}°
              </h3>
              <div className="flex gap-2 mb-1.5">
                <button className="flex-1 bg-blue-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-500 transition"
                  onClick={() => moveCamera(5)}>+5°</button>
                <button className="flex-1 bg-gray-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-500 transition"
                  onClick={() => moveCamera(-5)}>−5°</button>
              </div>
              <input type="range" min={limits.camera[0]} max={limits.camera[1]} value={pos.joint8}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  setPos((p) => ({ ...p, joint8: v }));
                  sendWS({ type: "camera", data: v });
                }}
                className="w-full accent-cyan-500 h-1" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
                Camera Servo 2 — {pos.joint9}°
              </h3>
              <div className="flex gap-2 mb-1.5">
                <button className="flex-1 bg-blue-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-500 transition"
                  onClick={() => moveCamera2(5)}>+5°</button>
                <button className="flex-1 bg-gray-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-500 transition"
                  onClick={() => moveCamera2(-5)}>−5°</button>
              </div>
              <input type="range" min={limits.camera[0]} max={limits.camera[1]} value={pos.joint9}
                onChange={(e) => {
                  const v2 = parseInt(e.target.value);
                  setPos((p) => ({ ...p, joint9: v2 }));
                  sendWS({ type: "camera2", data: v2 });
                }}
                className="w-full accent-cyan-500 h-1" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
                Camera Servo 3 — {pos.joint10}°
              </h3>
              <div className="flex gap-2 mb-1.5">
                <button className="flex-1 bg-blue-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-500 transition"
                  onClick={() => moveCamera3(5)}>+5°</button>
                <button className="flex-1 bg-gray-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-500 transition"
                  onClick={() => moveCamera3(-5)}>−5°</button>
              </div>
              <input type="range" min={limits.camera[0]} max={limits.camera[1]} value={pos.joint10}
                onChange={(e) => {
                  const v2 = parseInt(e.target.value);
                  setPos((p) => ({ ...p, joint10: v2 }));
                  sendWS({ type: "camera3", data: v2 });
                }}
                className="w-full accent-cyan-500 h-1" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
                Camera Servo 4 — {pos.joint11}°
              </h3>
              <div className="flex gap-2 mb-1.5">
                <button className="flex-1 bg-blue-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-500 transition"
                  onClick={() => moveCamera4(5)}>+5°</button>
                <button className="flex-1 bg-gray-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-500 transition"
                  onClick={() => moveCamera4(-5)}>−5°</button>
              </div>
              <input type="range" min={limits.camera[0]} max={limits.camera[1]} value={pos.joint11}
                onChange={(e) => {
                  const v2 = parseInt(e.target.value);
                  setPos((p) => ({ ...p, joint11: v2 }));
                  sendWS({ type: "camera4", data: v2 });
                }}
                className="w-full accent-cyan-500 h-1" />
            </div>
          </div>

          {/* Joints + Status */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Joints (°)</h3>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs font-mono">
              {Object.entries(angles).map(([k, v]) => (
                <span key={k}>{k}: <span className="text-cyan-400">{v.toFixed(1)}</span></span>
              ))}
              <span>cam: <span className="text-cyan-400">{pos.joint8}</span></span>
              <span>cam2: <span className="text-cyan-400">{pos.joint9}</span></span>
              <span>cam3: <span className="text-cyan-400">{pos.joint10}</span></span>
              <span>cam4: <span className="text-cyan-400">{pos.joint11}</span></span>
            </div>

            <div className="flex items-center gap-3 text-[10px] text-gray-500 mt-3">
              <div className="flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${cameraConnected ? "bg-green-400" : "bg-red-400"}`} />
                Cam
              </div>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                Control
              </div>
              {activeCamera && <span>📷 {activeCamera.label}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}