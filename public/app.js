const MIN_VEHICLE_ZOOM = 11;
const REFRESH_INTERVAL = 15000;

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

const statusElement = document.getElementById("status");
const countElement = document.getElementById("vehicle-count");

const lineFilter = document.getElementById("line-filter");
const clearLineButton = document.getElementById("clear-line");
const lineSuggestions = document.getElementById("line-suggestions");
let selectedLine = "";

const lineVehiclesElement =
  document.getElementById(
    "line-vehicles"
  );

const zoomMessage = document.getElementById("zoom-message");

const markers = new Map();

const routeLayer = L.layerGroup().addTo(map);

let selectedRouteId = null;

let vehicles = [];

function escapeHtml(value) {
  if (value == null) return "";

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clearRoute() {
  routeLayer.clearLayers();
}

function createVehicleIcon(vehicle) {
  const line = escapeHtml(
    vehicle.line || "?"
  );

  const bearing =
    vehicle.bearing ?? 0;

  const background =
    vehicle.routeColor ||
    "#FFD800";

  const textColor =
    vehicle.routeTextColor ||
    "#111111";

  return L.divIcon({
    className:
      "vehicle-icon-wrapper",

    html: `
      <div class="vehicle">

        <div
          class="vehicle-direction"
          style="
            transform: rotate(${bearing}deg);
          "
        >
          ▲
        </div>

        <div
          class="vehicle-line"
          style="
            background-color: ${background};
            color: ${textColor};
          "
        >
          ${line}
        </div>

      </div>
    `,

    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

function formatTime(timestamp) {
  return new Date(timestamp * 1000)
    .toLocaleTimeString("fr-BE", {
      hour: "2-digit",
      minute: "2-digit",
    });
}

function createNextStopHtml(vehicle) {
  const nextStop = vehicle.upcomingStops?.[0];

  if (!nextStop) {
    return "";
  }

  const estimatedTimestamp = nextStop.time;

  const scheduledTimestamp =
    nextStop.delay != null
      ? estimatedTimestamp - nextStop.delay
      : null;

  const estimatedTime =
    formatTime(estimatedTimestamp);

  const scheduledTime =
    scheduledTimestamp != null
      ? formatTime(scheduledTimestamp)
      : "—";

  let delayHtml = "";

  if (nextStop.delay != null) {
    const delayMinutes =
      Math.round(Math.abs(nextStop.delay) / 60);

    if (nextStop.delay > 30) {
      delayHtml =
        `<span class="delay">+${delayMinutes} min</span>`;
    } else if (nextStop.delay < -30) {
      delayHtml =
        `<span class="early">-${delayMinutes} min</span>`;
    } else {
      delayHtml =
        `<span class="on-time">À l'heure</span>`;
    }
  }

  return `
    <div class="next-stop">

      <div class="next-stop-label">
        Prochain passage temps réel
      </div>

      <div class="next-stop-name">
        ${escapeHtml(nextStop.name || nextStop.stopId)}
      </div>

      <div class="times">

        <div class="time-row">
          <span>Prévu</span>
          <strong>${scheduledTime}</strong>
        </div>

        <div class="time-row">
          <span>Estimé</span>
          <strong>
            ${estimatedTime}
            ${delayHtml}
          </strong>
        </div>

      </div>

    </div>
  `;
}

function popupContent(vehicle) {
  const updated = vehicle.timestamp
    ? new Date(vehicle.timestamp * 1000)
        .toLocaleTimeString("fr-BE")
    : "—";

  // -----------------------------------------
  // Badge de ligne cliquable
  // -----------------------------------------

  const lineButton = vehicle.line
    ? `
      <button
        type="button"
        class="popup-line popup-line-button"
        data-line="${escapeHtml(vehicle.line)}"
        style="
          background-color: ${vehicle.routeColor || "#FFD800"};
          color: ${vehicle.routeTextColor || "#111111"};
        "
        title="Afficher uniquement la ligne ${escapeHtml(vehicle.line)}"
      >
        ${escapeHtml(vehicle.line)}
      </button>
    `
    : "";

  // -----------------------------------------
  // Prochain passage temps réel
  // -----------------------------------------

  const nextStop = vehicle.upcomingStops?.[0];

  let nextStopHtml = "";

  if (nextStop) {
    const estimatedTimestamp =
      nextStop.time;

    const scheduledTimestamp =
      nextStop.delay != null
        ? estimatedTimestamp - nextStop.delay
        : null;

    const formatTime = (timestamp) =>
      new Date(timestamp * 1000)
        .toLocaleTimeString("fr-BE", {
          hour: "2-digit",
          minute: "2-digit",
        });

    const estimatedTime =
      formatTime(estimatedTimestamp);

    const scheduledTime =
      scheduledTimestamp != null
        ? formatTime(scheduledTimestamp)
        : "—";

    let delayHtml = "";

    if (nextStop.delay != null) {
      const delayMinutes =
        Math.round(
          Math.abs(nextStop.delay) / 60
        );

      if (nextStop.delay > 30) {
        delayHtml = `
          <span class="delay">
            +${delayMinutes} min
          </span>
        `;
      } else if (nextStop.delay < -30) {
        delayHtml = `
          <span class="early">
            -${delayMinutes} min
          </span>
        `;
      } else {
        delayHtml = `
          <span class="on-time">
            À l'heure
          </span>
        `;
      }
    }

    nextStopHtml = `
      <div class="next-stop">

        <div class="next-stop-label">
          Prochain passage temps réel
        </div>

        <div class="next-stop-name">
          ${escapeHtml(
            nextStop.name ||
            nextStop.stopId
          )}
        </div>

        <div class="times">

          <div class="time-row">
            <span>Prévu</span>
            <strong>
              ${scheduledTime}
            </strong>
          </div>

          <div class="time-row">
            <span>Estimé</span>

            <strong>
              ${estimatedTime}
              ${delayHtml}
            </strong>
          </div>

        </div>

      </div>
    `;
  }

  // -----------------------------------------
  // Popup complète
  // -----------------------------------------

  return `
    <div class="vehicle-popup">

      <div class="popup-header">

        ${lineButton}

        <span class="popup-destination">
          →
          ${escapeHtml(
            vehicle.destination ||
            "Destination inconnue"
          )}
        </span>

      </div>

      <div class="popup-route">
        ${escapeHtml(
          vehicle.routeName || ""
        )}
      </div>

      ${nextStopHtml}

      <hr>

      <div class="popup-row">
        <span>Véhicule</span>

        <strong>
          ${escapeHtml(vehicle.id)}
        </strong>
      </div>

      <div class="popup-row">
        <span>Direction</span>

        <strong>
          ${
            vehicle.bearing != null
              ? `${Math.round(vehicle.bearing)}°`
              : "—"
          }
        </strong>
      </div>

      <div class="popup-row">
        <span>Mise à jour</span>

        <strong>
          ${updated}
        </strong>
      </div>

    </div>
  `;
}


// ------------------------------------------------
// AFFICHAGE DES SHAPES
// ------------------------------------------------

async function showRouteShapes(routeId, color) {
  routeLayer.clearLayers();

  if (!routeId) {
    selectedRouteId = null;
    return;
  }

  selectedRouteId = routeId;

  try {
    const response = await fetch(
      `/api/routes/${encodeURIComponent(routeId)}/shapes`
    );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const data = await response.json();

    // L'utilisateur a peut-être sélectionné
    // une autre ligne pendant le chargement.
    if (selectedRouteId !== routeId) {
      return;
    }

    for (const shape of data.shapes) {
      L.polyline(shape.points, {
        color: color || "#F5C400",
        weight: 4,
        opacity: 0.35,
        interactive: false,
      }).addTo(routeLayer);
    }

  } catch (error) {
    console.error(
      "Impossible de charger le tracé :",
      error
    );
  }
}

async function showVehicleRoute(vehicle) {
  clearRoute();

  if (!vehicle.shapeId) {
    return;
  }

  try {
    const response = await fetch(
      `/api/shapes/${encodeURIComponent(vehicle.shapeId)}`
    );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const shape =
      await response.json();

    L.polyline(shape.points, {
      color:
        vehicle.routeColor ||
        "#FFD800",

      weight: 5,
      opacity: 0.8,

      interactive: false,
    }).addTo(routeLayer);

  } catch (error) {
    console.error(
      "Impossible de charger le tracé",
      error
    );
  }
}


// ------------------------------------------------
// AFFICHAGE DES VEHICULES
// ------------------------------------------------

function renderVehicles() {
  const zoom = map.getZoom();

  // Si aucune ligne spécifique n'est choisie,
  // on exige le zoom minimum.
  //
  // En revanche, si l'utilisateur recherche une
  // ligne précise, on l'affiche même à zoom faible.
  const zoomRequired =
    !selectedLine &&
    zoom < MIN_VEHICLE_ZOOM;

  if (zoomRequired) {
    clearMarkers();

    zoomMessage.style.display = "block";

    countElement.textContent =
      `${vehicles.length} véhicules disponibles`;

    return;
  }

  zoomMessage.style.display = "none";

  const bounds = map.getBounds();

  const visibleVehicles =
    vehicles.filter((vehicle) => {

      // Filtre ligne
      if (
        selectedLine &&
        vehicle.line !== selectedLine
      ) {
        return false;
      }

      // Lorsqu'une ligne est sélectionnée,
      // on affiche toute la ligne.
      if (selectedLine) {
        return true;
      }

      // Sinon seulement les véhicules dans
      // la zone actuellement visible.
      return bounds.contains([
        vehicle.latitude,
        vehicle.longitude,
      ]);
    });

  const activeIds = new Set();

  for (const vehicle of visibleVehicles) {
    activeIds.add(vehicle.id);

    const position = [
      vehicle.latitude,
      vehicle.longitude,
    ];

    let marker = markers.get(vehicle.id);

    if (!marker) {
      marker = L.marker(position, {
        icon: createVehicleIcon(vehicle),
      });

      marker.addTo(map);

      markers.set(vehicle.id, marker);

      marker.on("click", () => {
        const currentVehicle =
            vehicles.find(
            (v) => v.id === vehicle.id
            );

        if (currentVehicle) {
            showVehicleRoute(
            currentVehicle
            );
        }
      });
    } else {
      marker.setLatLng(position);
      marker.setIcon(
        createVehicleIcon(vehicle)
      );
    }

    marker.bindPopup(
      popupContent(vehicle),
      {
        maxWidth: 320,
        minWidth: 240,
      }
    );

    marker.on("popupopen", (event) => {
        const button =
            event.popup
            .getElement()
            ?.querySelector(".popup-line-button");

        if (!button) {
            return;
        }

        button.addEventListener(
            "click",
            () => {
            selectLine(button.dataset.line);
            },
            { once: true }
        );
    });
  }

  // Retire ce qui n'est plus affiché
  for (const [vehicleId, marker] of markers) {
    if (!activeIds.has(vehicleId)) {
      map.removeLayer(marker);
      markers.delete(vehicleId);
    }
  }

  countElement.textContent =
    `${visibleVehicles.length} véhicule${
      visibleVehicles.length > 1 ? "s" : ""
    } affiché${
      visibleVehicles.length > 1 ? "s" : ""
    }`;
}

function clearMarkers() {
  for (const marker of markers.values()) {
    map.removeLayer(marker);
  }

  markers.clear();
}

// ------------------------------------------------
// CHARGEMENT TEMPS REEL
// ------------------------------------------------

async function updateVehicles() {
  try {
    statusElement.textContent =
      "Actualisation…";

    const response =
      await fetch("/api/vehicles");

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const data =
      await response.json();

    vehicles = data.vehicles;

    updateLineFilter();
    renderVehicles();

    statusElement.textContent =
      `Mis à jour à ${new Date()
        .toLocaleTimeString("fr-BE")}`;

  } catch (error) {
    console.error(error);

    statusElement.textContent =
      "⚠ Erreur d'actualisation";
  }
}

// ------------------------------------------------
// EVENEMENTS CARTE
// ------------------------------------------------

map.on("zoomend", renderVehicles);

map.on("moveend", renderVehicles);

// ------------------------------------------------
// FILTRE
// ------------------------------------------------

function selectLine(line) {
  selectedLine = line || "";

  lineFilter.value = selectedLine;

  clearLineButton.style.display =
    selectedLine ? "block" : "none";

  lineSuggestions.style.display = "none";

  if (!selectedLine) {
    clearRoute();
    renderVehicles();
    return;
  }

  const lineVehicles =
    vehicles.filter(
      (vehicle) =>
        vehicle.line === selectedLine
    );

  if (lineVehicles.length === 0) {
    return;
  }

  const bounds =
    L.latLngBounds(
      lineVehicles.map(
        (vehicle) => [
          vehicle.latitude,
          vehicle.longitude,
        ]
      )
    );

  map.fitBounds(bounds, {
    padding: [60, 60],
    maxZoom: 13,
  });

  renderVehicles();

  // Ici on appellera également notre fonction
  // d'affichage des tracés de la ligne.
  showLineRoutes(lineVehicles);
}

function getAvailableLines() {
  return [
    ...new Set(
      vehicles
        .map((vehicle) => vehicle.line)
        .filter(Boolean)
    ),
  ].sort((a, b) =>
    a.localeCompare(
      b,
      "fr",
      { numeric: true }
    )
  );
}

function showLineSuggestions() {
  const query =
    lineFilter.value
      .trim()
      .toLowerCase();

  const lines =
    getAvailableLines()
      .filter((line) =>
        !query ||
        line.toLowerCase().includes(query)
      )
      .slice(0, 12);

  lineSuggestions.innerHTML = "";

  for (const line of lines) {
    const button =
      document.createElement("button");

    button.type = "button";
    button.textContent = line;

    button.addEventListener(
      "click",
      () => selectLine(line)
    );

    lineSuggestions.appendChild(button);
  }

  lineSuggestions.style.display =
    lines.length ? "block" : "none";
}

lineFilter.addEventListener(
  "input",
  () => {
    if (!lineFilter.value.trim()) {
      selectedLine = "";
      clearLineButton.style.display = "none";

      clearRoute();
      renderVehicles();
    }

    showLineSuggestions();
  }
);

lineFilter.addEventListener(
  "focus",
  showLineSuggestions
);

clearLineButton.addEventListener(
  "click",
  () => selectLine("")
);

lineFilter.addEventListener(
  "keydown",
  (event) => {
    if (event.key !== "Enter") {
      return;
    }

    const query =
      lineFilter.value.trim();

    const match =
      getAvailableLines().find(
        (line) =>
          line.toLowerCase() ===
          query.toLowerCase()
      );

    if (match) {
      selectLine(match);
      lineFilter.blur();
    }
  }
);


/* Close the line filter list when clicking outside */
document.addEventListener("click", (event) => {
  const lineSearch =
    document.querySelector(".line-search");

  if (!lineSearch.contains(event.target)) {
    lineSuggestions.style.display = "none";
  }
});



updateVehicles();

setInterval(
  updateVehicles,
  REFRESH_INTERVAL
);