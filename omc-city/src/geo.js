// Coordinate utilities: game meters ↔ [lon, lat]
//
// Game meters origin = SF_CENTER.
//   x = meters east  (positive = east)
//   z = meters south (positive = south)

export const SF_CENTER = { lat: 37.7935, lon: -122.4020 };
const COS_LAT = Math.cos(SF_CENTER.lat * Math.PI / 180);

// Game meters → [lon, lat]
export function metersToLngLat(x, z) {
  const lon = SF_CENTER.lon + x / (111320 * COS_LAT);
  const lat = SF_CENTER.lat - z / 110540;
  return [lon, lat];
}

// [lon, lat] → game meters [x, z]
export function lngLatToMeters(lon, lat) {
  const x = (lon - SF_CENTER.lon) * 111320 * COS_LAT;
  const z = -(lat - SF_CENTER.lat) * 110540;
  return [x, z];
}
