import { useState, useEffect, useRef, useCallback } from "react";
import {
  Chart as ChartJS, LineElement, PointElement, LinearScale, Title, Tooltip, Legend,
} from "chart.js";
import Arm3D from "../components/Arm3D";
ChartJS.register(LineElement, PointElement, LinearScale, Title, Tooltip, Legend);

type Angles = { q1: number; q2: number; q3: number; q4: number; q5: number };
type Position = {
  x: number; y: number; z: number; roll: number; pitch: number;
  joint8: number; joint9: number;
};
type CartesianPoint = { x: number; y: number; z: number; roll: number; pitch: number };

const limits = {
  q1: [-90, 90],
  q2: [-10, 190],
  q3: [-150, 150],
  q4: [-150, 150],
  q5: [-90, 90],
  camera: [0, 180],
};

const l1 = 0.1, l2 = 0.43, l3 = 0.43, l4 = 0.213;

// --- Interpolation helpers ---
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function generateLinearTrajectory(
  start: CartesianPoint,
  end: CartesianPoint,
  stepSize: number,
  orientationStep: number
): CartesianPoint[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  let numSteps: number;
  if (dist < 1e-6) {
    const maxOrient = Math.max(
      Math.abs(end.roll - start.roll),
      Math.abs(end.pitch - start.pitch)
    );
    if (maxOrient < 1e-6) return [];
    numSteps = Math.max(2, Math.ceil(maxOrient / orientationStep));
  } else {
    numSteps = Math.max(2, Math.ceil(dist / stepSize));
  }

  const waypoints: CartesianPoint[] = [];
  for (let i = 1; i <= numSteps; i++) {
    const t = i / numSteps;
    waypoints.push({
      x: lerp(start.x, end.x, t),
      y: lerp(start.y, end.y, t),
      z: lerp(start.z, end.z, t),
      roll: lerp(start.roll, end.roll, t),
      pitch: lerp(start.pitch, end.pitch, t),
    });
  }
  return waypoints;
}

