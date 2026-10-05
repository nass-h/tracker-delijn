let selectedLine = "";

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
      .filter(
        (line) =>
          !query ||
          line
            .toLowerCase()
            .includes(query)
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

    lineSuggestions.appendChild(
      button
    );
  }

  lineSuggestions.style.display =
    lines.length
      ? "block"
      : "none";
}

function selectLine(line) {
  selectedLine = line || "";

  lineFilter.value =
    selectedLine;

  clearLineButton.style.display =
    selectedLine
      ? "block"
      : "none";

  lineSuggestions.style.display =
    "none";

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

  if (!lineVehicles.length) {
    clearRoute();
    renderVehicles();
    return;
  }

  /*
   * On affiche les véhicules immédiatement.
   */
  renderVehicles();

  /*
   * Puis les tracés de la ligne.
   */
  showLineRoutes(lineVehicles);

  /*
   * Et on cadre les véhicules de cette ligne.
   */
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
}

lineFilter.addEventListener(
  "input",
  () => {
    /*
     * Champ vidé = retour immédiat
     * à toutes les lignes.
     */
    if (!lineFilter.value.trim()) {
      selectedLine = "";

      clearLineButton.style.display =
        "none";

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

lineFilter.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Escape") {
      lineSuggestions.style.display =
        "none";

      lineFilter.blur();

      return;
    }

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

clearLineButton.addEventListener(
  "click",
  () => {
    selectLine("");
  }
);

document.addEventListener(
  "click",
  (event) => {
    const lineSearch =
      document.querySelector(
        ".line-search"
      );

    if (
      lineSearch &&
      !lineSearch.contains(event.target)
    ) {
      lineSuggestions.style.display =
        "none";
    }
  }
);


updateVehicles();

setInterval(
  updateVehicles,
  REFRESH_INTERVAL
);