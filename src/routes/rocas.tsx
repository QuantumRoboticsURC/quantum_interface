import React, { useState, useMemo } from "react";
import { ROCKS, type Rock } from "../services/rocks";

// Where the extracted images live (copy /public/rocks into your app's public dir).
const IMG_BASE = "/rocks";

const TIPO_STYLES: Record<string, string> = {
  "Ígnea": "bg-rose-600/80 text-white",
  "Sedimentaria": "bg-amber-600/80 text-white",
  "Metamórfica": "bg-cyan-600/80 text-white",
};

const TIPOS = ["Todas", "Ígnea", "Sedimentaria", "Metamórfica"] as const;
type TipoFilter = (typeof TIPOS)[number];

function TipoBadge({ tipo }: { tipo: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
        TIPO_STYLES[tipo] ?? "bg-gray-600 text-white"
      }`}
    >
      {tipo}
    </span>
  );
}

function RockCard({ rock, onOpen }: { rock: Rock; onOpen: (r: Rock) => void }) {
  const [errored, setErrored] = useState(false);
  const hasImg = rock.imagen && !errored;

  return (
    <button
      onClick={() => onOpen(rock)}
      className="group bg-gray-800 rounded-2xl shadow-lg border border-gray-700 overflow-hidden flex flex-col text-left hover:border-cyan-500/60 hover:shadow-cyan-500/10 transition focus:outline-none focus:ring-2 focus:ring-cyan-500"
    >
      {/* Image */}
      <div className="relative aspect-[4/3] bg-black overflow-hidden flex items-center justify-center">
        {hasImg ? (
          <img
            src={`${IMG_BASE}/${rock.imagen}`}
            alt={rock.nombre}
            loading="lazy"
            onError={() => setErrored(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="text-gray-600 text-xs flex flex-col items-center gap-1">
            <span className="text-2xl">🪨</span>
            <span>Sin imagen</span>
          </div>
        )}
        <div className="absolute top-2 left-2">
          <TipoBadge tipo={rock.tipo} />
        </div>
        {rock.imagenes.length > 1 && (
          <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm rounded-md px-1.5 py-0.5 text-[10px] text-white">
            +{rock.imagenes.length - 1}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <h3 className="font-bold text-white text-sm leading-tight">
          {rock.nombre}
        </h3>
        <p className="text-[11px] text-gray-500 italic leading-tight">
          {rock.nombreEn}
        </p>
        <p className="text-[11px] text-gray-400">
          {rock.subclasificacion} · {rock.granulosidad}
        </p>
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="text-[10px] text-gray-500">Dureza</span>
          <span className="text-[11px] font-semibold text-amber-400">
            {rock.dureza}
          </span>
        </div>
      </div>
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-gray-500">
        {label}
      </span>
      <span className="text-sm text-gray-200">{value}</span>
    </div>
  );
}

function Chips({ items, color }: { items: string[]; color: string }) {
  if (!items.length) return <span className="text-sm text-gray-500">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((it) => (
        <span
          key={it}
          className={`px-1.5 py-0.5 rounded text-[11px] ${color}`}
        >
          {it}
        </span>
      ))}
    </div>
  );
}

function RockModal({ rock, onClose }: { rock: Rock; onClose: () => void }) {
  const [active, setActive] = useState(0);
  const imgs = rock.imagenes;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 w-full max-w-3xl max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 sticky top-0 bg-gray-800 z-10">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-xl font-bold text-white leading-tight">{rock.nombre}</h2>
              <p className="text-xs text-gray-400 italic">{rock.nombreEn}</p>
            </div>
            <TipoBadge tipo={rock.tipo} />
          </div>
          <button
            onClick={onClose}
            className="bg-red-600/80 hover:bg-red-500 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition"
            title="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Images */}
          <div className="flex flex-col gap-2">
            <div className="aspect-[4/3] bg-black rounded-xl overflow-hidden flex items-center justify-center">
              {imgs.length ? (
                <img
                  src={`${IMG_BASE}/${imgs[active]}`}
                  alt={rock.nombre}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-gray-600 text-sm flex flex-col items-center gap-1">
                  <span className="text-3xl">🪨</span>
                  <span>Sin imagen disponible</span>
                </div>
              )}
            </div>
            {imgs.length > 1 && (
              <div className="flex gap-2">
                {imgs.map((im, i) => (
                  <button
                    key={im}
                    onClick={() => setActive(i)}
                    className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition ${
                      i === active ? "border-cyan-500" : "border-gray-700"
                    }`}
                  >
                    <img
                      src={`${IMG_BASE}/${im}`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Properties */}
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <DetailRow label="Subclasificación" value={rock.subclasificacion} />
              <DetailRow label="Granulosidad" value={rock.granulosidad} />
              <DetailRow
                label="Dureza (Mohs)"
                value={<span className="text-amber-400 font-semibold">{rock.dureza}</span>}
              />
            </div>
            <DetailRow
              label="Mineral principal"
              value={<Chips items={rock.mineralPrincipal} color="bg-cyan-900/60 text-cyan-200" />}
            />
            <DetailRow
              label="Mineral secundario"
              value={<Chips items={rock.mineralSecundario} color="bg-gray-700 text-gray-300" />}
            />
            <DetailRow
              label="Color"
              value={<Chips items={rock.color} color="bg-gray-700 text-gray-300" />}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const Rocas: React.FC = () => {
  const [query, setQuery] = useState("");
  const [tipo, setTipo] = useState<TipoFilter>("Todas");
  const [selected, setSelected] = useState<Rock | null>(null);

  const filtered = useMemo(() => {
    const q = query
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""); // accent-insensitive search

    return ROCKS.filter((r) => {
      if (tipo !== "Todas" && r.tipo !== tipo) return false;
      if (!q) return true;
      const haystack = [
        r.nombre,
        r.nombreEn,
        r.tipo,
        r.subclasificacion,
        r.granulosidad,
        ...r.mineralPrincipal,
        ...r.mineralSecundario,
        ...r.color,
      ]
        .join(" ")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      return haystack.includes(q);
    });
  }, [query, tipo]);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Base de Rocas</h2>
          <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded-full">
            {filtered.length} / {ROCKS.length}
          </span>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
            🔍
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, mineral, color…"
            className="w-full bg-gray-700 text-white text-sm rounded-lg pl-9 pr-8 py-2 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-sm"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Type filters */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        {TIPOS.map((t) => (
          <button
            key={t}
            onClick={() => setTipo(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              tipo === t
                ? "bg-cyan-600 text-white"
                : "bg-gray-700 text-gray-400 hover:bg-gray-600"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-2">
          <span className="text-4xl">🪨</span>
          <p className="text-lg">Sin resultados</p>
          <p className="text-sm text-gray-600">
            Prueba con otro nombre, mineral o color.
          </p>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 min-h-0 overflow-auto pb-4">
          {filtered.map((rock) => (
            <RockCard key={rock.id} rock={rock} onOpen={setSelected} />
          ))}
        </div>
      )}

      {selected && <RockModal rock={selected} onClose={() => setSelected(null)} />}
    </div>
  );
};

export default Rocas;
