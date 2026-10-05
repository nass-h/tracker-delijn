require("dotenv").config();

const express = require("express");
const GtfsRealtimeBindings = require("gtfs-realtime-bindings");

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = process.env.DELIJN_REALTIME_API_KEY;
if (!API_KEY) {
  console.error("❌ DELIJN_REALTIME_API_KEY manquante dans .env");
  process.exit(1);
}

const {
  loadGtfs,
  getTrip,
  getRoute,
  getStop,
  getShapeIdsForRoute,
  getShapes,
  getShape,
} = require("./gtfs");


async function fetchRealtime() {
  const url =
    "https://api.delijn.be/gtfs/v3/realtime" +
    "?position=true&delay=true&tripid=true&vehicleid=true";

  const response = await fetch(url, {
    headers: {
      "Ocp-Apim-Subscription-Key":
        process.env.DELIJN_REALTIME_API_KEY,
    },
  });

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `De Lijn Realtime HTTP ${response.status}: ${body}`
    );
  }

  const buffer = Buffer.from(
    await response.arrayBuffer()
  );

  return GtfsRealtimeBindings
    .transit_realtime
    .FeedMessage
    .decode(buffer);
}


app.use(express.static("public"));

app.get("/api/vehicles", async (req, res) => {
  try {
    const feed = await fetchRealtime();

    // ---------------------------------------
    // 1. Index des mises à jour temps réel
    // ---------------------------------------

    const tripUpdates = new Map();

    for (const entity of feed.entity) {
      const update = entity.tripUpdate;

      if (!update?.trip?.tripId) {
        continue;
      }

      tripUpdates.set(
        update.trip.tripId,
        update
      );
    }

    // ---------------------------------------
    // 2. Véhicules
    // ---------------------------------------

    const vehicles = feed.entity
      .filter(
        (entity) =>
          entity.vehicle?.position
      )
      .map((entity) => {
        const vehicle = entity.vehicle;

        const tripId =
          vehicle.trip?.tripId || null;

        const trip =
          tripId
            ? getTrip(tripId)
            : null;

        const route =
          trip
            ? getRoute(trip.route_id)
            : null;

        const realtime =
          tripId
            ? tripUpdates.get(tripId)
            : null;

        // -----------------------------------
        // Prochains arrêts temps réel
        // -----------------------------------

        const now =
          Math.floor(Date.now() / 1000);

        const upcomingStops =
          realtime?.stopTimeUpdate
            ?.map((stopUpdate) => {
              const stop = getStop(
                stopUpdate.stopId
              );

              const arrivalTime =
                stopUpdate.arrival?.time
                  ? Number(
                      stopUpdate.arrival.time
                    )
                  : null;

              const departureTime =
                stopUpdate.departure?.time
                  ? Number(
                      stopUpdate.departure.time
                    )
                  : null;

              const time =
                arrivalTime ??
                departureTime;

              const delay =
                stopUpdate.arrival?.delay ??
                stopUpdate.departure?.delay ??
                null;

              return {
                stopId:
                  stopUpdate.stopId,

                sequence:
                  stopUpdate.stopSequence != null
                    ? Number(
                        stopUpdate.stopSequence
                      )
                    : null,

                name:
                  stop?.stop_name || null,

                time,

                delay:
                  delay != null
                    ? Number(delay)
                    : null,
              };
            })
            .filter(
              (stop) =>
                stop.time &&
                stop.time >= now
            )
            .sort(
              (a, b) =>
                a.time - b.time
            ) || [];

        return {
          id:
            vehicle.vehicle?.id ||
            entity.id,

          tripId,

          routeId:
            trip?.route_id || null,

          line:
            route?.route_short_name ||
            null,

          routeName:
            route?.route_long_name ||
            null,
        
          routeColor:
            route?.route_color
            ? `#${route.route_color}`
            : "#FFD800",

          routeTextColor:
            route?.route_text_color
            ? `#${route.route_text_color}`
            : "#111111",

          destination:
            trip?.trip_headsign ||
            null,

          directionId:
            trip?.direction_id !==
            undefined
              ? Number(
                  trip.direction_id
                )
              : null,
        
          shapeId:
            trip?.shape_id || null,

          latitude:
            vehicle.position.latitude,

          longitude:
            vehicle.position.longitude,

          bearing:
            vehicle.position.bearing ??
            null,

          speed:
            vehicle.position.speed ??
            null,

          timestamp:
            vehicle.timestamp
              ? Number(
                  vehicle.timestamp
                )
              : null,

          upcomingStops:
            upcomingStops.slice(0, 5),
        };
      });

    res.json({
      count: vehicles.length,
      vehicles,
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        "Impossible de récupérer les véhicules",
      message: error.message,
    });
  }
});


app.get(
  "/api/shapes/:shapeId",
  (req, res) => {
    const shape =
      getShape(req.params.shapeId);

    if (!shape) {
      return res.status(404).json({
        error: "Tracé introuvable",
      });
    }

    res.json(shape);
  }
);


app.get("/api/routes/:routeId/shapes",
  async (req, res) => {
    try {
      const routeId =
        req.params.routeId;

      const shapeIds =
        getShapeIdsForRoute(routeId);

      const shapes =
        getShapes(shapeIds);

      res.json({
        routeId,
        shapeCount: shapes.length,
        shapes,
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Impossible de récupérer le tracé",
        message: error.message,
      });
    }
  }
);


app.get("/api/debug/realtime", async (req, res) => {
  try {
    const url =
      "https://api.delijn.be/gtfs/v3/realtime" +
      "?json=true&delay=true&tripid=true&vehicleid=true";

    const response = await fetch(url, {
      headers: {
        "Ocp-Apim-Subscription-Key":
          process.env.DELIJN_REALTIME_API_KEY,
      },
    });

    if (!response.ok) {
      return res.status(response.status).send(
        await response.text()
      );
    }

    const data = await response.json();

    res.json(data);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: error.message,
    });
  }
});


async function start() {
  try {
    await loadGtfs(process.env.DELIJN_STATIC_API_KEY);

    app.listen(PORT, () => {
      console.log("");
      console.log("🚍 Tracker De Lijn");
      console.log(`🌐 http://localhost:${PORT}`);
      console.log(`📡 http://localhost:${PORT}/api/vehicles`);
    });
  } catch (error) {
    console.error("❌ Impossible de démarrer :", error);
    process.exit(1);
  }
}

start();