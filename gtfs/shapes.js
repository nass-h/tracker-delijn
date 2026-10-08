const unzipper =
  require("unzipper");

const {
  parse,
} = require("csv-parse");

const fs = require("fs");
const path = require("path");

const {
  GTFS_FILE,
} = require("./static");


const SHAPES_CACHE_ROOT =
  path.join(
    __dirname,
    "..",
    ".gtfs-cache"
  );

const SHAPES_CACHE_DIR =
  path.join(
    SHAPES_CACHE_ROOT,
    "shapes"
  );

const SHAPES_CACHE_READY =
  path.join(
    SHAPES_CACHE_ROOT,
    "shapes.ready"
  );


/*
 * Ne contient que les tracés réellement
 * consultés depuis le démarrage.
 */
const shapeMemoryCache =
  new Map();


function invalidateShapesCache() {
  console.log(
    "🧹 Invalidation du cache des tracés"
  );

  shapeMemoryCache.clear();

  fs.rmSync(
    SHAPES_CACHE_DIR,
    {
      recursive: true,
      force: true,
    }
  );

  fs.rmSync(
    SHAPES_CACHE_READY,
    {
      force: true,
    }
  );
}


async function ensureShapesCache() {
  if (
    fs.existsSync(
      SHAPES_CACHE_READY
    )
  ) {
    console.log(
      "🗺️ Cache des tracés disponible"
    );

    return;
  }

  await buildShapesCache();
}


async function buildShapesCache() {
  console.log(
    "🗺️ Construction du cache des tracés…"
  );

  /*
   * Une génération interrompue peut avoir
   * laissé un dossier incomplet.
   */
  fs.rmSync(
    SHAPES_CACHE_DIR,
    {
      recursive: true,
      force: true,
    }
  );

  fs.mkdirSync(
    SHAPES_CACHE_DIR,
    {
      recursive: true,
    }
  );


  const directory =
    await unzipper.Open.file(
      GTFS_FILE
    );

  const entry =
    directory.files.find(
      (file) =>
        file.path ===
        "shapes.txt"
    );

  if (!entry) {
    throw new Error(
      "shapes.txt absent du GTFS"
    );
  }


  const parser =
    entry
      .stream()
      .pipe(
        parse({
          columns: true,
          skip_empty_lines: true,
          bom: true,
        })
      );


  let currentShapeId = null;
  let currentPoints = [];

  let shapeCount = 0;
  let pointCount = 0;

  let previousSequence = -1;
  let orderingErrors = 0;


  function flushShape() {
    if (
      !currentShapeId ||
      !currentPoints.length
    ) {
      return;
    }

    const filename =
      getShapeCacheFilename(
        currentShapeId
      );

    fs.writeFileSync(
      filename,
      JSON.stringify(
        currentPoints
      )
    );

    shapeCount++;

    currentPoints = [];
  }


  for await (const row of parser) {
    if (
      currentShapeId !==
      row.shape_id
    ) {
      flushShape();

      currentShapeId =
        row.shape_id;

      previousSequence = -1;
    }


    const sequence =
      Number(
        row.shape_pt_sequence
      );

    if (
      sequence <
      previousSequence
    ) {
      orderingErrors++;
    }

    previousSequence =
      sequence;


    currentPoints.push([
      Number(
        row.shape_pt_lat
      ),
      Number(
        row.shape_pt_lon
      ),
    ]);


    pointCount++;


    if (
      pointCount % 500000 === 0
    ) {
      console.log(
        `   ${pointCount.toLocaleString(
          "fr-BE"
        )} points…`
      );
    }
  }


  /*
   * Écrit le dernier shape.
   */
  flushShape();


  /*
   * Le marqueur n'est créé qu'une fois
   * la génération complètement terminée.
   */
  fs.mkdirSync(
    SHAPES_CACHE_ROOT,
    {
      recursive: true,
    }
  );

  fs.writeFileSync(
    SHAPES_CACHE_READY,
    JSON.stringify({
      shapeCount,
      pointCount,
      createdAt:
        new Date()
          .toISOString(),
    })
  );


  console.log(
    `🗺️ ${shapeCount} tracés / ${pointCount.toLocaleString(
      "fr-BE"
    )} points mis en cache`
  );

  console.log(
    `🔎 Ordre shapes : ${orderingErrors} anomalie(s)`
  );
}


function getShapeCacheFilename(
  shapeId
) {
  return path.join(
    SHAPES_CACHE_DIR,
    `${encodeURIComponent(
      shapeId
    )}.json`
  );
}


function getShape(shapeId) {
  /*
   * Déjà chargé :
   * réponse depuis la RAM.
   */
  const cached =
    shapeMemoryCache.get(
      shapeId
    );

  if (cached) {
    return {
      shapeId,
      points: cached,
    };
  }


  /*
   * Premier accès :
   * lecture du cache disque.
   */
  const filename =
    getShapeCacheFilename(
      shapeId
    );

  if (
    !fs.existsSync(filename)
  ) {
    return null;
  }


  try {
    const points =
      JSON.parse(
        fs.readFileSync(
          filename,
          "utf8"
        )
      );

    shapeMemoryCache.set(
      shapeId,
      points
    );

    return {
      shapeId,
      points,
    };

  } catch (error) {
    console.error(
      `Impossible de lire le shape ${shapeId} :`,
      error
    );

    return null;
  }
}


function getShapes(shapeIds) {
  return shapeIds
    .map(
      (shapeId) =>
        getShape(shapeId)
    )
    .filter(Boolean);
}


module.exports = {
  ensureShapesCache,
  invalidateShapesCache,
  getShape,
  getShapes,
};