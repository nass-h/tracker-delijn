const AdmZip =
  require("adm-zip");

const {
  parse: parseSync,
} = require("csv-parse/sync");

const {
  GTFS_FILE,
  ensureGtfsFile,
} = require("./static");

const {
  ensureShapesCache,
  invalidateShapesCache,
  getShape,
  getShapes,
} = require("./shapes");


const routes = new Map();
const trips = new Map();
const stops = new Map();

const routeShapeIds =
  new Map();


function readCsv(zip, filename) {
  const entry =
    zip.getEntry(filename);

  if (!entry) {
    throw new Error(
      `${filename} absent du GTFS`
    );
  }

  return parseSync(
    entry
      .getData()
      .toString("utf8"),
    {
      columns: true,
      skip_empty_lines: true,
      bom: true,
    }
  );
}


async function loadGtfs(apiKey) {
  /*
   * Si static.js installe un nouveau GTFS,
   * le cache des shapes correspondant à
   * l'ancien GTFS est invalidé.
   */
  await ensureGtfsFile(
    apiKey,
    invalidateShapesCache
  );


  const zip =
    new AdmZip(
      GTFS_FILE
    );


  loadRoutes(zip);
  loadTrips(zip);
  loadStops(zip);

  await ensureShapesCache();

  console.log(
    "✅ GTFS prêt"
  );
}


function loadRoutes(zip) {
  const rows =
    readCsv(
      zip,
      "routes.txt"
    );

  routes.clear();

  for (const route of rows) {
    routes.set(
      route.route_id,
      route
    );
  }

  console.log(
    `🛣️ ${routes.size} lignes`
  );
}


function loadTrips(zip) {
  const rows =
    readCsv(
      zip,
      "trips.txt"
    );

  trips.clear();
  routeShapeIds.clear();


  for (const trip of rows) {
    trips.set(
      trip.trip_id,
      trip
    );


    if (
      !trip.route_id ||
      !trip.shape_id
    ) {
      continue;
    }


    let shapeIds =
      routeShapeIds.get(
        trip.route_id
      );


    if (!shapeIds) {
      shapeIds =
        new Set();

      routeShapeIds.set(
        trip.route_id,
        shapeIds
      );
    }


    shapeIds.add(
      trip.shape_id
    );
  }


  console.log(
    `🚍 ${trips.size} trajets`
  );
}


function loadStops(zip) {
  const rows =
    readCsv(
      zip,
      "stops.txt"
    );

  stops.clear();


  for (const stop of rows) {
    stops.set(
      stop.stop_id,
      stop
    );
  }


  console.log(
    `🚏 ${stops.size} arrêts`
  );
}


function getTrip(tripId) {
  return trips.get(
    tripId
  );
}


function getRoute(routeId) {
  return routes.get(
    routeId
  );
}


function getStop(stopId) {
  return stops.get(
    stopId
  );
}


function getShapeIdsForRoute(
  routeId
) {
  return [
    ...(
      routeShapeIds.get(
        routeId
      ) || []
    ),
  ];
}


module.exports = {
  loadGtfs,

  getTrip,
  getRoute,
  getStop,

  getShapeIdsForRoute,

  getShape,
  getShapes,
};