export default function Arm() {
  const [angles, setAngles] = useState<Angles>({ q1: 0, q2: 190, q3: -140, q4: -50, q5: 0 });
  const [pos, setPos] = useState<Position>({
    x: 0.15, y: 0, z: 0.35, roll: 0, pitch: 0, joint8: 80, joint9: 45,
  });

  const [remoteControl, setRemoteControl] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const updatingFromWS = useRef(false);

  // --- Interpolation state ---
  const [interpolationEnabled, setInterpolationEnabled] = useState(true);
  const [stepSize, setStepSize] = useState(0.005);
  const [waypointRate, setWaypointRate] = useState(10); // Hz
  const [orientationStep, setOrientationStep] = useState(0.01);

  const [trajectory, setTrajectory] = useState<CartesianPoint[]>([]);
  const [currentWaypointIndex, setCurrentWaypointIndex] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const [trajectoryHistory, setTrajectoryHistory] = useState<CartesianPoint[]>([]);

  const trajectoryRef = useRef<CartesianPoint[]>([]);
  const waypointIndexRef = useRef(0);
  const executingRef = useRef(false);
  const animationTimerRef = useRef<number | null>(null);

  // --- WebSocket ---
  useEffect(() => {
    const wsUrl =
      `${window.location.protocol === "https:" ? "wss" : "ws"}://` +
      `${window.location.hostname}:8000/ws/connection/move`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => console.log("🛰️ WS connected");
    ws.onclose = () => console.log("🔴 WS closed");
    ws.onerror = (e) => console.warn("WS error:", e);

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (remoteControl && msg?.type === "pose" && msg?.data) {
          const { x, y, z, roll, pitch } = msg.data;
          const nf = (v: any, fallback: number) =>
            Number.isFinite(Number(v)) ? Number(v) : fallback;

          updatingFromWS.current = true;
          setPos((prev) => ({
            ...prev,
            x: nf(x, prev.x), y: nf(y, prev.y), z: nf(z, prev.z),
            roll: nf(roll, prev.roll), pitch: nf(pitch, prev.pitch),
          }));
          queueMicrotask(() => { updatingFromWS.current = false; });
        }
      } catch (err) {
        console.warn("WS parse error:", err, e.data);
      }
    };

    return () => ws.close();
  }, [remoteControl]);

  const sendWS = useCallback((payload: any) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  // --- Utilidades ---
  const radToDeg = (r: number) => (r * 180) / Math.PI;
  const deg2rad = (d: number) => (d * Math.PI) / 180;

  // --- IK ---
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
    return {
      q1: radToDeg(q1), q2: radToDeg(q2), q3: radToDeg(q3),
      q4: radToDeg(q4), q5: radToDeg(q5),
    };
  }

  function isReachable(x: number, y: number, z: number, roll: number, pitch: number): boolean {
    const a = Math.sqrt(x * x + y * y) - l4 * Math.cos(pitch);
    const b = z - l4 * Math.sin(pitch) - l1;
    const d = (a * a + b * b - l2 * l2 - l3 * l3) / (2 * l2 * l3);
    return Math.abs(d) <= 1.0;
  }

  // Recalcula ángulos al mover el efector final
  useEffect(() => {
    if (executingRef.current) return; // Don't recalc during trajectory execution
    const { x, y, z, roll, pitch } = pos;
    const newAngles = inverseKinematics(x, y, z, deg2rad(roll), deg2rad(pitch));
    setAngles(newAngles);
  }, [pos]);

  // --- ENVÍOS ---
  useEffect(() => {
    sendWS({ type: "joint_angles", data: angles });
  }, [angles, sendWS]);

  const moveCamera = (delta: number) => {
    setPos((prev) => {
      const next = Math.max(limits.camera[0], Math.min(limits.camera[1], prev.joint8 + delta));
      const updated = { ...prev, joint8: next };
      sendWS({ type: "camera", data: next });
      return updated;
    });
  };

  const poseTimer = useRef<number | null>(null);
  useEffect(() => {
    if (updatingFromWS.current) return;
    const { x, y, z, roll, pitch } = pos;
    if (poseTimer.current) window.clearTimeout(poseTimer.current);
    poseTimer.current = window.setTimeout(() => {
      sendWS({ type: "pose", data: { x, y, z, roll, pitch } });
    }, 40);
    return () => {
      if (poseTimer.current) window.clearTimeout(poseTimer.current);
    };
  }, [pos.x, pos.y, pos.z, pos.roll, pos.pitch, sendWS]);

  // --- Interpolation execution ---
  const startTrajectory = useCallback((targetPos: CartesianPoint) => {
    const currentPoint: CartesianPoint = {
      x: pos.x, y: pos.y, z: pos.z,
      roll: deg2rad(pos.roll), pitch: deg2rad(pos.pitch),
    };
    const targetPoint: CartesianPoint = {
      x: targetPos.x, y: targetPos.y, z: targetPos.z,
      roll: targetPos.roll, pitch: targetPos.pitch,
    };

    const waypoints = generateLinearTrajectory(
      currentPoint, targetPoint, stepSize, orientationStep
    );

    if (waypoints.length === 0) return;

    // Validate all waypoints
    for (const wp of waypoints) {
      if (!isReachable(wp.x, wp.y, wp.z, wp.roll, wp.pitch)) {
        console.warn("Trajectory has unreachable waypoints — rejected");
        return;
      }
    }

    trajectoryRef.current = waypoints;
    waypointIndexRef.current = 0;
    executingRef.current = true;
    setTrajectory(waypoints);
    setCurrentWaypointIndex(0);
    setIsExecuting(true);
    setTrajectoryHistory([currentPoint]);

    // Start animation
    if (animationTimerRef.current) clearInterval(animationTimerRef.current);
    const intervalMs = 1000 / waypointRate;

    animationTimerRef.current = window.setInterval(() => {
      const idx = waypointIndexRef.current;
      const traj = trajectoryRef.current;

      if (idx >= traj.length) {
        // Done
        if (animationTimerRef.current) clearInterval(animationTimerRef.current);
        animationTimerRef.current = null;
        executingRef.current = false;
        setIsExecuting(false);
        return;
      }

      const wp = traj[idx];
      const newAngles = inverseKinematics(wp.x, wp.y, wp.z, wp.roll, wp.pitch);
      setAngles(newAngles);
      setPos((prev) => ({
        ...prev,
        x: +wp.x.toFixed(4),
        y: +wp.y.toFixed(4),
        z: +wp.z.toFixed(4),
        roll: +radToDeg(wp.roll).toFixed(2),
        pitch: +radToDeg(wp.pitch).toFixed(2),
      }));
      setCurrentWaypointIndex(idx);
      setTrajectoryHistory((prev) => [...prev, wp]);

      waypointIndexRef.current = idx + 1;
    }, intervalMs);
  }, [pos, stepSize, waypointRate, orientationStep]);

  const cancelTrajectory = useCallback(() => {
    if (animationTimerRef.current) {
      clearInterval(animationTimerRef.current);
      animationTimerRef.current = null;
    }
    executingRef.current = false;
    setIsExecuting(false);
    setTrajectory([]);
    setCurrentWaypointIndex(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationTimerRef.current) clearInterval(animationTimerRef.current);
    };
  }, []);

  // --- Target input for interpolation ---
  const [targetInput, setTargetInput] = useState<CartesianPoint>({
    x: 0.4, y: 0.0, z: 0.3, roll: 0, pitch: 0,
  });

  const handleGoToTarget = () => {
    if (!interpolationEnabled) {
      // Direct move
      setPos((prev) => ({
        ...prev,
        x: targetInput.x,
        y: targetInput.y,
        z: targetInput.z,
        roll: radToDeg(targetInput.roll),
        pitch: radToDeg(targetInput.pitch),
      }));
    } else {
      startTrajectory(targetInput);
    }
  };

  const adjustValue = (key: keyof Position, delta: number) => {
    setPos((prev) => ({ ...prev, [key]: +(prev[key] + delta).toFixed(3) }));
  };

  const setPreset = (preset: string) => {
    const target: CartesianPoint = { x: 0, y: 0, z: 0, roll: 0, pitch: 0 };
    switch (preset) {
      case "HOME":         Object.assign(target, { x: 0.2, y: 0, z: 0.6, roll: 0, pitch: 0 }); break;
      case "INTERMEDIATE": Object.assign(target, { x: 0.2,  y: 0, z: 0.6,  roll: 0, pitch: 0 }); break;
      case "PREFLOOR":     Object.assign(target, { x: 0.25, y: 0, z: 0.35, roll: 0, pitch: deg2rad(-75) }); break;
      case "FLOOR":        Object.assign(target, { x: 0.35, y: 0, z: 0.1,  roll: 0, pitch: deg2rad(-75) }); break;
      case "STORAGE":      Object.assign(target, { x: 0,    y: 0, z: 0.55, roll: 0, pitch: deg2rad(100) }); break;
    }

    if (interpolationEnabled) {
      startTrajectory(target);
    } else {
      setPos((prev) => ({
        ...prev,
        x: target.x, y: target.y, z: target.z,
        roll: radToDeg(target.roll), pitch: radToDeg(target.pitch),
      }));
    }
  };

  // --- Progress percentage ---
  const progress = trajectory.length > 0
    ? Math.min(100, Math.round((currentWaypointIndex / (trajectory.length - 1)) * 100))
    : 0;

  return (
    <div className="flex flex-col h-full w-full overflow-visible md:overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 mb-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-2xl font-bold">Arm Control Interface</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setInterpolationEnabled((v) => !v)}
              className={`px-4 py-2 rounded-lg shadow font-semibold transition text-sm
                ${interpolationEnabled
                  ? "bg-amber-600 hover:bg-amber-500"
                  : "bg-gray-600 hover:bg-gray-500"}`}
            >
              {interpolationEnabled ? "Interpolation: ON" : "Interpolation: OFF"}
            </button>
            <button
              onClick={() => setRemoteControl((v) => !v)}
              className={`px-4 py-2 rounded-lg shadow font-semibold transition text-sm
                ${remoteControl ? "bg-green-600 hover:bg-green-500" : "bg-gray-600 hover:bg-gray-500"}`}
            >
              {remoteControl ? "Joystick: ON" : "Joystick: OFF"}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-3">
          {["HOME", "INTERMEDIATE", "PREFLOOR", "FLOOR", "STORAGE"].map((p) => (
            <button key={p} onClick={() => setPreset(p)}
              disabled={isExecuting}
              className={`px-4 py-2 rounded-lg shadow font-semibold transition
                ${isExecuting
                  ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                  : "bg-cyan-600 hover:bg-cyan-500"}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Main panel */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-visible md:overflow-hidden min-h-[calc(100vh-16rem)] md:min-h-0">
        {/* 3D + trajectory info */}
        <div className="bg-gray-800 p-4 rounded-2xl shadow-lg border border-gray-700 flex flex-col min-h-[350px] md:min-h-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">Arm Visualization</h3>
            {isExecuting && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-sm text-green-400">Executing</span>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-hidden">
            <Arm3D q1={angles.q1} q2={angles.q2} q3={angles.q3} q4={angles.q4} />
          </div>

          {/* Trajectory progress bar */}
          {trajectory.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Waypoint {currentWaypointIndex + 1} / {trajectory.length}</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-100"
                  style={{
                    width: `${progress}%`,
                    background: isExecuting
                      ? "linear-gradient(90deg, #06b6d4, #22d3ee)"
                      : "#22d3ee",
                  }}
                />
              </div>
              {isExecuting && (
                <button onClick={cancelTrajectory}
                  className="w-full bg-red-600 hover:bg-red-500 px-3 py-1.5 rounded-lg text-sm font-semibold transition">
                  Cancel Trajectory
                </button>
              )}
            </div>
          )}

          {/* Trajectory stats */}
          {trajectory.length > 0 && (
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div className="bg-gray-700/50 rounded-lg p-2 text-center">
                <div className="text-gray-400">Points</div>
                <div className="text-cyan-400 font-bold">{trajectory.length}</div>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-2 text-center">
                <div className="text-gray-400">Step</div>
                <div className="text-cyan-400 font-bold">{(stepSize * 100).toFixed(1)} cm</div>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-2 text-center">
                <div className="text-gray-400">Est. Time</div>
                <div className="text-cyan-400 font-bold">
                  {(trajectory.length / waypointRate).toFixed(1)}s
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="bg-gray-800 p-4 rounded-2xl shadow-lg border border-gray-700 flex flex-col overflow-y-auto md:overflow-hidden min-h-[400px] md:min-h-0">
          <div className="flex-1 space-y-4">
            {/* IK Controls */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-lg font-semibold">Current Position</h3>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  remoteControl ? "bg-green-700 text-green-100" : "bg-gray-700 text-gray-200"
                }`}>
                  {remoteControl ? "Joystick" : "UI"}
                </span>
              </div>

              {(["x", "y", "z", "roll", "pitch"] as (keyof Position)[]).map((axis) => (
                <div key={axis} className="flex items-center gap-2 mb-1.5">
                  <label className="w-12 capitalize text-gray-300 text-sm">{axis}</label>
                  <input type="number" step={axis === "roll" || axis === "pitch" ? 1 : 0.01}
                    className="bg-gray-700 text-white px-2 py-1 w-24 rounded text-sm"
                    value={pos[axis]}
                    disabled={isExecuting}
                    onChange={(e) => setPos({ ...pos, [axis]: parseFloat(e.target.value) || 0 })} />
                  <button className="bg-blue-600 px-2 py-1 rounded text-sm hover:bg-blue-500 transition"
                    disabled={isExecuting} onClick={() => adjustValue(axis, 0.01)}>+</button>
                  <button className="bg-cyan-600 px-2 py-1 rounded text-sm hover:bg-cyan-500 transition"
                    disabled={isExecuting} onClick={() => adjustValue(axis, -0.01)}>-</button>
                </div>
              ))}
            </div>

            {/* Interpolation target */}
            {interpolationEnabled && (
              <div className="border-t border-gray-700 pt-3">
                <h3 className="text-lg font-semibold mb-2">
                  Target Position
                  <span className="text-xs text-amber-400 ml-2">interpolated</span>
                </h3>

                {(["x", "y", "z", "roll", "pitch"] as (keyof CartesianPoint)[]).map((axis) => (
                  <div key={`t-${axis}`} className="flex items-center gap-2 mb-1.5">
                    <label className="w-12 capitalize text-gray-300 text-sm">{axis}</label>
                    <input type="number"
                      step={axis === "roll" || axis === "pitch" ? 0.01 : 0.01}
                      className="bg-gray-700 text-white px-2 py-1 w-24 rounded text-sm border border-amber-600/30"
                      value={targetInput[axis]}
                      disabled={isExecuting}
                      onChange={(e) => setTargetInput((prev) => ({
                        ...prev, [axis]: parseFloat(e.target.value) || 0,
                      }))} />
                    <span className="text-xs text-gray-500">
                      {axis === "roll" || axis === "pitch" ? "rad" : "m"}
                    </span>
                  </div>
                ))}

                <div className="flex gap-2 mt-2">
                  <button onClick={handleGoToTarget} disabled={isExecuting}
                    className={`flex-1 px-4 py-2 rounded-lg font-semibold transition text-sm
                      ${isExecuting
                        ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                        : "bg-amber-600 hover:bg-amber-500"}`}>
                    {isExecuting ? "Executing..." : "Go To Target"}
                  </button>
                  <button
                    onClick={() => setTargetInput({
                      x: pos.x, y: pos.y, z: pos.z,
                      roll: deg2rad(pos.roll), pitch: deg2rad(pos.pitch),
                    })}
                    disabled={isExecuting}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition"
                    title="Copy current position to target">
                    📋
                  </button>
                </div>

                {/* Interpolation settings */}
                <details className="mt-3">
                  <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-200 transition">
                    Interpolation Settings
                  </summary>
                  <div className="mt-2 space-y-2 bg-gray-700/30 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-300 w-24">Step size</label>
                      <input type="range" min={0.001} max={0.01} step={0.001}
                        value={stepSize}
                        onChange={(e) => setStepSize(parseFloat(e.target.value))}
                        className="flex-1 accent-amber-500" />
                      <span className="text-xs text-cyan-400 w-16 text-right">
                        {(stepSize * 100).toFixed(1)} cm
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-300 w-24">Rate</label>
                      <input type="range" min={1} max={50} step={1}
                        value={waypointRate}
                        onChange={(e) => setWaypointRate(parseInt(e.target.value))}
                        className="flex-1 accent-amber-500" />
                      <span className="text-xs text-cyan-400 w-16 text-right">
                        {waypointRate} Hz
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-300 w-24">Orient. step</label>
                      <input type="range" min={0.01} max={0.3} step={0.01}
                        value={orientationStep}
                        onChange={(e) => setOrientationStep(parseFloat(e.target.value))}
                        className="flex-1 accent-amber-500" />
                      <span className="text-xs text-cyan-400 w-16 text-right">
                        {orientationStep.toFixed(2)} rad
                      </span>
                    </div>
                  </div>
                </details>
              </div>
            )}
          </div>

          {/* Gripper + Camera */}
          <div className="space-y-3 mt-4 border-t border-gray-700 pt-3">
            <div className="flex justify-center gap-3">
              <button className="bg-blue-600 px-3 py-1.5 rounded text-sm hover:bg-blue-500 transition select-none"
                onMouseDown={() => sendWS({ type: "gripper", data: -1 })}
                onMouseUp={() => sendWS({ type: "gripper", data: 0 })}
                onPointerDown={() => sendWS({ type: "gripper", data: -1 })}
                onPointerUp={() => sendWS({ type: "gripper", data: 0 })}>
                Close Gripper
              </button>
              <button className="bg-cyan-600 px-3 py-1.5 rounded text-sm hover:bg-cyan-400 transition select-none"
                onMouseDown={() => sendWS({ type: "gripper", data: 1 })}
                onMouseUp={() => sendWS({ type: "gripper", data: 0 })}
                onPointerDown={() => sendWS({ type: "gripper", data: 1 })}
                onPointerUp={() => sendWS({ type: "gripper", data: 0 })}>
                Open Gripper
              </button>
            </div>
            <div className="flex justify-center gap-3">
              <button className="bg-blue-600 px-3 py-1.5 rounded text-sm hover:bg-blue-500 transition"
                onClick={() => moveCamera(5)}>Camera +</button>
              <button className="bg-cyan-600 px-3 py-1.5 rounded text-sm hover:bg-cyan-400 transition"
                onClick={() => moveCamera(-5)}>Camera -</button>
            </div>
          </div>

          {/* Joint readout */}
          <div className="mt-3 border-t border-gray-700 pt-3">
            <h4 className="text-xs font-semibold mb-1 text-gray-400">Joint Angles (°)</h4>
            <div className="grid grid-cols-3 gap-1 text-xs">
              {Object.entries(angles).map(([k, v]) => (
                <p key={k}>{k.toUpperCase()}: <span className="text-cyan-400">{v.toFixed(1)}</span></p>
              ))}
              <p>CAM: <span className="text-cyan-400">{pos.joint8}</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}