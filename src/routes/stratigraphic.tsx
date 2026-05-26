import React, { useState, useEffect, useRef, useCallback } from "react";

// ⚠️ AJUSTA esta ruta a tu endpoint de telemetría (el que registra los callbacks
//    de ros2_bridge.py y emite {"type":"imu_data","data":{"yaw":...}}).
//    El de cámara es OTRO socket distinto.
const IMU_WS_PATH = "/ws/connection/move";
const BRIDGE_HOST = "192.168.1.3:8001";

type CameraInfo = { id: number; label: string; stereo?: boolean };

type CapturedImage = {
  src: string;
  width: number;
  height: number;
  stereo: boolean;
  takenAt: number;
  heading: number; // snapshot del yaw en el instante de la captura
};

// ---------------------------------------------------------------
// Costura: imagen izquierda intacta + franja del borde derecho. Sin blend.
// ---------------------------------------------------------------
function stitchStereoFrame(imgSrc: string, newStripPct = 0.10): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const fw = img.naturalWidth;
      const fh = img.naturalHeight;
      const hw = Math.floor(fw / 2);

      const stripW = Math.round(hw * newStripPct);
      const outW = hw + stripW;
      const outH = fh;

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d")!;

      // Imagen IZQUIERDA completa, sin tocar.
      ctx.drawImage(img, 0, 0, hw, fh, 0, 0, hw, fh);
      // Franja del borde derecho de la imagen DERECHA.
      const srcX = fw - stripW;
      ctx.drawImage(img, srcX, 0, stripW, fh, hw, 0, stripW, fh);

      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = imgSrc;
  });
}

// ---------------------------------------------------------------
// Helper: rumbo (grados CW desde el Norte) → cardinal aproximado
// ---------------------------------------------------------------
function bearingToCardinal(bearing: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(bearing / 45) % 8];
}

// ---------------------------------------------------------------
// Rosa de los Vientos (estilo brújula de avión: disco gira, aguja fija)
// ---------------------------------------------------------------
const CompassRose: React.FC<{ yaw: number; frozen: boolean }> = ({ yaw, frozen }) => {
  // yaw 0 = Este → rotación = yaw - 90 (deriva: bearing = (90 - yaw) mod 360)
  const rotation = yaw - 90;
  const bearing = ((90 - yaw) % 360 + 360) % 360;
  const cardinal = bearingToCardinal(bearing);

  const ticks = Array.from({ length: 12 }, (_, i) => i * 30);
  const pt = (deg: number, r: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: 50 + r * Math.sin(rad), y: 50 - r * Math.cos(rad) };
  };
  const cardinals = [
    { label: "N", deg: 0, color: "#fbbf24" },
    { label: "E", deg: 90, color: "#e5e7eb" },
    { label: "S", deg: 180, color: "#e5e7eb" },
    { label: "W", deg: 270, color: "#e5e7eb" },
  ];

  return (
    <div className="absolute top-3 right-3 z-20 pointer-events-none select-none">
      <div className="relative w-28 h-28">
        {/* Capa que ROTA: ticks + letras cardinales */}
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: frozen ? "none" : "transform 0.12s linear",
          }}
        >
          {ticks.map((deg) => {
            const major = deg % 90 === 0;
            const a = pt(deg, 40);
            const b = pt(deg, major ? 33 : 36);
            return (
              <line
                key={deg}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={major ? "#9ca3af" : "#4b5563"}
                strokeWidth={major ? 1.4 : 0.8}
              />
            );
          })}
          {cardinals.map((c) => {
            const p = pt(c.deg, 24);
            return (
              <text
                key={c.label}
                x={p.x} y={p.y}
                fill={c.color}
                fontSize="11"
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {c.label}
              </text>
            );
          })}
        </svg>

        {/* Capa FIJA: disco, anillo, aguja a las 12, lectura */}
        <svg viewBox="0 0 100 100" className="absolute inset-0">
          <circle cx="50" cy="50" r="46" fill="rgba(17,24,39,0.55)" />
          <circle cx="50" cy="50" r="46" fill="none" stroke="#374151" strokeWidth="1.5" />
          {/* Aguja fija (apunta hacia adelante, 12 en punto) */}
          <polygon points="50,6 46,17 54,17" fill="#f59e0b" />
          <circle cx="50" cy="50" r="2" fill="#6b7280" />
          {/* Lectura de rumbo (no rota) */}
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

