const MIN_VEHICLE_ZOOM = 11;

const map = L.map("map", {
  zoomControl: true,
}).setView([50.85, 4.35], 9);

L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }
).addTo(map);

const routeLayer = L.layerGroup().addTo(map);

let routeRequestId = 0;

function clearRoute() {
  routeRequestId++;
  routeLayer.clearLayers();
}


async function showVehicleRoute(vehicle) {
  const requestId = ++routeRequestId;

  routeLayer.clearLayers();

  if (!vehicle.shapeId) {
    return;
  }

  try {
    const response = await fetch(
      `/api/shapes/${encodeURIComponent(vehicle.shapeId)}`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const shape = await response.json();

    // Une autre sélection a eu lieu entre-temps.
    if (requestId !== routeRequestId) {
      return;
    }

    L.polyline(shape.points, {
      color: vehicle.routeColor || "#FFD800",
      weight: 5,
      opacity: 0.8,
      interactive: false,
    }).addTo(routeLayer);
  } catch (error) {
    console.error(
      "Impossible de charger le tracé du véhicule :",
      error
    );
  }
}

async function showLineRoutes(lineVehicles) {
  const requestId = ++routeRequestId;

  routeLayer.clearLayers();

  const routeIds = [
    ...new Set(
      lineVehicles
        .map((vehicle) => vehicle.routeId)
        .filter(Boolean)
    ),
  ];

  if (!routeIds.length) {
    return;
  }

  const color =
    lineVehicles.find((vehicle) => vehicle.routeColor)
      ?.routeColor || "#FFD800";

  try {
    const responses = await Promise.all(
      routeIds.map(async (routeId) => {
        const response = await fetch(
          `/api/routes/${encodeURIComponent(routeId)}/shapes`
        );

        if (!response.ok) {
          throw new Error(
            `Route ${routeId}: HTTP ${response.status}`
          );
        }

        return response.json();
      })
    );

    if (requestId !== routeRequestId) {
      return;
    }

    // Plusieurs routeId peuvent partager le même shape.
    const displayedShapes = new Set();

    for (const data of responses) {
      for (const shape of data.shapes || []) {
        if (displayedShapes.has(shape.shapeId)) {
          continue;
        }

        displayedShapes.add(shape.shapeId);

        L.polyline(shape.points, {
          color,
          weight: 3,
          opacity: 0.25,
          interactive: false,
        }).addTo(routeLayer);
      }
    }
  } catch (error) {
    console.error(
      "Impossible de charger les tracés de la ligne :",
      error
    );
  }
}


map.on("click", () => {
  clearRoute();
});