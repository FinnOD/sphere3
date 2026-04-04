/**
 * Centralized constants for the sphere3 game.
 * Organized by domain for easier maintenance.
 */

import { exp } from 'three/tsl';

// ============================================================================
// WORLD & GEOMETRY
// ============================================================================

/** Radius of the hollow sphere world. Single source of truth for all geometry. */
export const SPHERE_RADIUS = 500;

/** Height offset of player camera from sphere surface toward center. */
export const PLAYER_HEIGHT = 2;

/** Number of subdivision levels for hexasphere tiles. Has to be >= 2 */
export const HEXASPHERE_DETAIL = 16;

/** Detail level (subdivision count) for high-detail chunk geometry. */
export const CHUNK_DETAIL_LEVEL_HIGH = 5;

/** Number of trees spawned per chunk. */
export const TREES_PER_CHUNK = Math.floor(SPHERE_RADIUS / (4 * HEXASPHERE_DETAIL));

// ============================================================================
// CAMERA
// ============================================================================

/** Vertical field of view in degrees. */
export const CAMERA_FOV = 85;

/** Near clipping plane for camera. */
export const CAMERA_NEAR = 0.1;

/** Far clipping plane for camera. */
export const CAMERA_FAR = SPHERE_RADIUS * 3;

// ============================================================================
// PLAYER MOVEMENT
// ============================================================================

/** Base walking speed (units per second). */
export const PLAYER_SPEED = 4;

/** Multiplier applied to speed when running. */
export const PLAYER_RUN_MULTIPLIER = 60;

/** Mouse sensitivity for camera rotation (radians per pixel). */
export const MOUSE_SENSITIVITY = 0.003;

/** Maximum vertical look angle in radians (~±85°). */
export const MAX_PITCH = (CAMERA_FOV * Math.PI) / 180;
