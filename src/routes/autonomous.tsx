import React, { useState, useEffect, useRef } from "react";
import { autonomousService } from "../services/autonomousService";
import { Coordinates } from "../types/autonomous";

interface SavedPoint {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  timestamp: string;
}

const WS_URL = "ws://localhost:8000/ws/connection/lab";

const Autonomous: React.FC = () => {
  const [latitude, setLatitude] = useState<string>("");
  const [longitude, setLongitude] = useState<string>("");
  const [selectedState, setSelectedState] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [coordinatesSent, setCoordinatesSent] = useState(false);

  // GPS en vivo
  const [liveGps, setLiveGps] = useState<{ latitude: number; longitude: number } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Puntos guardados
  const [savedPoints, setSavedPoints] = useState<SavedPoint[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveLabel, setSaveLabel] = useState<string>("");
  const [pendingSaveCoords, setPendingSaveCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  // Historial enviado (original)
  const [coordinatesHistory, setCoordinatesHistory] = useState<Coordinates[]>([]);

  // ---------------------------------------------------------------
  // localStorage
  // ---------------------------------------------------------------
  useEffect(() => {
    const saved = localStorage.getItem("coordinates_history");
    if (saved) setCoordinatesHistory(JSON.parse(saved));

    const points = localStorage.getItem("saved_points");
    if (points) setSavedPoints(JSON.parse(points));
  }, []);

  useEffect(() => {
    if (coordinatesHistory.length > 0)
      localStorage.setItem("coordinates_history", JSON.stringify(coordinatesHistory));
  }, [coordinatesHistory]);

  useEffect(() => {
    localStorage.setItem("saved_points", JSON.stringify(savedPoints));
  }, [savedPoints]);

  // ---------------------------------------------------------------
  // WebSocket — GPS en vivo
  // ---------------------------------------------------------------
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "gps_data") {
            setLiveGps({ latitude: msg.data.latitude, longitude: msg.data.longitude });
          }
        } catch {}
      };

      ws.onclose = () => setTimeout(connect, 2000);
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

  // ---------------------------------------------------------------
  // Enviar coordenadas al rover
  // ---------------------------------------------------------------
  const handleSendCoordinates = async (lat: number, lon: number) => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await autonomousService.setInputTarget(lat, lon);
      if (result.status === "success") {
        setMessage({ type: "success", text: result.message });
        setCoordinatesSent(true);
        setCoordinatesHistory((prev) =>
          [{ latitude: lat, longitude: lon, timestamp: new Date().toISOString() }, ...prev].slice(0, 10)
        );
      } else {
        setMessage({ type: "error", text: result.message });
      }
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Error al enviar" });
    } finally {
      setLoading(false);
    }
  };

  const handleSetState = async () => {
    if (!coordinatesSent) {
      setMessage({ type: "error", text: "Primero debes enviar coordenadas" });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const result = await autonomousService.setInitState(selectedState);
      setMessage({ type: result.status === "success" ? "success" : "error", text: result.message });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Error" });
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------
  // Save point
  // ---------------------------------------------------------------
  const openSaveDialog = (lat: number, lon: number) => {
    setPendingSaveCoords({ latitude: lat, longitude: lon });
    setSaveLabel("");
    setShowSaveDialog(true);
  };

  const confirmSavePoint = () => {
    if (!saveLabel.trim()) {
      setMessage({ type: "error", text: "Asigna una etiqueta al punto" });
      return;
    }
    if (!pendingSaveCoords) return;

    const newPoint: SavedPoint = {
      id: crypto.randomUUID(),
      label: saveLabel.trim(),
      latitude: pendingSaveCoords.latitude,
      longitude: pendingSaveCoords.longitude,
      timestamp: new Date().toISOString(),
    };

    setSavedPoints((prev) => [newPoint, ...prev]);
    setShowSaveDialog(false);
    setMessage({ type: "success", text: `Punto "${newPoint.label}" guardado` });
  };

  const deletePoint = (id: string) => {
    setSavedPoints((prev) => prev.filter((p) => p.id !== id));
  };

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">Quantum Robotics — Autonomous Navigation</h2>

      {message && (
        <div className={`p-4 rounded-lg border ${
          message.type === "success"
            ? "bg-green-900/30 border-green-500 text-green-300"
            : "bg-red-900/30 border-red-500 text-red-300"
        }`}>
          {message.text}
        </div>
      )}

      {/* ── GPS en vivo ── */}
      <div className="bg-gray-800 p-5 rounded-lg flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-100 mb-1">📡 GPS en Vivo</h3>
          {liveGps ? (
            <p className="font-mono text-green-400 text-sm">
              Lat: {liveGps.latitude.toFixed(7)} &nbsp;|&nbsp; Lon: {liveGps.longitude.toFixed(7)}
            </p>
          ) : (
            <p className="text-gray-500 text-sm">Esperando señal GPS...</p>
          )}
        </div>
        <button
          onClick={() => liveGps && openSaveDialog(liveGps.latitude, liveGps.longitude)}
          disabled={!liveGps}
          className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
        >
          💾 Guardar posición actual
        </button>
      </div>

      {/* ── Grid: coordenadas manuales + modo navegación (original) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Agregar punto manual */}
        <div className="bg-gray-800 p-6 rounded-lg space-y-4">
          <h3 className="text-xl font-semibold text-gray-100">1. Agregar Punto Manual</h3>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Latitud</label>
            <input
              type="number" step="any" value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="Ej: 19.432608"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Longitud</label>
            <input
              type="number" step="any" value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="Ej: -99.133209"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
          </div>

          <button
            onClick={() => {
              const lat = parseFloat(latitude);
              const lon = parseFloat(longitude);
              if (isNaN(lat) || isNaN(lon)) {
                setMessage({ type: "error", text: "Ingresa coordenadas válidas" });
                return;
              }
              openSaveDialog(lat, lon);
            }}
            disabled={loading}
            className="w-full px-4 py-3 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            💾 Guardar como punto
          </button>
        </div>

        {/* Modo de navegación — original intacto */}
        <div className="bg-gray-800 p-6 rounded-lg space-y-4">
          <h3 className="text-xl font-semibold text-gray-100">2. Seleccionar Estado</h3>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Modo de Navegación</label>
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(Number(e.target.value))}
              disabled={!coordinatesSent || loading}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              <option value={0}>Point to Point</option>
              <option value={1}>Search Aruco</option>
            </select>
          </div>

          {!coordinatesSent && (
            <p className="text-sm text-yellow-400">
              ⚠️ Primero envía coordenadas para habilitar esta opción
            </p>
          )}

          <button
            onClick={handleSetState}
            disabled={!coordinatesSent || loading}
            className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            {loading ? "Aplicando..." : "Aplicar Estado"}
          </button>
        </div>
      </div>

      {/* ── Puntos guardados ── */}
      <div className="bg-gray-800 p-6 rounded-lg">
        <h3 className="text-xl font-semibold text-gray-100 mb-4">📍 Puntos Guardados</h3>

        {savedPoints.length === 0 ? (
          <p className="text-gray-500 text-sm">No hay puntos guardados aún.</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {savedPoints.map((point) => (
              <div key={point.id} className="flex items-center justify-between p-3 bg-gray-700 rounded-lg gap-4">
                <div className="flex-1 min-w-0">
                  <span className="text-white font-semibold block truncate">{point.label}</span>
                  <span className="text-gray-400 font-mono text-xs">
                    {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}
                  </span>
                </div>
                <div className="text-xs text-gray-500 shrink-0">
                  {new Date(point.timestamp).toLocaleString("es-MX", {
                    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                  })}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleSendCoordinates(point.latitude, point.longitude)}
                    disabled={loading}
                    className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded transition-colors"
                  >
                    Enviar
                  </button>
                  <button
                    onClick={() => deletePoint(point.id)}
                    className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal Save Point ── */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-600 rounded-xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <h4 className="text-lg font-semibold text-white">💾 Guardar Punto</h4>
            <p className="text-gray-400 font-mono text-sm">
              {pendingSaveCoords?.latitude.toFixed(7)}, {pendingSaveCoords?.longitude.toFixed(7)}
            </p>
            <input
              type="text"
              value={saveLabel}
              onChange={(e) => setSaveLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmSavePoint()}
              placeholder="Ej: Punto de inicio, Zona A..."
              autoFocus
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
            <div className="flex gap-3">
              <button
                onClick={confirmSavePoint}
                className="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold rounded-lg transition-colors"
              >
                Guardar
              </button>
              <button
                onClick={() => setShowSaveDialog(false)}
                className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Autonomous;