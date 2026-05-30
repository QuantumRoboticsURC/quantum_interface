import { useState, useEffect, useRef, useCallback } from "react";
import ScienceArm3D from "../components/ScienceArm3D";

type ArmMode = "idle" | "jog" | "trajectory";
type JogMode = "cartesian" | "relative";

interface ScienceArmState {
  mode: ArmMode;
  jog_mode: JogMode;
  is_executing: boolean;
  pose: { x: number; y: number; z: number; pitch: number };
  joints: { q1: number; q2: number; q3: number; q4: number };
}

const PRESETS: Record<string, { x: number; y: number; z: number; pitch: number }> = {
  HOME:     { x: 0.15, y: 0,    z: 0.35, pitch: 0   },
  PREFLOOR: { x: 0.25, y: 0,    z: 0.35, pitch: -75 },
  FLOOR:    { x: 0.35, y: 0,    z: 0.1,  pitch: -75 },
};

const JOG_VEL_LIN = 0.01;
const JOG_VEL_ANG = 0.05;
const JOG_INTERVAL_MS = 80;

const DEFAULT_STATE: ScienceArmState = {
  mode: "idle",
  jog_mode: "cartesian",
  is_executing: false,
  pose: { x: 0.15, y: 0, z: 0.35, pitch: 0 },
  joints: { q1: 0, q2: 0, q3: 0, q4: 90 },
};

