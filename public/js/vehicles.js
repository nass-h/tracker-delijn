const markers = new Map();

function escapeHtml(value) {
  if (value == null) {
    return "";
  }

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTime(timestamp) {
  return new Date(timestamp * 1000)
    .toLocaleTimeString("fr-BE", {
      hour: "2-digit",
      minute: "2-digit",
    });
}

function createVehicleIcon(vehicle) {
  const line = escapeHtml(vehicle.line || "?");
  const bearing = vehicle.bearing ?? 0;

  const background =
    vehicle.routeColor || "#FFD800";

  const textColor =
    vehicle.routeTextColor || "#111111";

  return L.divIcon({
    className: "vehicle-icon-wrapper",

    html: `
      <div class="vehicle">
        <div
          class="vehicle-direction"
          style="transform: rotate(${bearing}deg)"
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

function createNextStopHtml(vehicle) {
  const nextStop =
    vehicle.upcomingStops?.[0];

  if (!nextStop) {
    return "";
  }

  const estimatedTimestamp =
    nextStop.time;

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

  return `
    <div class="next-stop">
      <div class="next-stop-label">
        Prochain passage temps réel
      </div>

      <div class="next-stop-name">
        ${escapeHtml(
          nextStop.name || nextStop.stopId
        )}
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
  const updated =
    vehicle.timestamp
      ? new Date(vehicle.timestamp * 1000)
          .toLocaleTimeString("fr-BE")
      : "—";

  const lineButton =
    vehicle.line
      ? `
        <button
          type="button"
          class="popup-line popup-line-button"
          data-line="${escapeHtml(vehicle.line)}"
          style="
            background-color: ${vehicle.routeColor || "#FFD800"};
            color: ${vehicle.routeTextColor || "#111111"};
          "
          title="Afficher la ligne ${escapeHtml(vehicle.line)}"
        >
          ${escapeHtml(vehicle.line)}
        </button>
      `
      : "";

  return `
    <div class="vehicle-popup">
      <div class="popup-header">
        ${lineButton}

        <span class="popup-destination">
          → ${escapeHtml(
            vehicle.destination ||
            "Destination inconnue"
          )}
        </span>
      </div>

      <div class="popup-route">
        ${escapeHtml(vehicle.routeName || "")}
      </div>

      ${createNextStopHtml(vehicle)}

      <hr>

      <div class="popup-row">
        <span>Véhicule</span>

        <strong>
          <a
            class="vehicle-link"
            href="https://www.zone01.be/hercules/resultaten?q=${encodeURIComponent(vehicle.id)}"
            target="_blank"
            rel="noopener noreferrer"
            title="Voir le véhicule ${escapeHtml(vehicle.id)} sur Zone01"
          >
            ${escapeHtml(vehicle.id)}
          </a>
        </strong>
      </div>

      <small class="popup-updated">
        <span>Mise à jour</span>
        <strong>${updated}</strong>
      </small>
    </div>
  `;
}

function clearMarkers() {
  for (const marker of markers.values()) {
    map.removeLayer(marker);
  }

  markers.clear();
}

function focusVehicle(vehicleId) {
  const vehicle =
    vehicles.find(
      (item) =>
        item.id === vehicleId
    );

  if (!vehicle) {
    return;
  }

  const marker =
    markers.get(vehicle.id);

  if (!marker) {
    return;
  }

  /*
   * Affiche le tracé exact du véhicule.
   */
  showVehicleRoute(vehicle);

  /*
   * Centre et zoome sur le véhicule.
   */
  map.setView(
    [
      vehicle.latitude,
      vehicle.longitude,
    ],
    Math.max(
      map.getZoom(),
      15
    )
  );

  /*
   * Ouvre la même popup que lors
   * d'un clic sur le marqueur.
   */
  marker.openPopup();
}

function renderVehicles() {
  const zoom = map.getZoom();

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
      if (
        selectedLine &&
        vehicle.line !== selectedLine
      ) {
        return false;
      }

      if (selectedLine) {
        return true;
      }

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

    let marker =
      markers.get(vehicle.id);

    if (!marker) {
      marker = L.marker(position, {
        icon: createVehicleIcon(vehicle),
      });

      marker.addTo(map);

      /*
       * Le listener n'est créé qu'une fois.
       *
       * On recherche la version actuelle du véhicule
       * au moment du clic.
       */
      marker.on("click", (event) => {
        L.DomEvent.stopPropagation(
          event.originalEvent
        );

        const currentVehicle =
          vehicles.find(
            (item) =>
              item.id === vehicle.id
          );

        if (currentVehicle) {
          showVehicleRoute(
            currentVehicle
          );
        }
      });

      /*
       * Même chose pour le bouton de ligne
       * présent dans la popup.
       */
      marker.on("popupopen", (event) => {
        const button =
          event.popup
            .getElement()
            ?.querySelector(
              ".popup-line-button"
            );

        if (!button) {
          return;
        }

        button.addEventListener(
          "click",
          () => {
            selectLine(
              button.dataset.line
            );
          },
          { once: true }
        );
      });

      markers.set(
        vehicle.id,
        marker
      );
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
  }

  /*
   * Supprime les marqueurs qui ne doivent
   * plus être affichés.
   */
  for (
    const [vehicleId, marker]
    of markers
  ) {
    if (!activeIds.has(vehicleId)) {
      map.removeLayer(marker);
      markers.delete(vehicleId);
    }
  }

  // Compteur de véhicules
  countElement.textContent =
    `${visibleVehicles.length} véhicules affichés${
      selectedLine ? " ▾" : ""
    }`;
}

map.on("zoomend", renderVehicles);
map.on("moveend", renderVehicles);