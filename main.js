import * as pmtiles from "pmtiles";
import maplibregl from "maplibre-gl";

/**
 * @typedef {import("maplibre-gl").Map} Map
 * @typedef {import("maplibre-gl").MapGeoJSONFeature} MapGeoJSONFeature
 * @typedef {import("maplibre-gl").LayerSpecification} LayerSpecification
 * @typedef {import("maplibre-gl").DataDrivenPropertyValueSpecification<number>} DataDrivenPropertyValueSpecificationNumber
 * @typedef {import("maplibre-gl").DataDrivenPropertyValueSpecification<string>} DataDrivenPropertyValueSpecificationString
 */

const SPIDERS = [
  "anytime_fitness",
  "caribou_coffee_us",
  "chipotle",
  "mcdonalds",
  "natural_grocers_us",
  'qdoba',
  "sprouts_farmer_market",
  "starbucks",
  "sweetgreen_us",
  "trader_joes_us",
  "whole_foods",
];

/** @param {string[]} spiders */
const makeSources = spiders => (Object.fromEntries(
  spiders.map(spider => [spider, {
    type: "vector",
    url: `pmtiles://${location.protocol}//${location.host}${location.pathname}${spider}.pmtiles`,
  }])
));

/** @param {string} spider @returns {LayerSpecification} */
const makeLayer = spider => {
  /** @type {DataDrivenPropertyValueSpecificationNumber} */
  const circleRadius = [
    "let",
    "radius",
    [
      "*",
      5,
      [
        "^",
        [
          "number",
          ["get", "point_count"],
          1
        ],
        0.25
      ]
    ],
    [
      "interpolate",
      ["exponential", 2],
      ["zoom"],
      0,
      10,
      6,
      ["var", "radius"],
      10,
      ["var", "radius"],
      14,
      10,
      22,
      50
    ]
  ];

  const colorIndex = SPIDERS.indexOf(spider) + 1;
  const inv = [
    128 + colorIndex * 12,
    255 - colorIndex * 17,
    colorIndex * 31
  ];
  const pointColor = Array.from(inv).sort((a, b) => ((inv.indexOf(b)+colorIndex)%3) - ((inv.indexOf(a)+colorIndex)%3)).map(n => (Math.abs(n) + 1) % 240);
  const clusterColor = pointColor.map(n => (n+15) % 255);
  /** @type {DataDrivenPropertyValueSpecificationString} */
  const circleColor = [
    "case",
    [
      "boolean",
      ["get", "clustered"],
      false
    ],
    `rgba(${clusterColor.join(',')},0.5)`, // color of clusters
    `rgba(${pointColor.join(',')},0.9)`  // color of individual points
  ];

  return {
    id: `output-${spider}`,
    source: spider,
    "source-layer": spider,
    type: "circle",
    paint: { "circle-radius": circleRadius, "circle-color": circleColor },
  }
};

const protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);
/** @global */
export const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    glyphs: "https://cdn.protomaps.com/fonts/pbf/{fontstack}/{range}.pbf",
    sources: {
      ...makeSources(SPIDERS),
      "raster-tiles": {
        type: "raster",
        tiles: [
          "https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}{ratio}.png",
          "https://cartodb-basemaps-b.global.ssl.fastly.net/light_all/{z}/{x}/{y}{ratio}.png",
          "https://cartodb-basemaps-c.global.ssl.fastly.net/light_all/{z}/{x}/{y}{ratio}.png",
          "https://cartodb-basemaps-d.global.ssl.fastly.net/light_all/{z}/{x}/{y}{ratio}.png"
        ],
        tileSize: 256,
        attribution: "© <a href=\"http://www.openstreetmap.org/copyright\"> OpenStreetMap </a> contributors, © <a href=\"https://carto.com/about-carto/\"> CARTO </a>"
      },
    },
    layers: [
      { id: "tiles", type: "raster", source: "raster-tiles", },
      ...SPIDERS.map(makeLayer)
    ]
  },
  center: [-110, 44],
  zoom: 3,
  hash: true,
});

map.addControl(new maplibregl.NavigationControl());
map.addControl(new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true
}));
map.keyboard.disableRotation();
map.getCanvas().focus();

map.on("load", map.resize);
// map.on("mousemove", e => {
//   const { x, y } = e.point;
//   const r = 2; // radius around the point
//   const features = map.queryRenderedFeatures([
//     [x - r, y - r],
//     [x + r, y + r],
//   ]);

//   if (features?.length > 0) console.log('features', features);
// });
SPIDERS.forEach(SPIDER => {
  map.on("click", `output-${SPIDER}`, (e) => {
    if (!e?.features?.length) return;

    const cluster = e.features.find(x => x.properties.clustered);
    if (cluster) {
      const zoom = 1 + map.getZoom();
      map.easeTo({ center: cluster.geometry.coordinates, zoom, });
    } else {
      const popupContents = document.createElement("div");
      for (let i = 0; i < e.features.length; i++) {
        const feature = e.features[i];
        popupContents.append(renderFeature(feature));
        if (i + 1 < e.features.length) {
          popupContents.append(document.createElement("hr"));
        }
      }

      var popup = new maplibregl.Popup({
        className: "places-popup",
        maxWidth: "80%",
      })
        .setLngLat(e.lngLat)
        .setDOMContent(popupContents)
        .addTo(map);

      popup.once("close", () => map.getCanvas().focus());

      const first = e.features[0];
      map.easeTo({ center: first.geometry.coordinates, });
    }
  });
  map.on("mouseenter", `output-${SPIDER}`, function () {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", `output-${SPIDER}`, function () {
    map.getCanvas().style.cursor = "";
  });
});

/**
 * @param {MapGeoJSONFeature} feature
 */
function renderFeature(feature) {
  const [x, y] = feature.geometry.coordinates.map(p => +p.toFixed(6));
  const props = Object.entries(feature.properties);
  props.sort((a, b) => a[0].localeCompare(b[0]));
  const formatValue = (k, v) => {
    const a = document.createElement("a");
    a.target = "_blank";
    switch (k) {
      case "website":
        a.href = a.textContent = v;
        return a;
      case "brand:wikidata":
        a.href = `https://www.wikidata.org/wiki/${v}`;
        a.textContent = v;
        return a;
      case "nsi_id": {
        const u = new URL("https://nsi.guide/");
        u.searchParams.set("id", v);
        a.href = u.toString();
        a.textContent = v;
        return a;
      }
      case "@spider": {
        const u = new URL("https://github.com/alltheplaces/alltheplaces/search");
        u.searchParams.set("q", `path:locations/spiders /name = "${v}"/`);
        a.href = u.toString();
        a.textContent = v;
        return a;
      }
      default:
        return v;
    }
  };
  const e = document.createElement("pre");
  const coord = document.createElement("a");
  coord.target = "_blank";
  coord.href = `https://www.openstreetmap.org/?mlat=${y}&mlon=${x}`;
  coord.textContent = `${x},${y}`;
  e.append(coord, "\n");
  for (let i = 0; i < props.length; i++) {
    const [k, v] = props[i];
    switch (k) {
      case '@spider':
      case 'addr:postcode':
      case 'addr:street_address':
      case 'brand':
      case 'drive_through':
      case 'internet_access':
      case 'opening_hours':
      case 'website':
      default:
        e.append(k, "=", formatValue(k, v));
        if (i + 1 < props.length) e.append("\n");
      // default:
      //   null;
    }
  }
  return e;
}
