import assert from "node:assert/strict";
import { gameCoordsToLonLat, isValidLonLat } from "./gameProjection";

function expectRegion(
  name: string,
  point: [number, number],
  bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number },
) {
  assert.equal(isValidLonLat(point), true, name + " produced invalid longitude/latitude");
  const [lon, lat] = point;
  assert.ok(lon >= bounds.minLon && lon <= bounds.maxLon, name + " longitude outside expected region: " + lon);
  assert.ok(lat >= bounds.minLat && lat <= bounds.maxLat, name + " latitude outside expected region: " + lat);
}

expectRegion(
  "ETS2 south London",
  gameCoordsToLonLat("ets2", -40_169, -10_685),
  { minLon: -2, maxLon: 1, minLat: 50, maxLat: 52.5 },
);

expectRegion(
  "ETS2 Paris",
  gameCoordsToLonLat("ets2", -30_120, 5_847),
  { minLon: 1, maxLon: 3.5, minLat: 48, maxLat: 50 },
);

expectRegion(
  "ETS2 Crete",
  gameCoordsToLonLat("ets2", 62_276, 84_880),
  { minLon: 23, maxLon: 26, minLat: 34.5, maxLat: 36.5 },
);

expectRegion(
  "ATS Las Vegas",
  gameCoordsToLonLat("ats", -85_672, 7_870),
  { minLon: -116.5, maxLon: -113, minLat: 35, maxLat: 37.5 },
);

console.log("OpenHaul ETS2/ATS projection checks passed.");
