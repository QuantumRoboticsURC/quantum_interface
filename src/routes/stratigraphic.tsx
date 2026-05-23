import React, { useState, useEffect, useRef } from "react";

type CameraInfo = { id: number; label: string; stereo?: boolean };

type CapturedImage = {
  src: string;
  width: number;
  height: number;
  stereo: boolean;
  takenAt: number;
};

const Strat: React.FC = () => {
  const [frame, setFrame] = useState<string | null>(null);
  const [captured, setCaptured] = useState<CapturedImage | null>(null);
  const [connected, setConnected] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraLabel, setCameraLabel] = useState<string>("ZED 2i");

  const wsRef = useRef<WebSocket | null>(null);
  const selectedCameraIdRef = useRef<number | null>(null);

  useEffect(() => {
    const wsUrl =
      `${window.location.protocol === "https:" ? "wss" : "ws"}://` +
      `192.168.1.3:8001/ws/connection/camera`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Ask for the camera list — we'll lock onto the stereo (ZED) camera.
      ws.send(JSON.stringify({ type: "get_cameras" }));
    };

    ws.onclose = () => {
      setConnected(false);
      setFrame(null);
    };

    ws.onerror = () => setConnected(false);

    ws.onmessage = (e) => {
      if (typeof e.data !== "string") return;
      let msg: any;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }

      if (msg.type === "cameras" && Array.isArray(msg.data)) {
        const cams: CameraInfo[] = msg.data;
        // Prefer a stereo camera (ZED 2i); fall back to first available.
        const zed = cams.find((c) => c.stereo) ?? cams[0];
        if (zed && selectedCameraIdRef.current !== zed.id) {
          selectedCameraIdRef.current = zed.id;
          setCameraLabel(zed.label || "ZED 2i");
          ws.send(
            JSON.stringify({
              type: "config",
              camera_id: zed.id,
              quality: 60,
            }),
          );
        } else if (!zed) {
          setError("No camera detected on the bridge");
        }
      } else if (msg.type === "frame" && msg.data) {
        setFrame(`data:image/jpeg;base64,${msg.data}`);
      } else if (msg.type === "capture" && msg.data) {
        setCaptured({
          src: `data:image/jpeg;base64,${msg.data}`,
          width: msg.width ?? 0,
          height: msg.height ?? 0,
          stereo: !!msg.stereo,
          takenAt: Date.now(),
        });
        setCapturing(false);
        setError(null);
      } else if (msg.type === "capture_error") {
        setCapturing(false);
        setError(msg.message || "Capture failed");
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const requestCapture = () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError("Not connected to bridge");
      return;
    }
    if (selectedCameraIdRef.current == null) {
      setError("Camera not selected yet");
      return;
    }
    setError(null);
    setCapturing(true);
    ws.send(JSON.stringify({ type: "capture" }));
  };

  const resumeLive = () => {
    setCaptured(null);
    setError(null);
  };

  const downloadCapture = () => {
    if (!captured) return;
    const a = document.createElement("a");
    a.href = captured.src;
    const stamp = new Date(captured.takenAt)
      .toISOString()
      .replace(/[:.]/g, "-");
    a.download = `panorama_${stamp}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const isCaptured = captured !== null;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Stratigraphic Profile</h2>
          <span className="flex items-center gap-1.5 text-xs text-gray-300 bg-gray-700 px-2 py-0.5 rounded-full">
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? "bg-green-400" : "bg-red-400"
              }`}
            />
            {connected ? cameraLabel : "Disconnected"}
          </span>
          {isCaptured && (
            <span className="text-xs text-amber-300 bg-amber-900/40 border border-amber-700 px-2 py-0.5 rounded-full">
              Frozen capture
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
                ${
                  !connected || capturing
                    ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                    : "bg-amber-600 hover:bg-amber-500 text-white"
                }`}
            >
              {capturing ? "Capturing…" : "Capture Panorama"}
            </button>
          )}
        </div>
      </div>

      {/* Video container — mirrors the camera view style */}
      <div className="flex-1 min-h-0 bg-gray-800 rounded-2xl shadow-lg border border-gray-700 p-2 overflow-hidden">
        <div className="relative w-full h-full bg-black rounded-xl overflow-hidden flex items-center justify-center">
          {isCaptured ? (
            <img
              src={captured!.src}
              alt="Captured panorama"
              className="max-w-full max-h-full object-contain"
            />
          ) : frame ? (
            <img
              src={frame}
              alt="ZED 2i live feed"
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <div className="text-gray-500 text-sm">
              {connected ? "Waiting for frames…" : "Disconnected"}
            </div>
          )}

          {/* Overlay label */}
          <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-md px-2 py-1 text-xs text-white font-semibold">
            {isCaptured
              ? `Panorama · ${captured!.width}×${captured!.height}`
              : cameraLabel}
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
