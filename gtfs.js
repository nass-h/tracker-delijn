const AdmZip = require("adm-zip");
const unzipper = require("unzipper");
const { parse } = require("csv-parse");
const { parse: parseSync } = require("csv-parse/sync");

const fs = require("fs");
const path = require("path");


const STATIC_URL =
  "https://api.delijn.be/gtfs/static/v3/gtfs_transit.zip";

const GTFS_FILE =
  path.join(__dirname, "gtfs_transit.zip");


const routes = new Map();
const trips = new Map();
const stops = new Map();
const shapes = new Map();
const routeShapeIds = new Map();


function readCsv(zip, filename) {
  const entry = zip.getEntry(filename);

  if (!entry) {
    throw new Error(`${filename} absent du GTFS`);
  }

  return parseSync(
    entry.getData().toString("utf8"),
    {
      columns: true,
      skip_empty_lines: true,
      bom: true,
    }
  );
}

async function loadGtfs(apiKey) {
  console.log("📦 Téléchargement du GTFS Static De Lijn…");

  const response = await fetch(STATIC_URL, {
    headers: {
      "Ocp-Apim-Subscription-Key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(
      `GTFS Static De Lijn : HTTP ${response.status}`
    );
  }

  // 1. On crée d'abord le buffer
  const buffer = Buffer.from(
    await response.arrayBuffer()
  );

  console.log(
    `📦 GTFS téléchargé (${(buffer.length / 1024 / 1024).toFixed(1)} Mo)`
  );

  // 2. Ensuite seulement on peut l'écrire sur disque
  fs.writeFileSync(GTFS_FILE, buffer);

  console.log("💾 GTFS sauvegardé sur disque");

  // 3. Puis AdmZip peut l'utiliser
  const zip = new AdmZip(buffer);

  // Lignes
  const routeRows = readCsv(zip, "routes.txt");

  for (const route of routeRows) {
    routes.set(route.route_id, route);
  }

  console.log(`🛣️ ${routes.size} lignes`);

  // Courses
  const tripRows = readCsv(zip, "trips.txt");

  for (const trip of tripRows) {
    trips.set(
      trip.trip_id,
      trip
    );

    if (
      trip.route_id &&
      trip.shape_id
    ) {
      let shapeIds =
        routeShapeIds.get(
          trip.route_id
        );

      if (!shapeIds) {
        shapeIds = new Set();

        routeShapeIds.set(
          trip.route_id,
          shapeIds
        );
      }

      shapeIds.add(
        trip.shape_id
      );
    }
  }

  console.log(`🚍 ${trips.size} trajets`);

  // Arrêts
  const stopRows = readCsv(zip, "stops.txt");

  for (const stop of stopRows) {
    stops.set(stop.stop_id, stop);
  }

  console.log(`🚏 ${stops.size} arrêts`);

  await loadShapes();
  console.log("✅ GTFS prêt");
}

function getTrip(tripId) {
  return trips.get(tripId);
}

function getRoute(routeId) {
  return routes.get(routeId);
}

function getStop(stopId) {
  return stops.get(stopId);
}


// Shapes
async function loadShapes() {
  console.log("🗺️ Chargement des tracés GTFS…");

  const directory =
    await unzipper.Open.file(GTFS_FILE);

  const entry =
    directory.files.find(
      (file) => file.path === "shapes.txt"
    );

  if (!entry) {
    throw new Error(
      "shapes.txt absent du GTFS"
    );
  }

  const parser = entry
    .stream()
    .pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        bom: true,
      })
    );

  let pointCount = 0;

  for await (const row of parser) {
    let shape = shapes.get(row.shape_id);

    if (!shape) {
      shape = [];
      shapes.set(row.shape_id, shape);
    }

    shape.push({
      lat: Number(row.shape_pt_lat),
      lon: Number(row.shape_pt_lon),
      sequence: Number(row.shape_pt_sequence),
    });

    pointCount++;

    if (pointCount % 500000 === 0) {
      console.log(
        `   ${pointCount.toLocaleString("fr-BE")} points…`
      );
    }
  }

  // GTFS est normalement déjà ordonné,
  // mais on garantit l'ordre.
  for (const points of shapes.values()) {
    points.sort(
      (a, b) =>
        a.sequence - b.sequence
    );
  }

  console.log(
    `🗺️ ${shapes.size} tracés / ${pointCount.toLocaleString("fr-BE")} points`
  );
}

function getShapeIdsForRoute(routeId) {
  return [
    ...(
      routeShapeIds.get(routeId) ||
      []
    ),
  ];
}

function getShape(shapeId) {
  const points = shapes.get(shapeId);

  if (!points) {
    return null;
  }

  return {
    shapeId,

    points: points.map(
      (point) => [
        point.lat,
        point.lon,
      ]
    ),
  };
}

function getShapes(shapeIds) {
  return shapeIds
    .map((shapeId) => {
      const points =
        shapes.get(shapeId);

      if (!points) {
        return null;
      }

      return {
        shapeId,

        points: points.map(
          (point) => [
            point.lat,
            point.lon,
          ]
        ),
      };
    })
    .filter(Boolean);
}

module.exports = {
  loadGtfs,
  getTrip,
  getRoute,
  getStop,
  getShapeIdsForRoute,
  getShapes,
  getShape,
};