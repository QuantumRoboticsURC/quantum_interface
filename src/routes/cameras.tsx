import React, { useState, useEffect, useRef } from "react";

type CameraInfo = { id: number; label: string };

type CameraPanel = {
  panelId: number;
  cameraId: number;
  quality: number;
};

const QUALITY_PRESETS = [
  { label: "Low", value: 15 },
  { label: "Med", value: 40 },
  { label: "High", value: 70 },
  { label: "Max", value: 95 },
];

// Each camera panel gets its own WebSocket connection
function CameraView({
  panel,
  availableCameras,
  onChangeCamera,
  onChangeQuality,
  onRemove,
}: {
  panel: CameraPanel;
  availableCameras: CameraInfo[];
  onChangeCamera: (cameraId: number) => void;
  onChangeQuality: (quality: number) => void;
  onRemove: () => void;
}) {
  const [frame, setFrame] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [fps, setFps] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const fpsCounterRef = useRef(0);
  const fpsTimerRef = useRef<number | null>(null);

  // WebSocket per panel
  useEffect(() => {
    const wsUrl =
      `${window.location.protocol === "https:" ? "wss" : "ws"}://` +
      `${window.location.hostname}:8000/ws/connection/camera`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: "config", camera_id: panel.cameraId, quality: panel.quality }));
    };
    ws.onclose = () => { setConnected(false); setFrame(null); };
    ws.onerror = () => setConnected(false);
    ws.onmessage = (e) => {
      if (typeof e.data === "string") {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "frame" && msg.data) {
            setFrame(`data:image/jpeg;base64,${msg.data}`);
            fpsCounterRef.current++;
          }
        } catch { /* ignore */ }
      } else if (e.data instanceof Blob) {
        setFrame(URL.createObjectURL(e.data));
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

  // Send config updates
  useEffect(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "config", camera_id: panel.cameraId, quality: panel.quality }));
    }
  }, [panel.cameraId, panel.quality]);

  const currentCam = availableCameras.find((c) => c.id === panel.cameraId);

  return (
    <div className="bg-gray-800 rounded-2xl shadow-lg border border-gray-700 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
          <select
            value={panel.cameraId}
            onChange={(e) => onChangeCamera(parseInt(e.target.value))}
            className="bg-gray-700 text-white text-xs rounded px-2 py-1 font-semibold"
          >
            {availableCameras.map((cam) => (
              <option key={cam.id} value={cam.id}>{cam.label}</option>
            ))}
            {availableCameras.length === 0 && (
              <option value={panel.cameraId}>Camera {panel.cameraId}</option>
            )}
          </select>
          <span className="text-[10px] text-gray-400">{fps} FPS</span>
        </div>
        <div className="flex items-center gap-1">
          {QUALITY_PRESETS.map((q) => (
            <button key={q.value} onClick={() => onChangeQuality(q.value)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition
                ${panel.quality === q.value ? "bg-amber-600 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}>
              {q.label}
            </button>
          ))}
          <button onClick={onRemove}
            className="ml-2 bg-red-600/80 hover:bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition"
            title="Remove camera">
            ✕
          </button>
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 px-2 pb-2 min-h-0 overflow-hidden">
        <div className="relative w-full h-full bg-black rounded-xl overflow-hidden flex items-center justify-center">
          {frame ? (
            <img src={frame} alt="Camera feed" className="max-w-full max-h-full object-contain" />
          ) : (
            <div className="text-gray-500 text-sm flex flex-col items-center gap-2">
              <span className="text-3xl">📷</span>
              <span>{connected ? "Waiting for frames..." : "Disconnected"}</span>
            </div>
          )}
          {currentCam && (
            <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-md px-2 py-1 text-xs text-white font-semibold">
              {currentCam.label}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const Cameras: React.FC = () => {
  const [panels, setPanels] = useState<CameraPanel[]>([]);
  const [availableCameras, setAvailableCameras] = useState<CameraInfo[]>([]);
  const [nextPanelId, setNextPanelId] = useState(1);
  const discoveryWsRef = useRef<WebSocket | null>(null);

  // Discovery WebSocket — just to get camera list
  useEffect(() => {
    const wsUrl =
      `${window.location.protocol === "https:" ? "wss" : "ws"}://` +
      `${window.location.hostname}:8000/ws/camera`;
    const ws = new WebSocket(wsUrl);
    discoveryWsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "get_cameras" }));
    };
    ws.onmessage = (e) => {
      if (typeof e.data === "string") {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "cameras" && Array.isArray(msg.data)) {
            console.log("📷 Available cameras:", msg.data);
            setAvailableCameras(msg.data);
          }
        } catch { /* ignore */ }
      }
    };
    ws.onclose = () => {};

    return () => ws.close();
  }, []);

  const refreshCameras = () => {
    const ws = discoveryWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "get_cameras" }));
    }
  };

  const addPanel = () => {
    // Default to first available camera, or 0
    const defaultCamId = availableCameras.length > 0 ? availableCameras[0].id : 0;
    setPanels((prev) => [...prev, { panelId: nextPanelId, cameraId: defaultCamId, quality: 40 }]);
    setNextPanelId((n) => n + 1);
  };

  const removePanel = (panelId: number) => {
    setPanels((prev) => prev.filter((p) => p.panelId !== panelId));
  };

  const updatePanel = (panelId: number, updates: Partial<CameraPanel>) => {
    setPanels((prev) =>
      prev.map((p) => (p.panelId === panelId ? { ...p, ...updates } : p))
    );
  };

  // Grid columns based on number of panels
  const getGridCols = () => {
    const count = panels.length;
    if (count <= 1) return "grid-cols-1";
    if (count <= 2) return "grid-cols-1 md:grid-cols-2";
    if (count <= 4) return "grid-cols-1 md:grid-cols-2";
    if (count <= 6) return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
    return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  };

  // Row height based on count
  const getPanelHeight = () => {
    const count = panels.length;
    if (count <= 2) return "calc(100vh - 120px)";
    if (count <= 4) return "calc(50vh - 70px)";
    if (count <= 6) return "calc(50vh - 70px)";
    return "calc(33vh - 55px)";
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Cameras</h2>
          <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded-full">
            {availableCameras.length} available
          </span>
          <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded-full">
            {panels.length} active
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshCameras}
            className="text-xs text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg transition">
            🔄 Refresh
          </button>
          <button onClick={addPanel}
            className="text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 px-4 py-1.5 rounded-lg transition flex items-center gap-1">
            + Add Camera
          </button>
        </div>
      </div>

      {/* Camera grid */}
      {panels.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-4">
          <span className="text-6xl">📷</span>
          <p className="text-lg">No cameras added</p>
          <p className="text-sm text-gray-600">
            {availableCameras.length > 0
              ? `${availableCameras.length} camera${availableCameras.length > 1 ? "s" : ""} detected — click "Add Camera" to start viewing`
              : "No cameras detected — connect a camera and click Refresh"}
          </p>
          <button onClick={addPanel}
            className="text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-500 px-6 py-2 rounded-lg transition">
            + Add Camera
          </button>
        </div>
      ) : (
        <div className={`flex-1 grid ${getGridCols()} gap-3 min-h-0 overflow-auto`}>
          {panels.map((panel) => (
            <div key={panel.panelId} style={{ height: getPanelHeight(), minHeight: "200px" }}>
              <CameraView
                panel={panel}
                availableCameras={availableCameras}
                onChangeCamera={(cameraId) => updatePanel(panel.panelId, { cameraId })}
                onChangeQuality={(quality) => updatePanel(panel.panelId, { quality })}
                onRemove={() => removePanel(panel.panelId)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Cameras;