export default function ScienceArm() {
  const [armState, setArmState] = useState<ScienceArmState>(DEFAULT_STATE);
  const [drillAngle, setDrillAngle] = useState(90);

  const wsRef = useRef<WebSocket | null>(null);
  const jogIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    const wsUrl =
      `${window.location.protocol === "https:" ? "wss" : "ws"}://` +
      `${window.location.hostname}:8000/ws/connection/science_move`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => console.log("🔬 Science Arm WS connected");
    ws.onclose = () => console.log("🔴 Science Arm WS closed");
    ws.onerror = (e) => console.warn("Science Arm WS error:", e);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg?.type === "science_arm_state" && msg?.data) {
          setArmState((prev) => ({ ...prev, ...msg.data }));
        }
      } catch {}
    };

    return () => ws.close();
  }, []);

  const sendWS = useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }, []);

  const setMode = (mode: ArmMode) => sendWS({ type: "science_arm_mode", data: mode });
  const setJogMode = (mode: JogMode) => sendWS({ type: "science_arm_jog_mode", data: mode });

  const startJog = useCallback(
    (vx = 0, vy = 0, vz = 0, vpitch = 0) => {
      if (jogIntervalRef.current) return;
      const send = () =>
        sendWS({ type: "cmd_vel_science_arm", data: { vx, vy, vz, vpitch } });
      send();
      jogIntervalRef.current = window.setInterval(send, JOG_INTERVAL_MS);
    },
    [sendWS]
  );

  const stopJog = useCallback(() => {
    if (jogIntervalRef.current) {
      clearInterval(jogIntervalRef.current);
      jogIntervalRef.current = null;
    }
    sendWS({ type: "cmd_vel_science_arm", data: { vx: 0, vy: 0, vz: 0, vpitch: 0 } });
  }, [sendWS]);

  const sendTarget = (pose: typeof armState.pose) =>
    sendWS({ type: "science_arm_target", data: pose });

  const sendDeltaTarget = (axis: keyof typeof armState.pose, delta: number) => {
    const next = { ...armState.pose, [axis]: +(armState.pose[axis] + delta).toFixed(4) };
    sendTarget(next);
  };

  const sendPreset = (name: string) => {
    const preset = PRESETS[name];
    if (!preset) return;
    sendWS({ type: "science_arm_mode", data: "trajectory" });
    setTimeout(() => sendTarget(preset), 100);
  };

  const moveDrillServo = (delta: number) => {
    const next = Math.max(0, Math.min(180, drillAngle + delta));
    setDrillAngle(next);
    sendWS({ type: "science_drill_servo", data: next });
  };

  const setDrillAngleDirect = (v: number) => {
    setDrillAngle(v);
    sendWS({ type: "science_drill_servo", data: v });
  };

  const JogBtn = ({
    label,
    vx = 0,
    vy = 0,
    vz = 0,
    vpitch = 0,
    color = "bg-blue-600 hover:bg-blue-500",
  }: {
    label: string;
    vx?: number;
    vy?: number;
    vz?: number;
    vpitch?: number;
    color?: string;
  }) => (
    <button
      className={`${color} px-2 py-1.5 rounded text-xs font-semibold transition select-none`}
      onMouseDown={() => startJog(vx, vy, vz, vpitch)}
      onMouseUp={stopJog}
      onMouseLeave={stopJog}
      onPointerDown={() => startJog(vx, vy, vz, vpitch)}
      onPointerUp={stopJog}
    >
      {label}
    </button>
  );

  const { mode, jog_mode, is_executing, pose, joints } = armState;
  const isJog = mode === "jog";
  const isTraj = mode === "trajectory";
  const isIdle = mode === "idle";

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">

      {/* ── 3D View ── */}
      <div
        className="bg-gray-800 rounded-2xl shadow-lg border border-gray-700 flex flex-col min-h-0 overflow-hidden mb-3"
        style={{ height: "48vh", minHeight: "260px" }}
      >
        <div className="px-3 py-1.5 flex-shrink-0 flex items-center justify-between">
          <span className="text-sm font-bold">Science Arm — 3D Twin</span>
          <div className="flex items-center gap-2 text-[10px]">
            <span
              className={`px-2 py-0.5 rounded-full font-semibold ${
                isIdle ? "bg-gray-600 text-gray-300"
                : isJog ? "bg-orange-600 text-white"
                :         "bg-cyan-700 text-white"
              }`}
            >
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
          <ScienceArm3D q1={joints.q1} q2={joints.q2} q3={joints.q3} q4={joints.q4} />
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="flex-1 bg-gray-800 rounded-2xl shadow-lg border border-gray-700 p-4 min-h-0 overflow-y-auto">

        {/* Header: mode + presets */}
        <div className="flex items-center flex-wrap gap-2 mb-3">
          <h2 className="text-lg font-bold mr-2">Science Arm Control</h2>

          <div className="flex gap-1">
            {(["idle", "jog", "trajectory"] as ArmMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition capitalize
                  ${mode === m
                    ? m === "idle" ? "bg-gray-500 text-white"
                    : m === "jog"  ? "bg-orange-600 text-white"
                    :                "bg-cyan-600 text-white"
                    : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}
              >
                {m}
              </button>
            ))}
          </div>

          {isJog && (
            <div className="flex gap-1">
              {(["cartesian", "relative"] as JogMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setJogMode(m)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition
                    ${jog_mode === m ? "bg-purple-600 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          {isTraj && is_executing && (
            <button
              onClick={() => sendWS({ type: "science_arm_cancel" })}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition"
            >
              ✕ Cancel
            </button>
          )}

          <div className="flex flex-wrap gap-1 ml-auto">
            {Object.keys(PRESETS).map((p) => (
              <button
                key={p}
                onClick={() => sendPreset(p)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-cyan-700 hover:bg-cyan-600 transition"
              >
                {p}
              </button>
            ))}
            {isTraj && (
              <button
                onClick={() => sendWS({ type: "science_arm_go_home" })}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-green-700 hover:bg-green-600 transition"
              >
                🏠 HOME
              </button>
            )}
          </div>
        </div>

        {/* Controls grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* ── Pose / Jog ── */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
              {isJog ? "Jog Velocities" : "Trajectory Target"}
            </h3>

            {isJog ? (
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
                  <span className="w-12 text-xs font-mono text-gray-400">Pitch</span>
                  <JogBtn label="+" vpitch={JOG_VEL_ANG} color="bg-purple-600 hover:bg-purple-500" />
                  <JogBtn label="−" vpitch={-JOG_VEL_ANG} color="bg-gray-600 hover:bg-gray-500" />
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {(["x", "y", "z", "pitch"] as (keyof typeof pose)[]).map((axis) => (
                  <div key={axis} className="flex items-center gap-1.5">
                    <span className="w-10 text-xs font-mono text-gray-400">{axis}</span>
                    <span className="w-16 text-xs font-mono text-cyan-400 text-right">
                      {pose[axis].toFixed(3)}
                    </span>
                    <button
                      onClick={() => sendDeltaTarget(axis, axis === "pitch" ? 2 : 0.01)}
                      disabled={!isTraj || is_executing}
                      className="px-1.5 py-0.5 rounded text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition"
                    >
                      +
                    </button>
                    <button
                      onClick={() => sendDeltaTarget(axis, axis === "pitch" ? -2 : -0.01)}
                      disabled={!isTraj || is_executing}
                      className="px-1.5 py-0.5 rounded text-xs bg-gray-600 hover:bg-gray-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition"
                    >
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

          {/* ── Drill Servo ── */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
              Drill Servo — {drillAngle}°
            </h3>
            <div className="flex gap-2 mb-2">
              <button
                className="flex-1 bg-orange-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-orange-500 transition"
                onClick={() => moveDrillServo(5)}
              >
                +5°
              </button>
              <button
                className="flex-1 bg-gray-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-500 transition"
                onClick={() => moveDrillServo(-5)}
              >
                −5°
              </button>
            </div>
            <div className="flex gap-2 mb-3">
              <button
                className="flex-1 bg-orange-700 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-orange-600 transition"
                onClick={() => moveDrillServo(15)}
              >
                +15°
              </button>
              <button
                className="flex-1 bg-gray-700 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-600 transition"
                onClick={() => moveDrillServo(-15)}
              >
                −15°
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={180}
              value={drillAngle}
              onChange={(e) => setDrillAngleDirect(parseInt(e.target.value))}
              className="w-full accent-orange-500 h-1 mb-2"
            />
            <div className="flex gap-1">
              {[0, 45, 90, 135, 180].map((v) => (
                <button
                  key={v}
                  onClick={() => setDrillAngleDirect(v)}
                  className={`flex-1 text-[10px] py-0.5 rounded transition
                    ${drillAngle === v ? "bg-orange-600 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}
                >
                  {v}°
                </button>
              ))}
            </div>
          </div>

          {/* ── Linear Actuator ── */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
              Linear Actuator
            </h3>
            <div className="flex gap-2">
              <button
                className="flex-1 bg-blue-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-500 transition select-none"
                onMouseDown={() => sendWS({ type: "linear_actuator", data: 1 })}
                onMouseUp={() => sendWS({ type: "linear_actuator", data: 0 })}
                onPointerDown={() => sendWS({ type: "linear_actuator", data: 1 })}
                onPointerUp={() => sendWS({ type: "linear_actuator", data: 0 })}
                onMouseLeave={() => sendWS({ type: "linear_actuator", data: 0 })}
              >
                Extend
              </button>
              <button
                className="flex-1 bg-gray-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-500 transition select-none"
                onMouseDown={() => sendWS({ type: "linear_actuator", data: -1 })}
                onMouseUp={() => sendWS({ type: "linear_actuator", data: 0 })}
                onPointerDown={() => sendWS({ type: "linear_actuator", data: -1 })}
                onPointerUp={() => sendWS({ type: "linear_actuator", data: 0 })}
                onMouseLeave={() => sendWS({ type: "linear_actuator", data: 0 })}
              >
                Retract
              </button>
            </div>
          </div>

          {/* ── Live State ── */}
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
