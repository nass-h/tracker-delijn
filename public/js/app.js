const REFRESH_INTERVAL = 15000;

const statusElement =
  document.getElementById("status");

const countElement =
  document.getElementById(
    "vehicle-count"
  );

const zoomMessage =
  document.getElementById(
    "zoom-message"
  );

const lineFilter =
  document.getElementById(
    "line-filter"
  );

const clearLineButton =
  document.getElementById(
    "clear-line"
  );

const lineSuggestions =
  document.getElementById(
    "line-suggestions"
  );

const lineVehiclesElement =
  document.getElementById(
    "line-vehicles"
  );

let vehicles = [];

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
    renderVehicles();
    if (selectedLine) {
      renderLineVehicles();
    }

    statusElement.textContent =
      `Mis à jour à ${
        new Date()
          .toLocaleTimeString(
            "fr-BE"
          )
      }`;
  } catch (error) {
    console.error(error);

    statusElement.textContent =
      "⚠ Erreur d'actualisation";
  }
}