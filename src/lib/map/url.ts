// Camera-in-hash codec: `#zoom/lat/lng` (maplibre-style order). Pure functions —
// the router glue lives in the [species] page.

export interface Camera {
  zoom: number
  lat: number
  lng: number
}

export function parseCameraHash(hash: string): Camera | null {
  const parts = hash.replace(/^#/, '').split('/')
  if (parts.length !== 3) return null
  const [zoom, lat, lng] = parts.map(Number)
  if (!Number.isFinite(zoom) || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (zoom < 0 || zoom > 24 || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { zoom, lat, lng }
}

export function formatCameraHash(cam: Camera): string {
  return `#${cam.zoom.toFixed(2)}/${cam.lat.toFixed(5)}/${cam.lng.toFixed(5)}`
}