const Strat: React.FC = () => {
  const [frame, setFrame] = useState<string | null>(null);
  const [captured, setCaptured] = useState<CapturedImage | null>(null);
  const [connected, setConnected] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraLabel, setCameraLabel] = useState<string>("ZED 2i");
  const [stitching, setStitching] = useState(false);
  const [newStripPct, setNewStripPct] = useState(0.10);

  // Yaw en vivo (estado para repintar la brújula)
  const [liveYaw, setLiveYaw] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const imuWsRef = useRef<WebSocket | null>(null);
  const selectedCameraIdRef = useRef<number | null>(null);
  const pendingRawRef = useRef<string | null>(null);
  const newStripPctRef = useRef(newStripPct);
  const yawRef = useRef(0); // valor fresco para el snapshot, evita stale closure

  // Mantener el ref del slider sincronizado sin reconectar sockets
  useEffect(() => {
    newStripPctRef.current = newStripPct;
  }, [newStripPct]);

  const restitch = useCallback(
    async (rawSrc: string) => {
      try {
        setStitching(true);
        const stitched = await stitchStereoFrame(rawSrc, newStripPct);
        const img = new Image();
        img.onload = () => {
          setCaptured((prev) =>
            prev ? { ...prev, src: stitched, width: img.naturalWidth, height: img.naturalHeight } : prev
          );
          setStitching(false);
        };
        img.src = stitched;
      } catch {
        setStitching(false);
      }
    },
    [newStripPct]
  );

  useEffect(() => {
    if (pendingRawRef.current && captured) {
      restitch(pendingRawRef.current);
    }
  }, [newStripPct, restitch, captured]);

  // ---------------------------------------------------------------
  // WebSocket de CÁMARA (conecta una sola vez)
  // ---------------------------------------------------------------
  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${BRIDGE_HOST}/ws/connection/camera`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: "get_cameras" }));
    };
    ws.onclose = () => {
      setConnected(false);
      setFrame(null);
    };
    ws.onerror = () => setConnected(false);

    ws.onmessage = async (e) => {
      if (typeof e.data !== "string") return;
      let msg: any;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }

      if (msg.type === "cameras" && Array.isArray(msg.data)) {
        const cams: CameraInfo[] = msg.data;
        const zed = cams.find((c) => c.stereo) ?? cams[0];
        if (zed && selectedCameraIdRef.current !== zed.id) {
          selectedCameraIdRef.current = zed.id;
          setCameraLabel(zed.label || "ZED 2i");
          ws.send(JSON.stringify({ type: "config", camera_id: zed.id, quality: 60 }));
        } else if (!zed) {
          setError("No camera detected on the bridge");
        }
      } else if (msg.type === "frame" && msg.data) {
        // Live: RAW side-by-side directo, sin procesar (rendimiento).
        setFrame(`data:image/jpeg;base64,${msg.data}`);
      } else if (msg.type === "capture" && msg.data) {
        const raw = `data:image/jpeg;base64,${msg.data}`;
        pendingRawRef.current = raw;
        const headingSnapshot = yawRef.current; // snapshot exacto del instante
        try {
          const stitched = await stitchStereoFrame(raw, newStripPctRef.current);
          const img = new Image();
          img.onload = () => {
            setCaptured({
              src: stitched,
              width: img.naturalWidth,
              height: img.naturalHeight,
              stereo: !!msg.stereo,
              takenAt: Date.now(),
              heading: headingSnapshot,
            });
            setCapturing(false);
            setError(null);
          };
          img.src = stitched;
        } catch {
          setCapturing(false);
          setError("Stitch failed — showing raw capture");
          setCaptured({
            src: raw,
            width: msg.width ?? 0,
            height: msg.height ?? 0,
            stereo: !!msg.stereo,
            takenAt: Date.now(),
            heading: headingSnapshot,
          });
        }
      } else if (msg.type === "capture_error") {
        setCapturing(false);
        setError(msg.message || "Capture failed");
      }
    };

    return () => ws.close();
  }, []); // ← conecta una vez; el slider ya no reconecta

  // ---------------------------------------------------------------
  // WebSocket de IMU/telemetría (separado del de cámara)
  // ---------------------------------------------------------------
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
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        if (msg.type === "imu_data" && msg.data && typeof msg.data.yaw === "number") {
          yawRef.current = msg.data.yaw; // valor fresco (sin stale closure)
          setLiveYaw(msg.data.yaw);      // repinta la brújula en vivo
        }
      };
      ws.onclose = () => {
        if (!stop) retry = setTimeout(connect, 2000); // reconexión suave
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      stop = true;
      clearTimeout(retry);
      imuWsRef.current?.close();
    };
  }, []);

  const requestCapture = () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) { setError("Not connected to bridge"); return; }
    if (selectedCameraIdRef.current == null) { setError("Camera not selected yet"); return; }
    setError(null);
    setCapturing(true);
    ws.send(JSON.stringify({ type: "capture" }));
  };

  const resumeLive = () => {
    setCaptured(null);
    pendingRawRef.current = null;
    setError(null);
  };

  const downloadCapture = () => {
    if (!captured) return;
    const a = document.createElement("a");
    a.href = captured.src;
    const stamp = new Date(captured.takenAt).toISOString().replace(/[:.]/g, "-");
    a.download = `panorama_${stamp}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const isCaptured = captured !== null;
  // Congelada → heading guardado; en vivo → yaw del sensor.
  const displayYaw = isCaptured ? captured!.heading : liveYaw;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Stratigraphic Profile</h2>
          <span className="flex items-center gap-1.5 text-xs text-gray-300 bg-gray-700 px-2 py-0.5 rounded-full">
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
            {connected ? cameraLabel : "Disconnected"}
          </span>
          {isCaptured && (
            <span className="text-xs text-amber-300 bg-amber-900/40 border border-amber-700 px-2 py-0.5 rounded-full">
              Panorama capturada · {Math.round(((90 - captured!.heading) % 360 + 360) % 360)}°
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
              <button
                onClick={downloadCapture}
                className="text-xs font-semibold text-white bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg transition"
              >
                Download
              </button>
              <button
                onClick={resumeLive}
                className="text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 px-4 py-1.5 rounded-lg transition"
              >
                Resume Live
              </button>
            </>
          ) : (
            <button
              onClick={requestCapture}
              disabled={!connected || capturing}
              className={`text-xs font-semibold px-4 py-1.5 rounded-lg transition flex items-center gap-1
                ${!connected || capturing
                  ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                  : "bg-amber-600 hover:bg-amber-500 text-white"}`}
            >
              {capturing ? "Capturing…" : "Capture Panorama"}
            </button>
          )}
        </div>
      </div>

      {/* Slider de la franja — al congelar */}
      {isCaptured && pendingRawRef.current && (
        <div className="flex items-center gap-3 mb-2 flex-shrink-0 bg-gray-800 rounded-xl px-4 py-2">
          <span className="text-xs text-gray-400 whitespace-nowrap">Franja derecha añadida</span>
          <input
            type="range" min={2} max={30} step={1}
            value={Math.round(newStripPct * 100)}
            onChange={(ev) => setNewStripPct(Number(ev.target.value) / 100)}
            className="flex-1 accent-amber-500"
          />
          <span className="text-xs text-amber-300 w-8 text-right">{Math.round(newStripPct * 100)}%</span>
        </div>
      )}

      {/* Contenedor de video */}
      <div className="flex-1 min-h-0 bg-gray-800 rounded-2xl shadow-lg border border-gray-700 p-2 overflow-hidden">
        <div className="relative w-full h-full bg-black rounded-xl overflow-hidden flex items-center justify-center">
          {isCaptured ? (
            <img src={captured!.src} alt="Panorama cosida" className="max-w-full max-h-full object-contain" />
          ) : frame ? (
            <img src={frame} alt="ZED 2i live (raw SBS)" className="max-w-full max-h-full object-contain" />
          ) : (
            <div className="text-gray-500 text-sm">
              {connected ? "Waiting for frames…" : "Disconnected"}
            </div>
          )}

          {/* Brújula superpuesta (esquina superior derecha) */}
          <CompassRose yaw={displayYaw} frozen={isCaptured} />

          {/* Etiqueta inferior izquierda */}
          <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-md px-2 py-1 text-xs text-white font-semibold">
            {isCaptured
              ? `Panorama · ${captured!.width}×${captured!.height}`
              : `${cameraLabel} · Live Raw`}
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
};

export default Strat;
