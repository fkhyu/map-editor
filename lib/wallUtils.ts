import * as turf from "@turf/turf";
import type { Feature, Polygon } from "geojson";


export function createWallPolygon(
  start: [number, number],
  end: [number, number],
  widthMeters: number
): Feature<Polygon> {
  const line = turf.lineString([start, end]);
  const buffered = turf.buffer(line, widthMeters / 2, { units: "meters" });
  return buffered as Feature<Polygon>;
}

