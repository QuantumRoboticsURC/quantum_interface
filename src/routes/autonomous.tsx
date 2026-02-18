// src/components/Autonomous.tsx
import React, { useState, useEffect } from "react";
import { autonomousService } from "../services/autonomousService";
import { Coordinates } from "../types/autonomous";

const Autonomous: React.FC = () => {
  const [latitude, setLatitude] = useState<string>("");
  const [longitude, setLongitude] = useState<string>("");
  const [selectedState, setSelectedState] = useState<number>(0);
  const [coordinatesHistory, setCoordinatesHistory] = useState<Coordinates[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [coordinatesSent, setCoordinatesSent] = useState(false);

  // Cargar historial del localStorage al montar
  useEffect(() => {
    const saved = localStorage.getItem('coordinates_history');
    if (saved) {
      setCoordinatesHistory(JSON.parse(saved));
    }
  }, []);

  // Guardar historial en localStorage cuando cambie
  useEffect(() => {
    if (coordinatesHistory.length > 0) {
      localStorage.setItem('coordinates_history', JSON.stringify(coordinatesHistory));
    }
  }, [coordinatesHistory]);

  const handleSendCoordinates = async () => {
    if (!latitude || !longitude) {
      setMessage({ type: 'error', text: 'Por favor ingresa latitud y longitud' });
      return;
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lon)) {
      setMessage({ type: 'error', text: 'Las coordenadas deben ser números válidos' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const result = await autonomousService.setInputTarget(lat, lon);
      
      if (result.status === 'success') {
        setMessage({ type: 'success', text: result.message });
        setCoordinatesSent(true);

        // Agregar al historial
        const newCoordinate: Coordinates = {
          latitude: lat,
          longitude: lon,
          timestamp: new Date().toISOString(),
        };
        setCoordinatesHistory(prev => [newCoordinate, ...prev].slice(0, 10)); // Mantener solo las últimas 10
      } else {
        setMessage({ type: 'error', text: result.message });
      }
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Error al enviar coordenadas' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSetState = async () => {
    if (!coordinatesSent) {
      setMessage({ type: 'error', text: 'Primero debes enviar coordenadas' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const result = await autonomousService.setInitState(selectedState);
      
      if (result.status === 'success') {
        setMessage({ type: 'success', text: result.message });
      } else {
        setMessage({ type: 'error', text: result.message });
      }
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Error al cambiar estado' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFromHistory = (coords: Coordinates) => {
    setLatitude(coords.latitude.toString());
    setLongitude(coords.longitude.toString());
  };

  const handleClearHistory = () => {
    setCoordinatesHistory([]);
    localStorage.removeItem('coordinates_history');
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Quantum Robotics - Autonomous Navigation</h2>
      
      {/* Mensajes de estado */}
      {message && (
        <div className={`mb-4 p-4 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-900/30 border border-green-500 text-green-300' 
            : 'bg-red-900/30 border border-red-500 text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel de entrada de coordenadas */}
        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-xl font-semibold mb-4 text-gray-100">
            1. Enviar Coordenadas
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Latitud
              </label>
              <input
                type="number"
                step="any"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="Ej: 19.432608"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Longitud
              </label>
              <input
                type="number"
                step="any"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="Ej: -99.133209"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
            </div>

            <button
              onClick={handleSendCoordinates}
              disabled={loading}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              {loading ? 'Enviando...' : 'Enviar Coordenadas'}
            </button>
          </div>
        </div>

        {/* Panel de selección de estado */}
        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-xl font-semibold mb-4 text-gray-100">
            2. Seleccionar Estado
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Modo de Navegación
              </label>
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
              {loading ? 'Aplicando...' : 'Aplicar Estado'}
            </button>
          </div>
        </div>
      </div>

      {/* Historial de coordenadas */}
      {coordinatesHistory.length > 0 && (
        <div className="mt-6 bg-gray-800 p-6 rounded-lg">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-gray-100">
              Historial de Coordenadas
            </h3>
            <button
              onClick={handleClearHistory}
              className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
            >
              Limpiar Historial
            </button>
          </div>
          
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {coordinatesHistory.map((coords, index) => (
              <div
                key={index}
                onClick={() => handleSelectFromHistory(coords)}
                className="flex justify-between items-center p-3 bg-gray-700 hover:bg-gray-600 rounded-lg cursor-pointer transition-colors"
              >
                <div className="flex-1">
                  <span className="text-white font-mono">
                    Lat: {coords.latitude.toFixed(6)}, Lon: {coords.longitude.toFixed(6)}
                  </span>
                </div>
                <div className="text-sm text-gray-400">
                  {new Date(coords.timestamp).toLocaleString('es-MX', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Autonomous;