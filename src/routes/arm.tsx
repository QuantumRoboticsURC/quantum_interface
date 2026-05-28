import { useState, useEffect, useRef, useCallback } from "react";
import Arm3D from "../components/Arm3D";

type ArmMode = "idle" | "jog" | "trajectory";
type JogMode = "cartesian" | "relative";

interface ArmState {
  mode: ArmMode;
  jog_mode: JogMode;
  is_executing: boolean;
  pose: { x: number; y: number; z: number; roll: number; pitch: number };
  joints: { q1: number; q2: number; q3: number; q4: number; q5: number };
}

type CameraInfo = { id: number; label: string };

const QUALITY_PRESETS = [
  { label: "Low", value: 15 },
  { label: "Med", value: 40 },
  { label: "High", value: 70 },
  { label: "Max", value: 95 },
];

const PRESETS: Record<string, { x: number; y: number; z: number; roll: number; pitch: number }> = {
  HOME:         { x: 0.15, y: 0,    z: 0.35, roll: 0, pitch: 0   },
  INTERMEDIATE: { x: 0.2,  y: 0,    z: 0.6,  roll: 0, pitch: 0   },
  PREFLOOR:     { x: 0.25, y: 0,    z: 0.35, roll: 0, pitch: -75 },
  FLOOR:        { x: 0.35, y: 0,    z: 0.1,  roll: 0, pitch: -75 },
  STORAGE:      { x: 0,    y: 0,    z: 0.55, roll: 0, pitch: 100 },
};

// Velocidad fija para jog desde botones de UI
const JOG_VEL_LIN = 0.01;
const JOG_VEL_ANG = 0.05;
// Intervalo de envío mientras se mantiene presionado (ms)
const JOG_INTERVAL_MS = 80;

const DEFAULT_ARM_STATE: ArmState = {
  mode: "idle",
  jog_mode: "cartesian",
  is_executing: false,
  pose: { x: 0.15, y: 0, z: 0.35, roll: 0, pitch: 0 },
  joints: { q1: 0, q2: 0, q3: 0, q4: 0, q5: 0 },
};

