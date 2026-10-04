import proj4 from "proj4";

export type TruckGame = "ets2" | "ats";
export type LonLat = [number, number];

const EARTH_RADIUS_METERS = 6_370_997;
const METERS_PER_DEGREE = (EARTH_RADIUS_METERS * Math.PI) / 180;

const atsProjection = proj4([
  "+proj=lcc",
  "+R=" + EARTH_RADIUS_METERS,
  "+lat_1=33",
  "+lat_2=45",
  "+lat_0=39",
  "+lon_0=-96",
].join(" "));

const ets2Projection = proj4([
  "+proj=lcc",
  "+R=" + EARTH_RADIUS_METERS,
  "+lat_1=37",
  "+lat_2=65",
  "+lat_0=50",
  "+lon_0=15",
].join(" "));

/**
 * Converts raw SCS world X/Z telemetry coordinates into longitude/latitude.
 *
 * Projection parameters come from the games' map/climate definitions.
 * ETS2's legacy UK map content uses a different authored scale, so that
 * region needs a small correction before applying the Lambert projection.
 */
export function gameCoordsToLonLat(game: TruckGame, x: number, z: number): LonLat {
  if (game === "ats") {
    const projectedX = x * 0.000176689948 * METERS_PER_DEGREE;
    const projectedY = z * -0.00017706234 * METERS_PER_DEGREE;
    const result = atsProjection.inverse([projectedX, projectedY]);
    return [result[0], result[1]];
  }

  const sectorX = Math.floor(x / 4000);
  const sectorZ = Math.floor(z / 4000);

  let localX = x - 16660;
  let localZ = z - 4150;

  // ETS2's UK sectors were authored at roughly 3/4 of the mainland scale.
  // Calais is used as the transition anchor between the two authored spaces.
  const isUkSector =
    sectorX <= -8 &&
    sectorZ <= -2 &&
    !(sectorX === -8 && sectorZ === -2);

  if (isUkSector) {
    const ukScale = 0.75;
    const calaisX = -31_100;
    const calaisZ = -5_500;
    localX = (localX + calaisX / 2) * ukScale;
    localZ = (localZ + calaisZ / 2) * ukScale;
  }

  const projectedX = localX * 0.0001729241463 * METERS_PER_DEGREE;
  const projectedY = localZ * -0.000171570875 * METERS_PER_DEGREE;
  const result = ets2Projection.inverse([projectedX, projectedY]);
  return [result[0], result[1]];
}

export function lonLatToGameCoords(game: TruckGame, lon: number, lat: number): [number, number] {
  if (game === "ats") {
    const projected = atsProjection.forward([lon, lat]);
    const x = projected[0] / (0.000176689948 * METERS_PER_DEGREE);
    const z = projected[1] / (-0.00017706234 * METERS_PER_DEGREE);
    return [x, z];
  }

  const projected = ets2Projection.forward([lon, lat]);
  const localX = projected[0] / (0.0001729241463 * METERS_PER_DEGREE);
  const localZ = projected[1] / (-0.000171570875 * METERS_PER_DEGREE);

  // This inverse is intended for viewport requests. The mainland projection
  // deliberately returns a slightly wider box around the UK so the tracker
  // query still includes legacy UK sectors despite their authored scale.
  return [localX + 16660, localZ + 4150];
}

export function isValidLonLat([lon, lat]: LonLat) {
  return (
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lon >= -180 &&
    lon <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}
