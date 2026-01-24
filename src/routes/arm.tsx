import { useState, useEffect, useRef, useCallback } from "react";
import {
  Chart as ChartJS, LineElement, PointElement, LinearScale, Title, Tooltip, Legend,
} from "chart.js";
import Arm3D from "../components/Arm3D";
ChartJS.register(LineElement, PointElement, LinearScale, Title, Tooltip, Legend);

type Angles = { q1: number; q2: number; q3: number; q4: number; q5: number };
type Position = {
  x: number; y: number; z: number; roll: number; pitch: number;
  joint8: number; joint9: number; // joint8 = ángulo de cámara
};

const limits = {
  q1: [-90, 90],
  q2: [-10, 190],
  q3: [-150, 150],
  q4: [-150, 150],
  q5: [-90, 90],
  camera: [0, 180],
};

const l1 = 0.1, l2 = 0.43, l3 = 0.43, l4 = 0.213;

export default function Arm() {
  const [angles, setAngles] = useState<Angles>({ q1: 0, q2: 190, q3: -140, q4: -50, q5: 0 });
  const [pos, setPos] = useState<Position>({
    x: 0.15, y: 0, z: 0.35, roll: 0, pitch: 0, joint8: 80, joint9: 45,
  });

  const [remoteControl, setRemoteControl] = useState(false); // NEW: toggle joystick/WS control
  const wsRef = useRef<WebSocket | null>(null);
  const updatingFromWS = useRef(false); // evita eco cuando pose viene del backend

  // --- WebSocket ---
  useEffect(() => {
    // URL dinámica para soportar http/https -> ws/wss
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

        // SOLO aplicar la pose entrante si el control remoto está ACTIVADO
        if (remoteControl && msg?.type === "pose" && msg?.data) {
          const { x, y, z, roll, pitch } = msg.data;
          const nf = (v: any, fallback: number) =>
            Number.isFinite(Number(v)) ? Number(v) : fallback;

          updatingFromWS.current = true;
          setPos((prev) => ({
            ...prev,
            x: nf(x, prev.x),
            y: nf(y, prev.y),
            z: nf(z, prev.z),
            roll: nf(roll, prev.roll),   // en grados
            pitch: nf(pitch, prev.pitch) // en grados
          }));
          queueMicrotask(() => { updatingFromWS.current = false; });
        }

        // si quisieras también reflejar cámara/gripper del backend, aquí los leerías:
        // if (remoteControl && msg?.type === "camera") setPos(p=>({...p, joint8: msg.data}));

      } catch (err) {
        console.warn("WS parse error:", err, e.data);
      }
    };

    return () => ws.close();
  }, [remoteControl]); // NEW: si cambias el toggle, mantenemos handler coherente

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
      q1: radToDeg(q1),
      q2: radToDeg(q2),
      q3: radToDeg(q3),
      q4: radToDeg(q4),
      q5: radToDeg(q5),
    };
  }

  // Recalcula ángulos al mover el efector final
  useEffect(() => {
    const { x, y, z, roll, pitch } = pos;
    const newAngles = inverseKinematics(x, y, z, deg2rad(roll), deg2rad(pitch));
    setAngles(newAngles);
  }, [pos]);

  // --- ENVÍOS ---

  // 1) Joint angles (q1..q5) cada vez que cambian
  useEffect(() => {
    sendWS({ type: "joint_angles", data: angles });
  }, [angles, sendWS]);

  // 2) Cámara: al presionar botones +/- (acumula y envía)
  const moveCamera = (delta: number) => {
    setPos((prev) => {
      const next = Math.max(limits.camera[0], Math.min(limits.camera[1], prev.joint8 + delta));
      const updated = { ...prev, joint8: next };
      sendWS({ type: "camera", data: next });
      return updated;
    });
  };

  // 3) Pose (x, y, z, roll, pitch) — sólo si cambio LOCAL (no eco WS)
  //    *NOTA*: aunque el toggle esté en ON, los cambios locales sí se envían.
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

  // --- UI helpers ---
  const adjustValue = (key: keyof Position, delta: number) => {
    setPos((prev) => ({ ...prev, [key]: +(prev[key] + delta).toFixed(3) }));
  };

  const setPreset = (preset: string) => {
    const next: Position = { ...pos };
    switch (preset) {
      case "HOME":         Object.assign(next, { x: 0.15, y: 0, z: 0.35, roll: 0, pitch: 0 }); break;
      case "INTERMEDIATE": Object.assign(next, { x: 0.2,  y: 0, z: 0.6,  roll: 0, pitch: 0 }); break;
      case "PREFLOOR":     Object.assign(next, { x: 0.25, y: 0, z: 0.35, roll: 0, pitch: -75 }); break;
      case "FLOOR":        Object.assign(next, { x: 0.35, y: 0, z: 0.1,  roll: 0, pitch: -75 }); break;
      case "STORAGE":      Object.assign(next, { x: 0,    y: 0, z: 0.55, roll: 0, pitch: 100 }); break;
    }
    setPos(next);
  };

  return (
    <div className="flex flex-col h-full w-full overflow-visible md:overflow-hidden">
      {/* Título, presets y toggle */}
      <div className="flex-shrink-0 mb-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold">Arm Control Interface</h2>
          {/* NEW: Toggle de control remoto */}
          <button
            onClick={() => setRemoteControl((v) => !v)}
            className={`px-4 py-2 rounded-lg shadow font-semibold transition
              ${remoteControl ? "bg-green-600 hover:bg-green-500" : "bg-gray-600 hover:bg-gray-500"}`}
            title="Activa/Desactiva control por joystick (mensajes pose desde WS)"
          >
            {remoteControl ? "Joystick Control : ON" : "Joystick Control : OFF"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-3">
          {["HOME", "INTERMEDIATE", "PREFLOOR", "FLOOR", "STORAGE"].map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className="bg-cyan-600 hover:bg-cyan-500 px-4 py-2 rounded-lg shadow font-semibold transition"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Panel principal */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-visible md:overflow-hidden min-h-[calc(100vh-16rem)] md:min-h-0">
        {/* 3D */}
        <div className="bg-gray-800 p-4 rounded-2xl shadow-lg border border-gray-700 flex flex-col min-h-[350px] md:min-h-0">
          <h3 className="text-lg font-semibold mb-2 flex-shrink-0">Arm Visualization</h3>
          <div className="flex-1 overflow-hidden">
            <Arm3D q1={angles.q1} q2={angles.q2} q3={angles.q3} q4={angles.q4} />
          </div>
        </div>

        {/* Controles */}
        <div className="bg-gray-800 p-4 rounded-2xl shadow-lg border border-gray-700 flex flex-col overflow-y-auto md:overflow-hidden min-h-[400px] md:min-h-0">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-lg font-semibold">Inverse Kinematics</h3>
              {/* Indicador del estado del toggle */}
              <span className={`text-xs px-2 py-1 rounded-full ${remoteControl ? "bg-green-700 text-green-100" : "bg-gray-700 text-gray-200"}`}>
                {remoteControl ? "Pose from joystick" : "Only UI control"}
              </span>
            </div>

            {(["x", "y", "z", "roll", "pitch"] as (keyof Position)[]).map((axis) => (
              <div key={axis} className="flex items-center gap-3 mb-2">
                <label className="w-16 capitalize text-gray-300">{axis}</label>
                <input
                  type="number"
                  className="bg-gray-700 text-white px-2 py-1 w-28 rounded"
                  value={pos[axis]}
                  onChange={(e) => setPos({ ...pos, [axis]: parseFloat(e.target.value) || 0 })}
                />
                <div className="flex gap-2">
                  <button className="bg-blue-600 px-3 py-1 rounded hover:bg-blue-500 transition" onClick={() => adjustValue(axis, 0.05)}>+</button>
                  <button className="bg-cyan-500 px-3 py-1 rounded hover:bg-cyan-400 transition" onClick={() => adjustValue(axis, -0.05)}>-</button>
                </div>
              </div>
            ))}
          </div>

          {/* Gripper + Cámara */}
          <div className="space-y-4 mt-4">
            <div className="flex justify-center gap-4">
              <button
                className="bg-blue-600 px-4 py-2 rounded hover:bg-blue-500 transition select-none"
                onMouseDown={() => sendWS({ type: "gripper", data: -1 })}
                onMouseUp={() => sendWS({ type: "gripper", data: 0 })}
                onPointerDown={() => sendWS({ type: "gripper", data: -1 })}
                onPointerUp={() => sendWS({ type: "gripper", data: 0 })}
              >
                Close Gripper
              </button>
              <button
                className="bg-cyan-500 px-4 py-2 rounded hover:bg-cyan-400 transition select-none"
                onMouseDown={() => sendWS({ type: "gripper", data: 1 })}
                onMouseUp={() => sendWS({ type: "gripper", data: 0 })}
                onPointerDown={() => sendWS({ type: "gripper", data: 1 })}
                onPointerUp={() => sendWS({ type: "gripper", data: 0 })}
              >
                Open Gripper
              </button>
            </div>

            <div className="flex justify-center gap-4">
              <button className="bg-blue-600 px-4 py-2 rounded hover:bg-blue-500 transition" onClick={() => moveCamera(5)}>Camera +</button>
              <button className="bg-cyan-500 px-4 py-2 rounded hover:bg-cyan-400 transition" onClick={() => moveCamera(-5)}>Camera -</button>
            </div>
          </div>

          {/* Lectura */}
          <div className="mt-6 border-t border-gray-700 pt-3">
            <h4 className="text-sm font-semibold mb-2 text-gray-300">Joint Angles (°)</h4>
            <div className="grid grid-cols-2 gap-1 text-sm">
              {Object.entries(angles).map(([k, v]) => (
                <p key={k}>{k.toUpperCase()}: <span className="text-cyan-400">{v.toFixed(2)}</span></p>
              ))}
            </div>
            <p className="text-sm mt-2">Camera: <span className="text-cyan-400">{pos.joint8}</span>°</p>
          </div>
        </div>
      </div>
    </div>
  );
}
