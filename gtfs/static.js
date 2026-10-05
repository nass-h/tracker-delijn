const AdmZip = require("adm-zip");
const fs = require("fs");
const path = require("path");

const STATIC_URL =
  "https://api.delijn.be/gtfs/static/v3/gtfs_transit.zip";

const GTFS_FILE =
  path.join(
    __dirname,
    "..",
    "gtfs_transit.zip"
  );

const GTFS_MAX_AGE_MS =
  24 * 60 * 60 * 1000;


async function ensureGtfsFile(
  apiKey,
  onGtfsUpdated
) {
  const hasLocalGtfs =
    fs.existsSync(GTFS_FILE);

  if (hasLocalGtfs) {
    const stats =
      fs.statSync(GTFS_FILE);

    const age =
      Date.now() -
      stats.mtimeMs;

    if (age < GTFS_MAX_AGE_MS) {
      const ageHours =
        age / 1000 / 60 / 60;

      console.log(
        `📦 GTFS local (${(
          stats.size /
          1024 /
          1024
        ).toFixed(1)} Mo, ${ageHours.toFixed(1)} h)`
      );

      return;
    }

    console.log(
      "♻️ GTFS local expiré, actualisation…"
    );
  } else {
    console.log(
      "📦 Aucun GTFS local"
    );
  }


  try {
    console.log(
      "📡 Téléchargement du GTFS Static De Lijn…"
    );

    const response =
      await fetch(STATIC_URL, {
        headers: {
          "Ocp-Apim-Subscription-Key":
            apiKey,
        },
      });

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }


    const buffer =
      Buffer.from(
        await response.arrayBuffer()
      );

    console.log(
      `📦 GTFS téléchargé (${(
        buffer.length /
        1024 /
        1024
      ).toFixed(1)} Mo)`
    );


    const tempFile =
      `${GTFS_FILE}.tmp`;

    fs.writeFileSync(
      tempFile,
      buffer
    );


    /*
     * Vérifie au minimum que le fichier
     * téléchargé est un ZIP lisible.
     */
    try {
      new AdmZip(tempFile);
    } catch {
      fs.rmSync(
        tempFile,
        {
          force: true,
        }
      );

      throw new Error(
        "Le GTFS téléchargé n'est pas un ZIP valide"
      );
    }


    fs.renameSync(
      tempFile,
      GTFS_FILE
    );

    console.log(
      "💾 Nouveau GTFS sauvegardé sur disque"
    );


    /*
     * Permet à index.js d'invalider
     * le cache des shapes uniquement
     * lorsqu'un nouveau GTFS a réellement
     * été installé.
     */
    if (onGtfsUpdated) {
      onGtfsUpdated();
    }

  } catch (error) {
    /*
     * Si un ancien GTFS existe,
     * on continue à travailler avec.
     */
    if (hasLocalGtfs) {
      const stats =
        fs.statSync(GTFS_FILE);

      const ageHours =
        (
          (
            Date.now() -
            stats.mtimeMs
          ) /
          1000 /
          60 /
          60
        ).toFixed(1);

      console.warn(
        `⚠️ Impossible d'actualiser le GTFS : ${error.message}`
      );

      console.warn(
        `⚠️ Utilisation du GTFS local (${ageHours} h)`
      );

      fs.rmSync(
        `${GTFS_FILE}.tmp`,
        {
          force: true,
        }
      );

      return;
    }


    throw new Error(
      `Impossible de télécharger le GTFS et aucun GTFS local n'est disponible : ${error.message}`
    );
  }
}


module.exports = {
  GTFS_FILE,
  ensureGtfsFile,
};