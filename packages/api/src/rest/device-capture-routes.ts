/**
 * Device capture (QR / camera / geolocation / deep link) REST routes.
 *
 *   POST /api/v1/captures
 *   GET  /api/v1/captures
 *   GET  /api/v1/captures/:id
 *   DELETE /api/v1/captures/:id
 *   POST /api/v1/deep-links/resolve
 */

export { generateDeviceCaptureRoutes } from './api-tooling-routes.js';
