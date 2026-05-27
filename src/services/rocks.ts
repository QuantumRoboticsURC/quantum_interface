// Auto-generated from "Base de Rocas" CSV + "Base Rocas Imágenes" PDF.
// Images live in /public/rocks/. 49 of 56 rocks have a photo; the rest are null.

export type Rock = {
  id: string;
  nombre: string;
  tipo: "Ígnea" | "Sedimentaria" | "Metamórfica";
  subclasificacion: string;
  granulosidad: string;
  mineralPrincipal: string[];
  mineralSecundario: string[];
  dureza: string;
  color: string[];
  imagenes: string[];
  imagen: string | null;
};

export const ROCKS: Rock[] = [
  {
    "id": "diorita",
    "nombre": "Diorita",
    "tipo": "Ígnea",
    "subclasificacion": "Plutónica",
    "granulosidad": "Fanerítica",
    "mineralPrincipal": [
      "Plagioclasa"
    ],
    "mineralSecundario": [
      "Cuarzo",
      "Feldespato alcalino",
      "Anfibol",
      "Biotita",
      "Moscovita"
    ],
    "dureza": "6-7",
    "color": [
      "Blanco",
      "Gris",
      "Negro",
      "Café"
    ],
    "imagenes": [
      "diorita.jpg",
      "diorita-2.jpg"
    ],
    "imagen": "diorita.jpg"
  },
  {
    "id": "foidolita",
    "nombre": "Foidolita",
    "tipo": "Ígnea",
    "subclasificacion": "Plutónica",
    "granulosidad": "Fanerítica",
    "mineralPrincipal": [
      "Feldespato alcalino",
      "Plagioclasa"
    ],
    "mineralSecundario": [
      "Anfibol",
      "Piroxeno",
      "Moscovita",
      "Biotita"
    ],
    "dureza": "5-6",
    "color": [
      "Blanco",
      "Gris",
      "Café",
      "Amarillo",
      "Negro",
      "Rojo"
    ],
    "imagenes": [
      "foidolita.jpg"
    ],
    "imagen": "foidolita.jpg"
  },
  {
    "id": "gabbro",
    "nombre": "Gabbro",
    "tipo": "Ígnea",
    "subclasificacion": "Plutónica",
    "granulosidad": "Fanerítica",
    "mineralPrincipal": [
      "Plagioclasa",
      "Piroxeno"
    ],
    "mineralSecundario": [
      "Anfibol",
      "Biotita",
      "Olivino",
      "Moscovita"
    ],
    "dureza": "5-6",
    "color": [
      "Negro",
      "Gris",
      "Café"
    ],
    "imagenes": [
      "gabbro.jpg"
    ],
    "imagen": "gabbro.jpg"
  },
  {
    "id": "granito",
    "nombre": "Granito",
    "tipo": "Ígnea",
    "subclasificacion": "Plutónica",
    "granulosidad": "Fanerítica",
    "mineralPrincipal": [
      "Cuarzo",
      "Feldespato alcalino",
      "Plagioclasa"
    ],
    "mineralSecundario": [
      "Anfibol",
      "Biotita",
      "Moscovita",
      "Vermiculita",
      "Caolinita"
    ],
    "dureza": "6-7",
    "color": [
      "Gris",
      "Blanco",
      "Amarillo",
      "Café",
      "Negro",
      "Rojo"
    ],
    "imagenes": [
      "granito.jpg",
      "granito-2.jpg"
    ],
    "imagen": "granito.jpg"
  },
  {
    "id": "granodiorita",
    "nombre": "Granodiorita",
    "tipo": "Ígnea",
    "subclasificacion": "Plutónica",
    "granulosidad": "Fanerítica",
    "mineralPrincipal": [
      "Cuarzo",
      "Plagioclasa",
      "Feldespato alcalino"
    ],
    "mineralSecundario": [
      "Anfibol",
      "Biotita",
      "Moscovita",
      "Piroxeno",
      "Vermiculita",
      "Caolinita"
    ],
    "dureza": "6-7",
    "color": [
      "Gris",
      "Blanco",
      "Amarillo",
      "Café",
      "Negro",
      "Rojo"
    ],
    "imagenes": [
      "granodiorita.jpg"
    ],
    "imagen": "granodiorita.jpg"
  },
  {
    "id": "monzonita",
    "nombre": "Monzonita",
    "tipo": "Ígnea",
    "subclasificacion": "Plutónica",
    "granulosidad": "Fanerítica",
    "mineralPrincipal": [
      "Plagioclasa",
      "Feldespato alcalino"
    ],
    "mineralSecundario": [
      "Cuarzo",
      "Feldespato",
      "Anfibol",
      "Biotita"
    ],
    "dureza": "6-7",
    "color": [
      "Blanco",
      "Amarillo",
      "Café",
      "Gris",
      "Verde",
      "Negro"
    ],
    "imagenes": [
      "monzonita.jpg"
    ],
    "imagen": "monzonita.jpg"
  },
  {
    "id": "peridotita",
    "nombre": "Peridotita",
    "tipo": "Ígnea",
    "subclasificacion": "Plutónica",
    "granulosidad": "Fanerítica",
    "mineralPrincipal": [
      "Piroxeno",
      "Olivino"
    ],
    "mineralSecundario": [
      "Cromita",
      "Anfibol"
    ],
    "dureza": "5-6",
    "color": [
      "Negro",
      "Verde",
      "Gris",
      "Café"
    ],
    "imagenes": [
      "peridotita.jpg"
    ],
    "imagen": "peridotita.jpg"
  },
  {
    "id": "sienita",
    "nombre": "Sienita",
    "tipo": "Ígnea",
    "subclasificacion": "Plutónica",
    "granulosidad": "Fanerítica",
    "mineralPrincipal": [
      "Plagioclasa",
      "Feldespato alcalino"
    ],
    "mineralSecundario": [
      "Anfibol",
      "Piroxeno",
      "Moscovita",
      "Biotita"
    ],
    "dureza": "6-7",
    "color": [
      "Blanco",
      "Gris",
      "Café",
      "Amarillo",
      "Negro",
      "Rojo"
    ],
    "imagenes": [
      "sienita.jpg"
    ],
    "imagen": "sienita.jpg"
  },
  {
    "id": "andesita",
    "nombre": "Andesita",
    "tipo": "Ígnea",
    "subclasificacion": "Volcánica",
    "granulosidad": "Afanítica",
    "mineralPrincipal": [
      "Plagioclasa"
    ],
    "mineralSecundario": [
      "Cuarzo",
      "Feldespato alcalino",
      "Anfibol",
      "Biotita",
      "Moscovita"
    ],
    "dureza": "6-7",
    "color": [
      "Blanco",
      "Gris",
      "Negro",
      "Café"
    ],
    "imagenes": [
      "andesita.jpg",
      "andesita-2.jpg"
    ],
    "imagen": "andesita.jpg"
  },
  {
    "id": "basalto",
    "nombre": "Basalto",
    "tipo": "Ígnea",
    "subclasificacion": "Volcánica",
    "granulosidad": "Afanítica",
    "mineralPrincipal": [
      "Plagioclasa",
      "Piroxeno"
    ],
    "mineralSecundario": [
      "Anfibol",
      "Biotita",
      "Olivino",
      "Moscovita"
    ],
    "dureza": "5-6",
    "color": [
      "Negro",
      "Gris",
      "Café"
    ],
    "imagenes": [
      "basalto.jpg"
    ],
    "imagen": "basalto.jpg"
  },
  {
    "id": "dacita",
    "nombre": "Dacita",
    "tipo": "Ígnea",
    "subclasificacion": "Volcánica",
    "granulosidad": "Afanítica",
    "mineralPrincipal": [
      "Cuarzo",
      "Plagioclasa",
      "Feldespato alcalino"
    ],
    "mineralSecundario": [
      "Anfibol",
      "Biotita",
      "Moscovita",
      "Piroxeno",
      "Vermiculita",
      "Caolinita"
    ],
    "dureza": "6-7",
    "color": [
      "Gris",
      "Blanco",
      "Amarillo",
      "Café",
      "Negro",
      "Rojo"
    ],
    "imagenes": [
      "dacita.jpg"
    ],
    "imagen": "dacita.jpg"
  },
  {
    "id": "diabasa-dolerita-microgabro",
    "nombre": "Diabasa/Dolerita/Microgabro",
    "tipo": "Ígnea",
    "subclasificacion": "Volcánica",
    "granulosidad": "Fanerítica",
    "mineralPrincipal": [
      "Plagioclasa",
      "Piroxeno"
    ],
    "mineralSecundario": [
      "Anfibol",
      "Biotita",
      "Olivino",
      "Moscovita"
    ],
    "dureza": "5-6",
    "color": [
      "Negro",
      "Gris",
      "Café"
    ],
    "imagenes": [
      "diabasa-dolerita-microgabro.jpg"
    ],
    "imagen": "diabasa-dolerita-microgabro.jpg"
  },
  {
    "id": "foidita",
    "nombre": "Foidita",
    "tipo": "Ígnea",
    "subclasificacion": "Volcánica",
    "granulosidad": "Afanítica",
    "mineralPrincipal": [
      "Feldespato alcalino",
      "Plagioclasa"
    ],
    "mineralSecundario": [
      "Anfibol",
      "Piroxeno",
      "Moscovita",
      "Biotita"
    ],
    "dureza": "5-6",
    "color": [
      "Blanco",
      "Gris",
      "Café",
      "Amarillo",
      "Negro",
      "Rojo"
    ],
    "imagenes": [
      "foidita.jpg"
    ],
    "imagen": "foidita.jpg"
  },
  {
    "id": "komatita",
    "nombre": "Komatita",
    "tipo": "Ígnea",
    "subclasificacion": "Volcánica",
    "granulosidad": "Afanítica",
    "mineralPrincipal": [
      "Piroxeno",
      "Olivino"
    ],
    "mineralSecundario": [
      "Cromita",
      "Anfibol"
    ],
    "dureza": "5-6",
    "color": [
      "Negro",
      "Verde",
      "Gris",
      "Café"
    ],
    "imagenes": [],
    "imagen": null
  },
  {
    "id": "latita",
    "nombre": "Latita",
    "tipo": "Ígnea",
    "subclasificacion": "Volcánica",
    "granulosidad": "Afanítica",
    "mineralPrincipal": [
      "Plagioclasa",
      "Feldespato alcalino"
    ],
    "mineralSecundario": [
      "Cuarzo",
      "Feldespato",
      "Anfibol",
      "Biotita"
    ],
    "dureza": "6-7",
    "color": [
      "Blanco",
      "Amarillo",
      "Café",
      "Gris",
      "Verde",
      "Negro"
    ],
    "imagenes": [
      "latita.jpg"
    ],
    "imagen": "latita.jpg"
  },
  {
    "id": "obsidiana",
    "nombre": "Obsidiana",
    "tipo": "Ígnea",
    "subclasificacion": "Volcánica",
    "granulosidad": "Vítrea",
    "mineralPrincipal": [
      "Cuarzo"
    ],
    "mineralSecundario": [
      "Olivino",
      "Piroxeno",
      "Anfibol",
      "Biotita",
      "Feldespato"
    ],
    "dureza": "5-6",
    "color": [
      "Negra",
      "Café",
      "Verde",
      "Amarillo",
      "Rojo",
      "Azul"
    ],
    "imagenes": [
      "obsidiana.jpg"
    ],
    "imagen": "obsidiana.jpg"
  },
  {
    "id": "picrita",
    "nombre": "Picrita",
    "tipo": "Ígnea",
    "subclasificacion": "Volcánica",
    "granulosidad": "Afanítica",
    "mineralPrincipal": [
      "Plagioclasa",
      "Piroxeno",
      "Olivino"
    ],
    "mineralSecundario": [
      "Anfibol",
      "Biotita",
      "Moscovita"
    ],
    "dureza": "6-7",
    "color": [
      "Negro",
      "Gris",
      "Café"
    ],
    "imagenes": [
      "picrita.jpg"
    ],
    "imagen": "picrita.jpg"
  },
  {
    "id": "riolita",
    "nombre": "Riolita",
    "tipo": "Ígnea",
    "subclasificacion": "Volcánica",
    "granulosidad": "Afanítica",
    "mineralPrincipal": [
      "Cuarzo",
      "Feldespato alcalino",
      "Plagioclasa"
    ],
    "mineralSecundario": [
      "Anfibol",
      "Biotita",
      "Moscovita",
      "Vermiculita",
      "Caolinita"
    ],
    "dureza": "6-7",
    "color": [
      "Gris",
      "Blanco",
      "Amarillo",
      "Café",
      "Negro",
      "Rojo"
    ],
    "imagenes": [
      "riolita.jpg"
    ],
    "imagen": "riolita.jpg"
  },
  {
    "id": "traquita",
    "nombre": "Traquita",
    "tipo": "Ígnea",
    "subclasificacion": "Volcánica",
    "granulosidad": "Afanítica",
    "mineralPrincipal": [
      "Plagioclasa",
      "Feldespato alcalino"
    ],
    "mineralSecundario": [
      "Anfibol",
      "Piroxeno",
      "Moscovita",
      "Biotita"
    ],
    "dureza": "6-7",
    "color": [
      "Blanco",
      "Gris",
      "Café",
      "Amarillo",
      "Negro",
      "Rojo"
    ],
    "imagenes": [
      "traquita.jpg"
    ],
    "imagen": "traquita.jpg"
  },
  {
    "id": "greisen",
    "nombre": "Greisen",
    "tipo": "Metamórfica",
    "subclasificacion": "Contacto",
    "granulosidad": "No Foliada",
    "mineralPrincipal": [
      "Cuarzo",
      "Feldespato",
      "Plagioclasa"
    ],
    "mineralSecundario": [
      "Moscovita",
      "Clorita",
      "Topacio",
      "Turmalina",
      "Fluorita"
    ],
    "dureza": "6-7",
    "color": [
      "Gris",
      "Blanco",
      "Amarillo",
      "Café",
      "Negro",
      "Rojo"
    ],
    "imagenes": [
      "greisen.jpg"
    ],
    "imagen": "greisen.jpg"
  },
  {
    "id": "marmol",
    "nombre": "Mármol",
    "tipo": "Metamórfica",
    "subclasificacion": "Contacto",
    "granulosidad": "No Foliada",
    "mineralPrincipal": [
      "Calcita"
    ],
    "mineralSecundario": [
      "Magnesita",
      "Hematita",
      "Siderita",
      "Cuarzo"
    ],
    "dureza": "3-4",
    "color": [
      "Blanco",
      "Café",
      "Amarillo",
      "Gris",
      "Negro"
    ],
    "imagenes": [
      "marmol.jpg"
    ],
    "imagen": "marmol.jpg"
  },
  {
    "id": "migmatita",
    "nombre": "Migmatita",
    "tipo": "Metamórfica",
    "subclasificacion": "Contacto",
    "granulosidad": "Foliada",
    "mineralPrincipal": [
      "Cuarzo",
      "Feldespato",
      "Plagioclasa"
    ],
    "mineralSecundario": [
      "Anfibol",
      "Biotita",
      "Moscovita",
      "Vermiculita",
      "Caolinita"
    ],
    "dureza": "6-7",
    "color": [
      "Gris",
      "Blanco",
      "Amarillo",
      "Café",
      "Negro",
      "Rojo",
      "Verde"
    ],
    "imagenes": [
      "migmatita.jpg"
    ],
    "imagen": "migmatita.jpg"
  },
  {
    "id": "tripoli",
    "nombre": "Trípoli",
    "tipo": "Metamórfica",
    "subclasificacion": "Contacto",
    "granulosidad": "No Foliada",
    "mineralPrincipal": [
      "Cuarzo",
      "Calcita"
    ],
    "mineralSecundario": [
      "Morganita",
      "Ópalo",
      "Anhidrita",
      "Dolomita",
      "Hematita",
      "Anatasa"
    ],
    "dureza": "6-7",
    "color": [
      "Blanco",
      "Café",
      "Amarillo",
      "Gris",
      "Rojo"
    ],
    "imagenes": [],
    "imagen": null
  },
  {
    "id": "esquisto",
    "nombre": "Esquisto",
    "tipo": "Metamórfica",
    "subclasificacion": "Regional",
    "granulosidad": "Foliada",
    "mineralPrincipal": [
      "Cuarzo",
      "Feldespato"
    ],
    "mineralSecundario": [
      "Moscovita",
      "Biotita",
      "Clorita",
      "Hematita",
      "Pirita",
      "Talco"
    ],
    "dureza": "4-5",
    "color": [
      "Gris",
      "Blanco",
      "Negro",
      "Amarillo",
      "Café"
    ],
    "imagenes": [
      "esquisto.jpg"
    ],
    "imagen": "esquisto.jpg"
  },
  {
    "id": "filita",
    "nombre": "Filita",
    "tipo": "Metamórfica",
    "subclasificacion": "Regional",
    "granulosidad": "Foliada",
    "mineralPrincipal": [
      "Cuarzo",
      "Feldespato",
      "Moscovita"
    ],
    "mineralSecundario": [
      "Biotita",
      "Clorita",
      "Talco"
    ],
    "dureza": "5-6",
    "color": [
      "Gris",
      "Blanco",
      "Negro",
      "Amarillo",
      "Café"
    ],
    "imagenes": [
      "filita.jpg"
    ],
    "imagen": "filita.jpg"
  },
  {
    "id": "gneis",
    "nombre": "Gneis",
    "tipo": "Metamórfica",
    "subclasificacion": "Regional",
    "granulosidad": "Foliada",
    "mineralPrincipal": [
      "Cuarzo",
      "Feldespato alcalino",
      "Plagioclasa"
    ],
    "mineralSecundario": [
      "Anfibol",
      "Biotita",
      "Moscovita",
      "Vermiculita",
      "Caolinita"
    ],
    "dureza": "6-7",
    "color": [
      "Gris",
      "Blanco",
      "Amarillo",
      "Café",
      "Negro",
      "Rojo",
      "Verde"
    ],
    "imagenes": [
      "gneis.jpg"
    ],
    "imagen": "gneis.jpg"
  },
  {
    "id": "pizarra",
    "nombre": "Pizarra",
    "tipo": "Metamórfica",
    "subclasificacion": "Regional",
    "granulosidad": "Foliada",
    "mineralPrincipal": [
      "Cuarzo",
      "Feldespato",
      "Moscovita"
    ],
    "mineralSecundario": [
      "Biotita",
      "Clorita",
      "Hematita",
      "Pirita"
    ],
    "dureza": "5-6",
    "color": [
      "Gris",
      "Blanco",
      "Negro",
      "Amarillo",
      "Café"
    ],
    "imagenes": [
      "pizarra.jpg"
    ],
    "imagen": "pizarra.jpg"
  },
  {
    "id": "chert-de-magadi",
    "nombre": "Chert de Magadi",
    "tipo": "Sedimentaria",
    "subclasificacion": "Biológica",
    "granulosidad": "Lutita",
    "mineralPrincipal": [
      "Cuarzo",
      "Silicato de sodio"
    ],
    "mineralSecundario": [
      "Morganita",
      "Ópalo",
      "Calcita",
      "Anhidrita",
      "Dolomita",
      "Hematita"
    ],
    "dureza": "7",
    "color": [
      "Negro",
      "Blanco",
      "Café",
      "Amarillo",
      "Gris",
      "Verde",
      "Rojo"
    ],
    "imagenes": [
      "chert-de-magadi.jpg"
    ],
    "imagen": "chert-de-magadi.jpg"
  },
  {
    "id": "coquina",
    "nombre": "Coquina",
    "tipo": "Sedimentaria",
    "subclasificacion": "Biológica",
    "granulosidad": "Conglomerado",
    "mineralPrincipal": [
      "Calcita"
    ],
    "mineralSecundario": [],
    "dureza": "3",
    "color": [
      "Blanco",
      "Café",
      "Amarillo",
      "Gris",
      "Negro"
    ],
    "imagenes": [
      "coquina.jpg"
    ],
    "imagen": "coquina.jpg"
  },
  {
    "id": "creta",
    "nombre": "Creta",
    "tipo": "Sedimentaria",
    "subclasificacion": "Biológica",
    "granulosidad": "Lutita",
    "mineralPrincipal": [
      "Calcita"
    ],
    "mineralSecundario": [
      "Cuarzo",
      "Apatita"
    ],
    "dureza": "3",
    "color": [
      "Blanco",
      "Café",
      "Amarillo",
      "Gris",
      "Negro"
    ],
    "imagenes": [
      "creta.jpg"
    ],
    "imagen": "creta.jpg"
  },
  {
    "id": "geyserita",
    "nombre": "Geyserita",
    "tipo": "Sedimentaria",
    "subclasificacion": "Biológica",
    "granulosidad": "Lutita",
    "mineralPrincipal": [
      "Cuarzo"
    ],
    "mineralSecundario": [
      "Morganita",
      "Ópalo",
      "Calcita",
      "Anhidrita",
      "Dolomita",
      "Hematita"
    ],
    "dureza": "7",
    "color": [
      "Blanco",
      "Café",
      "Amarillo",
      "Gris",
      "Verde",
      "Rojo",
      "(Colores Claros)"
    ],
    "imagenes": [
      "geyserita.jpg"
    ],
    "imagen": "geyserita.jpg"
  },
  {
    "id": "mozarkita",
    "nombre": "Mozarkita",
    "tipo": "Sedimentaria",
    "subclasificacion": "Biológica",
    "granulosidad": "Lutita",
    "mineralPrincipal": [
      "Cuarzo"
    ],
    "mineralSecundario": [
      "Morganita",
      "Ópalo",
      "Calcita",
      "Anhidrita",
      "Dolomita",
      "Hematita"
    ],
    "dureza": "7-8",
    "color": [
      "Variegada",
      "Negro",
      "Blanco",
      "Café",
      "Amarillo",
      "Gris",
      "Verde",
      "Rojo"
    ],
    "imagenes": [
      "mozarkita.jpg"
    ],
    "imagen": "mozarkita.jpg"
  },
  {
    "id": "novaculita",
    "nombre": "Novaculita",
    "tipo": "Sedimentaria",
    "subclasificacion": "Biológica",
    "granulosidad": "Lutita",
    "mineralPrincipal": [
      "Cuarzo"
    ],
    "mineralSecundario": [
      "Morganita",
      "Ópalo",
      "Calcita",
      "Anhidrita",
      "Dolomita"
    ],
    "dureza": "7",
    "color": [
      "Blanco",
      "Gris"
    ],
    "imagenes": [
      "novaculita.jpg"
    ],
    "imagen": "novaculita.jpg"
  },
  {
    "id": "radiolarita",
    "nombre": "Radiolarita",
    "tipo": "Sedimentaria",
    "subclasificacion": "Biológica",
    "granulosidad": "Lutita",
    "mineralPrincipal": [
      "Cuarzo",
      "Ópalo"
    ],
    "mineralSecundario": [
      "Morganita",
      "Calcita",
      "Anhidrita",
      "Dolomita",
      "Hematita"
    ],
    "dureza": "7",
    "color": [
      "Negro",
      "Blanco",
      "Café",
      "Amarillo",
      "Gris",
      "Verde",
      "Rojo"
    ],
    "imagenes": [
      "radiolarita.jpg"
    ],
    "imagen": "radiolarita.jpg"
  },
  {
    "id": "silex",
    "nombre": "Sílex",
    "tipo": "Sedimentaria",
    "subclasificacion": "Biológica",
    "granulosidad": "Lutita",
    "mineralPrincipal": [
      "Cuarzo"
    ],
    "mineralSecundario": [
      "Morganita",
      "Ópalo",
      "Calcita",
      "Anhidrita",
      "Dolomita",
      "Hematita"
    ],
    "dureza": "7",
    "color": [
      "Negro",
      "Blanco",
      "Café",
      "Amarillo",
      "Gris",
      "Verde",
      "Rojo"
    ],
    "imagenes": [
      "silex.jpg"
    ],
    "imagen": "silex.jpg"
  },
  {
    "id": "arcosa",
    "nombre": "Arcosa",
    "tipo": "Sedimentaria",
    "subclasificacion": "Clástica",
    "granulosidad": "Arenisca",
    "mineralPrincipal": [
      "Cuarzo",
      "Feldespato"
    ],
    "mineralSecundario": [],
    "dureza": "6-7",
    "color": [
      "Naranja",
      "Café rojizo",
      "Rojo"
    ],
    "imagenes": [
      "arcosa.jpg"
    ],
    "imagen": "arcosa.jpg"
  },
  {
    "id": "arenita-cuarcitica",
    "nombre": "Arenita cuarcítica",
    "tipo": "Sedimentaria",
    "subclasificacion": "Clástica",
    "granulosidad": "Arenisca",
    "mineralPrincipal": [
      "Cuarzo"
    ],
    "mineralSecundario": [
      "Feldespato"
    ],
    "dureza": "7",
    "color": [
      "Blanca",
      "Amarilla"
    ],
    "imagenes": [
      "arenita-cuarcitica.jpg"
    ],
    "imagen": "arenita-cuarcitica.jpg"
  },
  {
    "id": "caliza",
    "nombre": "Caliza",
    "tipo": "Sedimentaria",
    "subclasificacion": "Clástica",
    "granulosidad": "Arenisca",
    "mineralPrincipal": [
      "Calcita"
    ],
    "mineralSecundario": [
      "Magnesita",
      "Hematita",
      "Siderita",
      "Cuarzo"
    ],
    "dureza": "3",
    "color": [
      "Blanco",
      "Café",
      "Amarillo",
      "Gris",
      "Negro"
    ],
    "imagenes": [
      "caliza.jpg"
    ],
    "imagen": "caliza.jpg"
  },
  {
    "id": "caliza-esparitica",
    "nombre": "Caliza Esparítica",
    "tipo": "Sedimentaria",
    "subclasificacion": "Clástica",
    "granulosidad": "Lutita",
    "mineralPrincipal": [
      "Calcita"
    ],
    "mineralSecundario": [
      "Magnesita",
      "Hematita",
      "Siderita",
      "Cuarzo"
    ],
    "dureza": "3",
    "color": [
      "Blanco",
      "Café",
      "Amarillo",
      "Gris",
      "Negro"
    ],
    "imagenes": [
      "caliza-esparitica.jpg"
    ],
    "imagen": "caliza-esparitica.jpg"
  },
  {
    "id": "dolomia",
    "nombre": "Dolomía",
    "tipo": "Sedimentaria",
    "subclasificacion": "Clástica",
    "granulosidad": "Arenisca",
    "mineralPrincipal": [
      "Dolomita"
    ],
    "mineralSecundario": [
      "Calcita",
      "Magnesita"
    ],
    "dureza": "3-4",
    "color": [
      "Café",
      "Amarillo",
      "Gris",
      "Blanco",
      "Negro"
    ],
    "imagenes": [
      "dolomia.jpg"
    ],
    "imagen": "dolomia.jpg"
  },
  {
    "id": "grauvaca-cuarcitica",
    "nombre": "Grauvaca cuarcítica",
    "tipo": "Sedimentaria",
    "subclasificacion": "Clástica",
    "granulosidad": "Arenisca",
    "mineralPrincipal": [
      "Cuarzo"
    ],
    "mineralSecundario": [
      "Feldespato"
    ],
    "dureza": "7",
    "color": [
      "Blanca",
      "Amarilla"
    ],
    "imagenes": [
      "grauvaca-cuarcitica.jpg"
    ],
    "imagen": "grauvaca-cuarcitica.jpg"
  },
  {
    "id": "grauvaca-feldespatica",
    "nombre": "Grauvaca feldespática",
    "tipo": "Sedimentaria",
    "subclasificacion": "Clástica",
    "granulosidad": "Arenisca",
    "mineralPrincipal": [
      "Cuarzo",
      "Feldespato"
    ],
    "mineralSecundario": [],
    "dureza": "6-7",
    "color": [
      "Naranja",
      "Café rojizo",
      "Rojo"
    ],
    "imagenes": [],
    "imagen": null
  },
  {
    "id": "laterita",
    "nombre": "Laterita",
    "tipo": "Sedimentaria",
    "subclasificacion": "Clástica",
    "granulosidad": "Arenisca-Lutita",
    "mineralPrincipal": [
      "Hematita",
      "Cuarzo",
      "Feldespato"
    ],
    "mineralSecundario": [
      "Zircón",
      "Bauxita",
      "Olivino",
      "Piroxeno",
      "Amfibol"
    ],
    "dureza": "2-3",
    "color": [
      "Rojo",
      "Amarillo",
      "Café",
      "Gris"
    ],
    "imagenes": [
      "laterita.jpg",
      "laterita-2.jpg"
    ],
    "imagen": "laterita.jpg"
  },
  {
    "id": "marga",
    "nombre": "Marga",
    "tipo": "Sedimentaria",
    "subclasificacion": "Clástica",
    "granulosidad": "Lutita",
    "mineralPrincipal": [
      "Calcita",
      "Cuarzo"
    ],
    "mineralSecundario": [
      "Aragonita",
      "Dolomita"
    ],
    "dureza": "4-6",
    "color": [
      "Blanco",
      "Café",
      "Amarillo",
      "Gris",
      "Negro"
    ],
    "imagenes": [
      "marga.jpg"
    ],
    "imagen": "marga.jpg"
  },
  {
    "id": "micrita",
    "nombre": "Micrita",
    "tipo": "Sedimentaria",
    "subclasificacion": "Clástica",
    "granulosidad": "Lutita",
    "mineralPrincipal": [
      "Calcita"
    ],
    "mineralSecundario": [
      "Magnesita",
      "Hematita",
      "Siderita",
      "Cuarzo"
    ],
    "dureza": "3",
    "color": [
      "Blanco",
      "Café",
      "Amarillo",
      "Gris",
      "Negro"
    ],
    "imagenes": [
      "micrita.jpg"
    ],
    "imagen": "micrita.jpg"
  },
  {
    "id": "shale-cafe",
    "nombre": "Shale Café",
    "tipo": "Sedimentaria",
    "subclasificacion": "Clástica",
    "granulosidad": "Lutita",
    "mineralPrincipal": [
      "Caolinita",
      "Cuarzo",
      "Serpentina",
      "Goetita",
      "Limonita"
    ],
    "mineralSecundario": [
      "Esmectita",
      "Calcita"
    ],
    "dureza": "2-3",
    "color": [
      "Gris",
      "Blanco",
      "Amarillo",
      "Cafe"
    ],
    "imagenes": [],
    "imagen": null
  },
  {
    "id": "shale-gris",
    "nombre": "Shale Gris",
    "tipo": "Sedimentaria",
    "subclasificacion": "Clástica",
    "granulosidad": "Lutita",
    "mineralPrincipal": [
      "Caolinita",
      "Cuarzo",
      "Serpentina"
    ],
    "mineralSecundario": [
      "Esmectita",
      "Calcita"
    ],
    "dureza": "2-3",
    "color": [
      "Gris",
      "Blanco"
    ],
    "imagenes": [
      "shale-gris.jpg"
    ],
    "imagen": "shale-gris.jpg"
  },
  {
    "id": "shale-negro",
    "nombre": "Shale Negro",
    "tipo": "Sedimentaria",
    "subclasificacion": "Clástica",
    "granulosidad": "Lutita",
    "mineralPrincipal": [
      "Caolinita",
      "Cuarzo",
      "Serpentina",
      "Hidrocarburos"
    ],
    "mineralSecundario": [
      "Esmectita",
      "Calcita"
    ],
    "dureza": "2-3",
    "color": [
      "Gris",
      "Negro"
    ],
    "imagenes": [
      "shale-negro.jpg"
    ],
    "imagen": "shale-negro.jpg"
  },
  {
    "id": "shale-rojo",
    "nombre": "Shale Rojo",
    "tipo": "Sedimentaria",
    "subclasificacion": "Clástica",
    "granulosidad": "Lutita",
    "mineralPrincipal": [
      "Caolinita",
      "Cuarzo",
      "Serpentina",
      "Hematita"
    ],
    "mineralSecundario": [
      "Esmectita",
      "Calcita"
    ],
    "dureza": "2-3",
    "color": [
      "Gris",
      "Blanco",
      "Rojo"
    ],
    "imagenes": [],
    "imagen": null
  },
  {
    "id": "shale-verde",
    "nombre": "Shale Verde",
    "tipo": "Sedimentaria",
    "subclasificacion": "Clástica",
    "granulosidad": "Lutita",
    "mineralPrincipal": [
      "Caolinita",
      "Cuarzo",
      "Serpentina",
      "Hematita"
    ],
    "mineralSecundario": [
      "Esmectita",
      "Calcita",
      "Clorita",
      "Biotita",
      "Moscovita"
    ],
    "dureza": "2-3",
    "color": [
      "Gris",
      "Blanco",
      "Verde"
    ],
    "imagenes": [],
    "imagen": null
  },
  {
    "id": "wakestone",
    "nombre": "Wakestone",
    "tipo": "Sedimentaria",
    "subclasificacion": "Clástica",
    "granulosidad": "Lutita",
    "mineralPrincipal": [
      "Calcita"
    ],
    "mineralSecundario": [
      "Biotita",
      "Clorito",
      "Feldespato",
      "Moscovita",
      "Plagioclasa",
      "Pirita",
      "Cuarzo"
    ],
    "dureza": "2-3",
    "color": [
      "Blanco",
      "Café",
      "Amarillo",
      "Gris",
      "Negro"
    ],
    "imagenes": [],
    "imagen": null
  },
  {
    "id": "agata",
    "nombre": "Ágata",
    "tipo": "Sedimentaria",
    "subclasificacion": "Química",
    "granulosidad": "Lutita",
    "mineralPrincipal": [
      "Cuarzo"
    ],
    "mineralSecundario": [
      "Morganita",
      "Ópalo",
      "Calcita",
      "Anhidrita",
      "Dolomita"
    ],
    "dureza": "7",
    "color": [
      "Negro",
      "Blanco",
      "Café",
      "Amarillo",
      "Gris",
      "Verde",
      "Rojo"
    ],
    "imagenes": [
      "agata.jpg"
    ],
    "imagen": "agata.jpg"
  },
  {
    "id": "jaspe",
    "nombre": "Jaspe",
    "tipo": "Sedimentaria",
    "subclasificacion": "Química",
    "granulosidad": "Lutita",
    "mineralPrincipal": [
      "Cuarzo",
      "Hematita"
    ],
    "mineralSecundario": [
      "Morganita",
      "Ópalo",
      "Calcita",
      "Anhidrita",
      "Dolomita"
    ],
    "dureza": "6-7",
    "color": [
      "Rojo",
      "Negro",
      "Amarillo",
      "Verde"
    ],
    "imagenes": [
      "jaspe.jpg"
    ],
    "imagen": "jaspe.jpg"
  },
  {
    "id": "jaspillita",
    "nombre": "Jaspillita",
    "tipo": "Sedimentaria",
    "subclasificacion": "Química",
    "granulosidad": "Lutita",
    "mineralPrincipal": [
      "Cuarzo",
      "Hematita"
    ],
    "mineralSecundario": [
      "Morganita",
      "Ópalo",
      "Calcita",
      "Anhidrita",
      "Dolomita"
    ],
    "dureza": "6-7",
    "color": [
      "Rojo",
      "Negro",
      "Amarillo",
      "Verde"
    ],
    "imagenes": [
      "jaspillita.jpg"
    ],
    "imagen": "jaspillita.jpg"
  },
  {
    "id": "travertino",
    "nombre": "Travertino",
    "tipo": "Sedimentaria",
    "subclasificacion": "Química",
    "granulosidad": "Lutita",
    "mineralPrincipal": [
      "Calcita"
    ],
    "mineralSecundario": [
      "Cuarzo",
      "Apatita"
    ],
    "dureza": "3-4",
    "color": [
      "Blanco",
      "Café",
      "Amarillo",
      "Gris",
      "Negro"
    ],
    "imagenes": [
      "travertino.jpg"
    ],
    "imagen": "travertino.jpg"
  },
  {
    "id": "tufa",
    "nombre": "Tufa",
    "tipo": "Sedimentaria",
    "subclasificacion": "Química",
    "granulosidad": "Lutita",
    "mineralPrincipal": [
      "Calcita"
    ],
    "mineralSecundario": [
      "Cuarzo",
      "Apatita"
    ],
    "dureza": "3-4",
    "color": [
      "Blanco",
      "Café",
      "Amarillo",
      "Gris",
      "Negro"
    ],
    "imagenes": [
      "tufa.jpg"
    ],
    "imagen": "tufa.jpg"
  }
];
