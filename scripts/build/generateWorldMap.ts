#!/usr/bin/env bun
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { geoCentroid, geoNaturalEarth1, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import countries from "i18n-iso-countries";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { presimplify, quantile, simplify } from "topojson-simplify";
import usStates10m from "us-atlas/states-10m.json";
import countries50m from "world-atlas/countries-50m.json";
import countries110m from "world-atlas/countries-110m.json";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jsonOut = join(root, "src", "data", "geo", "worldMap.generated.json");
const svgOut = join(root, "public", "maps", "world-borders.svg");

const WIDTH = 960;
const COUNTRY_KEEP = 0.5;
const STATE_KEEP = 0.03;
const COUNTRY_DOT_AREA = 18;
const STATE_DOT_AREA = 4;
const ANTARCTICA = "010";
const STATE_NAME_ALIASES: Record<string, string> = {
  "Commonwealth of the Northern Mariana Islands": "Northern Mariana Islands",
};
const US_CITIES: Record<string, [number, number]> = {
  "California/Arcata": [-124.0828, 40.8665],
  "California/Oakland": [-122.2712, 37.8044],
  "California/San Diego": [-117.1611, 32.7157],
  "California/San Francisco": [-122.4194, 37.7749],
  "California/Santa Cruz": [-122.0308, 36.9741],
  "Colorado/Denver": [-104.9903, 39.7392],
  "Illinois/Chicago": [-87.6298, 41.8781],
  "Massachusetts/Cambridge": [-71.1097, 42.3736],
  "Massachusetts/Northampton": [-72.6412, 42.3251],
  "Massachusetts/Somerville": [-71.0995, 42.3876],
  "Michigan/Ann Arbor": [-83.743, 42.2808],
  "Michigan/Detroit": [-83.0458, 42.3314],
  "Minnesota/Minneapolis": [-93.265, 44.9778],
  "Washington/Seattle": [-122.3321, 47.6062],
};

type ShapeTopology<K extends string> = Topology<Record<K, GeometryCollection>>;
type Shape = { d?: string; dot?: [number, number] };

function load<K extends string>(raw: unknown, key: K, keep: number) {
  const pre = presimplify(raw as ShapeTopology<K>);
  const topology = simplify(pre, quantile(pre, keep)) as ShapeTopology<K>;
  topology.objects[key].geometries = topology.objects[key].geometries.filter(
    (item) => item.id !== ANTARCTICA,
  );
  const collection = feature(topology, topology.objects[key]) as FeatureCollection<Geometry>;
  return { topology, collection };
}

function alpha2(item: Feature) {
  return item.id == null ? undefined : countries.numericToAlpha2(String(item.id))?.toLowerCase();
}

const coarse = load(countries110m, "countries", COUNTRY_KEEP);
const fine = load(countries50m, "countries", COUNTRY_KEEP);
const states = load(usStates10m, "states", STATE_KEEP);
const projection = geoNaturalEarth1().fitWidth(WIDTH, coarse.collection);
const top = geoPath(projection).bounds(coarse.collection)[0][1];
projection.translate([projection.translate()[0], projection.translate()[1] - top]);
const path = geoPath(projection).digits(1);
const height = Math.ceil(path.bounds(coarse.collection)[1][1]);

const round = (value: number) => Math.round(value * 10) / 10;
const point = (coordinates: [number, number]) => {
  const [x, y] = projection(coordinates) ?? [0, 0];
  return [round(x), round(y)] as [number, number];
};
const shape = (item: Feature, dotArea: number): Shape | undefined => {
  const d = path(item);
  if (!d) return undefined;
  return path.area(item) < dotArea ? { d, dot: point(geoCentroid(item)) } : { d };
};

const countryShapes: Record<string, Shape> = {};
for (const item of coarse.collection.features) {
  const code = alpha2(item);
  const value = shape(item, COUNTRY_DOT_AREA);
  if (code && value) countryShapes[code] = value;
}
for (const item of fine.collection.features) {
  const code = alpha2(item);
  if (code && !countryShapes[code]) countryShapes[code] = { dot: point(geoCentroid(item)) };
}

const stateShapes: Record<string, Shape> = {};
for (const item of states.collection.features) {
  const name = String(item.properties?.name ?? "");
  const value = shape(item, STATE_DOT_AREA);
  if (name && value) stateShapes[STATE_NAME_ALIASES[name] ?? name] = value;
}

const cityPoints = Object.fromEntries(
  Object.entries(US_CITIES).map(([key, coordinates]) => [key, point(coordinates)]),
);

const json = JSON.stringify({
  width: WIDTH,
  height,
  countries: countryShapes,
  usStates: stateShapes,
  usCities: cityPoints,
});
writeFileSync(jsonOut, `${json}\n`, "utf8");

const countryBorders = path(mesh(coarse.topology, coarse.topology.objects.countries));
const stateBorders = path(mesh(states.topology, states.topology.objects.states, (a, b) => a !== b));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}"><g fill="none" stroke="#000" stroke-linejoin="round"><path d="${countryBorders}" stroke-width="0.6"/><path d="${stateBorders}" stroke-width="0.35"/></g></svg>\n`;
writeFileSync(svgOut, svg, "utf8");

console.log(
  `Wrote ${jsonOut} (${(json.length / 1024).toFixed(1)} KB, ${Object.keys(countryShapes).length} countries, ${Object.keys(stateShapes).length} US states and territories, ${Object.keys(cityPoints).length} cities) and ${svgOut} (${(svg.length / 1024).toFixed(1)} KB)`,
);