export default function Arm() {
  const [armState, setArmState] = useState<ArmState>(DEFAULT_ARM_STATE);

  // Pose target local — solo para trajectory delta input
  const [targetDelta, setTargetDelta] = useState({ x: 0, y: 0, z: 0, roll: 0, pitch: 0 });

  // Camera state
  const [availableCameras, setAvailableCameras] = useState<CameraInfo[]>([]);
  const [cameraIndex, setCameraIndex] = useState(0);
  const [quality, setQuality] = useState(40);
  const [cameraFrame, setCameraFrame] = useState<string | null>(null);
  const [cameraConnected, setCameraConnected] = useState(false);
  const [fps, setFps] = useState(0);

  // Camera servo positions (local, no IK)
  const [camServos, setCamServos] = useState({ c1: 80, c2: 45, c3: 90, c4: 90 });

  const wsRef = useRef<WebSocket | null>(null);
  const cameraWsRef = useRef<WebSocket | null>(null);
  const fpsCounterRef = useRef(0);
  const fpsTimerRef = useRef<number | null>(null);
  const jogIntervalRef = useRef<number | null>(null);

  const activeCamera = availableCameras.length > 0 ? availableCameras[cameraIndex] : null;

  // ---------------------------------------------------------------
  // Control WebSocket
  // ---------------------------------------------------------------
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
        if (msg?.type === "arm_state" && msg?.data) {
          setArmState((prev) => ({ ...prev, ...msg.data }));
        }
        // mantener compatibilidad con pose legacy si llega
        if (msg?.type === "pose" && msg?.data) {
          setArmState((prev) => ({ ...prev, pose: msg.data }));
        }
      } catch (err) {
        console.warn("WS parse error:", err);
      }
    };

    return () => ws.close();
  }, []);

  // ---------------------------------------------------------------
  // Camera WebSocket
  // ---------------------------------------------------------------
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
            setAvailableCameras(msg.data);
            setCameraIndex((prev) => (prev < msg.data.length ? prev : 0));
          }
        } catch { }
      } else if (e.data instanceof Blob) {
        setCameraFrame(URL.createObjectURL(e.data));
        fpsCounterRef.current++;
      }
    };

    fpsTimerRef.current = window.setInterval(() => {
      setFps(fpsCounterRef.current);
      fpsCounterRef.current = 0;
    }, 1000);

    return () => {
      ws.close();
      if (fpsTimerRef.current) clearInterval(fpsTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const ws = cameraWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && activeCamera) {
      ws.send(JSON.stringify({ type: "config", camera_id: activeCamera.id, quality }));
    }
  }, [activeCamera?.id, quality]);

  // ---------------------------------------------------------------
  // Send helpers
  // ---------------------------------------------------------------
  const sendWS = useCallback((payload: any) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }, []);

  const setMode = (mode: ArmMode) => {
    sendWS({ type: "arm_mode", data: mode });
  };

  const setJogMode = (mode: JogMode) => {
    sendWS({ type: "arm_jog_mode", data: mode });
  };

  // ---------------------------------------------------------------
  // JOG — mantener presionado envía velocidad en loop
  // ---------------------------------------------------------------
  const startJog = useCallback((vx = 0, vy = 0, vz = 0, vroll = 0, vpitch = 0) => {
    if (jogIntervalRef.current) return;
    const send = () => sendWS({
      type: "cmd_vel_arm",
      data: { vx, vy, vz, vroll, vpitch },
    });
    send();
    jogIntervalRef.current = window.setInterval(send, JOG_INTERVAL_MS);
  }, [sendWS]);

  const stopJog = useCallback(() => {
    if (jogIntervalRef.current) {
      clearInterval(jogIntervalRef.current);
      jogIntervalRef.current = null;
    }
    sendWS({ type: "cmd_vel_arm", data: { vx: 0, vy: 0, vz: 0, vroll: 0, vpitch: 0 } });
  }, [sendWS]);

  // ---------------------------------------------------------------
  // TRAJECTORY — envía pose absoluta
  // ---------------------------------------------------------------
  const sendTarget = (pose: typeof armState.pose) => {
    sendWS({ type: "arm_target", data: pose });
  };

  const sendDeltaTarget = (axis: keyof typeof targetDelta, delta: number) => {
    const current = armState.pose;
    const next = { ...current, [axis]: +(current[axis] + delta).toFixed(4) };
    sendTarget(next);
  };

  const sendPreset = (name: string) => {
    const preset = PRESETS[name];
    if (!preset) return;
    // Asegurarse que esté en trajectory
    sendWS({ type: "arm_mode", data: "trajectory" });
    setTimeout(() => sendTarget(preset), 100);
  };

  // ---------------------------------------------------------------
  // Camera servos (siguen siendo locales)
  // ---------------------------------------------------------------
  const cycleCamera = (direction: number) => {
    if (availableCameras.length <= 1) return;
    setCameraIndex((prev) => (prev + direction + availableCameras.length) % availableCameras.length);
  };

  const refreshCameras = () => {
    const ws = cameraWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type: "get_cameras" }));
  };

  const moveCamServo = (key: keyof typeof camServos, delta: number, wsType: string) => {
    setCamServos((prev) => {
      const next = Math.max(0, Math.min(180, prev[key] + delta));
      sendWS({ type: wsType, data: next });
      return { ...prev, [key]: next };
    });
  };

  // ---------------------------------------------------------------
  // Jog button component
  // ---------------------------------------------------------------
  const JogBtn = ({
    label, vx = 0, vy = 0, vz = 0, vroll = 0, vpitch = 0, color = "bg-blue-600 hover:bg-blue-500"
  }: {
    label: string; vx?: number; vy?: number; vz?: number;
    vroll?: number; vpitch?: number; color?: string;
  }) => (
    <button
      className={`${color} px-2 py-1.5 rounded text-xs font-semibold transition select-none`}
      onMouseDown={() => startJog(vx, vy, vz, vroll, vpitch)}
      onMouseUp={stopJog}
      onMouseLeave={stopJog}
      onPointerDown={() => startJog(vx, vy, vz, vroll, vpitch)}
      onPointerUp={stopJog}
    >
      {label}
    </button>
  );

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  const { mode, jog_mode, is_executing, pose, joints } = armState;
  const isJog = mode === "jog";
  const isTraj = mode === "trajectory";
  const isIdle = mode === "idle";

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">

      {/* ── TOP ROW: Camera + 3D ── */}
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
              <button onClick={() => cycleCamera(-1)} disabled={availableCameras.length <= 1}
                className={`absolute left-2 top-1/2 -translate-y-1/2 backdrop-blur-sm w-8 h-8 rounded-full flex items-center justify-center text-white text-sm transition
                  ${availableCameras.length > 1 ? "bg-black/50 hover:bg-black/70" : "bg-black/20 text-white/30 cursor-not-allowed"}`}>◀</button>
              <button onClick={() => cycleCamera(1)} disabled={availableCameras.length <= 1}
                className={`absolute right-2 top-1/2 -translate-y-1/2 backdrop-blur-sm w-8 h-8 rounded-full flex items-center justify-center text-white text-sm transition
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

        {/* 3D */}
        <div className="bg-gray-800 rounded-2xl shadow-lg border border-gray-700 flex flex-col min-h-0 overflow-hidden">
          <div className="px-3 py-1.5 flex-shrink-0 flex items-center justify-between">
            <span className="text-sm font-bold">3D Preview</span>
            <div className="flex items-center gap-2 text-[10px]">
              <span className={`px-2 py-0.5 rounded-full font-semibold ${
                isIdle ? "bg-gray-600 text-gray-300" :
                isJog  ? "bg-orange-600 text-white" :
                         "bg-cyan-700 text-white"
              }`}>
                {mode.toUpperCase()}
              </span>
              {is_executing && (
                <span className="px-2 py-0.5 rounded-full bg-yellow-600 text-white animate-pulse">
                  EXECUTING
                </span>
              )}
            </div>
          </div>
          <div className="flex-1 px-2 pb-2 min-h-0 overflow-hidden">
            <Arm3D q1={joints.q1} q2={joints.q2} q3={joints.q3} q4={joints.q4} />
          </div>
        </div>
      </div>

      {/* ── BOTTOM ROW: Controls ── */}
      <div className="flex-1 bg-gray-800 rounded-2xl shadow-lg border border-gray-700 p-4 min-h-0 overflow-y-auto">

        {/* Header: modo + presets */}
        <div className="flex items-center flex-wrap gap-2 mb-3">
          <h2 className="text-lg font-bold mr-2">Arm Control</h2>

          {/* Mode buttons */}
          <div className="flex gap-1">
            {(["idle", "jog", "trajectory"] as ArmMode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition capitalize
                  ${mode === m
                    ? m === "idle" ? "bg-gray-500 text-white"
                    : m === "jog"  ? "bg-orange-600 text-white"
                    :                "bg-cyan-600 text-white"
                    : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}>
                {m}
              </button>
            ))}
          </div>

          {/* Jog sub-mode (solo visible en jog) */}
          {isJog && (
            <div className="flex gap-1">
              {(["cartesian", "relative"] as JogMode[]).map((m) => (
                <button key={m} onClick={() => setJogMode(m)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition
                    ${jog_mode === m ? "bg-purple-600 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}>
                  {m}
                </button>
              ))}
            </div>
          )}

          {/* Cancel trajectory */}
          {isTraj && is_executing && (
            <button onClick={() => sendWS({ type: "arm_cancel" })}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition">
              ✕ Cancel
            </button>
          )}

          {/* Presets */}
          <div className="flex flex-wrap gap-1 ml-auto">
            {Object.keys(PRESETS).map((p) => (
              <button key={p} onClick={() => sendPreset(p)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-cyan-700 hover:bg-cyan-600 transition">
                {p}
              </button>
            ))}
            {isTraj && (
              <button onClick={() => sendWS({ type: "arm_go_home" })}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-green-700 hover:bg-green-600 transition">
                🏠 HOME
              </button>
            )}
          </div>
        </div>

        {/* Controls grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* ── Pose control ── */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
              {isJog ? "Jog Velocities" : "Trajectory Target"}
            </h3>

            {isJog ? (
              // JOG: botones de velocidad
              <div className="space-y-1.5">
                <div className="flex gap-1 items-center">
                  <span className="w-12 text-xs font-mono text-gray-400">
                    {jog_mode === "relative" ? "fwd" : "X"}
                  </span>
                  <JogBtn label="+" vx={JOG_VEL_LIN} />
                  <JogBtn label="−" vx={-JOG_VEL_LIN} color="bg-gray-600 hover:bg-gray-500" />
                </div>
                <div className="flex gap-1 items-center">
                  <span className="w-12 text-xs font-mono text-gray-400">
                    {jog_mode === "relative" ? "lat" : "Y"}
                  </span>
                  <JogBtn label="+" vy={JOG_VEL_LIN} />
                  <JogBtn label="−" vy={-JOG_VEL_LIN} color="bg-gray-600 hover:bg-gray-500" />
                </div>
                <div className="flex gap-1 items-center">
                  <span className="w-12 text-xs font-mono text-gray-400">Z</span>
                  <JogBtn label="+" vz={JOG_VEL_LIN} />
                  <JogBtn label="−" vz={-JOG_VEL_LIN} color="bg-gray-600 hover:bg-gray-500" />
                </div>
                <div className="flex gap-1 items-center">
                  <span className="w-12 text-xs font-mono text-gray-400">Roll</span>
                  <JogBtn label="+" vroll={JOG_VEL_ANG} color="bg-purple-600 hover:bg-purple-500" />
                  <JogBtn label="−" vroll={-JOG_VEL_ANG} color="bg-gray-600 hover:bg-gray-500" />
                </div>
                <div className="flex gap-1 items-center">
                  <span className="w-12 text-xs font-mono text-gray-400">Pitch</span>
                  <JogBtn label="+" vpitch={JOG_VEL_ANG} color="bg-purple-600 hover:bg-purple-500" />
                  <JogBtn label="−" vpitch={-JOG_VEL_ANG} color="bg-gray-600 hover:bg-gray-500" />
                </div>
              </div>
            ) : (
              // TRAJECTORY / IDLE: botones de delta + pose actual
              <div className="space-y-1">
                {(["x", "y", "z", "roll", "pitch"] as (keyof typeof pose)[]).map((axis) => (
                  <div key={axis} className="flex items-center gap-1.5">
                    <span className="w-10 text-xs font-mono text-gray-400">{axis}</span>
                    <span className="w-16 text-xs font-mono text-cyan-400 text-right">
                      {pose[axis].toFixed(3)}
                    </span>
                    <button
                      onClick={() => sendDeltaTarget(axis, axis === "roll" || axis === "pitch" ? 2 : 0.01)}
                      disabled={!isTraj || is_executing}
                      className="px-1.5 py-0.5 rounded text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition">
                      +
                    </button>
                    <button
                      onClick={() => sendDeltaTarget(axis, axis === "roll" || axis === "pitch" ? -2 : -0.01)}
                      disabled={!isTraj || is_executing}
                      className="px-1.5 py-0.5 rounded text-xs bg-gray-600 hover:bg-gray-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition">
                      −
                    </button>
                  </div>
                ))}
                {!isTraj && (
                  <p className="text-[10px] text-yellow-500 mt-1">
                    Switch to <strong>trajectory</strong> to send targets
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── Gripper + Linear ── */}
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

          {/* ── Camera Servos ── */}
          <div className="space-y-3">
            {([
              { key: "c1", label: "Camera Servo 1", wsType: "camera" },
              { key: "c2", label: "Camera Servo 2", wsType: "camera2" },
              { key: "c3", label: "Camera Servo 3", wsType: "camera3" },
              { key: "c4", label: "Camera Servo 4", wsType: "camera4" },
            ] as { key: keyof typeof camServos; label: string; wsType: string }[]).map(({ key, label, wsType }) => (
              <div key={key}>
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">
                  {label} — {camServos[key]}°
                </h3>
                <div className="flex gap-2 mb-1">
                  <button className="flex-1 bg-blue-600 px-3 py-1 rounded text-xs font-semibold hover:bg-blue-500 transition"
                    onClick={() => moveCamServo(key, 5, wsType)}>+5°</button>
                  <button className="flex-1 bg-gray-600 px-3 py-1 rounded text-xs font-semibold hover:bg-gray-500 transition"
                    onClick={() => moveCamServo(key, -5, wsType)}>−5°</button>
                </div>
                <input type="range" min={0} max={180} value={camServos[key]}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    setCamServos((p) => ({ ...p, [key]: v }));
                    sendWS({ type: wsType, data: v });
                  }}
                  className="w-full accent-cyan-500 h-1" />
              </div>
            ))}
          </div>

          {/* ── Estado real del brazo ── */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
              Live State (from ROS)
            </h3>
            <div className="space-y-0.5 text-xs font-mono">
              <p className="text-gray-500 mb-1">— Pose —</p>
              {Object.entries(pose).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-gray-400">{k}</span>
                  <span className="text-cyan-400">{(v as number).toFixed(3)}</span>
                </div>
              ))}
              <p className="text-gray-500 mt-2 mb-1">— Joints (°) —</p>
              {Object.entries(joints).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-gray-400">{k}</span>
                  <span className="text-green-400">{(v as number).toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}