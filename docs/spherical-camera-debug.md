# Spherical Camera System Debug Notes

## Problem Description
- Player is currently inside the sphere (should be outside)
- Camera rotation feels like it "always has up" instead of being relative to sphere surface
- Need proper spherical coordinate system for camera orientation

## Known Working Solution (C++)
The C++ code shows a working approach:
1. Track horizontal/vertical angles in world space
2. Create world-axes rotation quaternion
3. Build local transform matrix using pole and orientation vectors
4. Apply world rotation to local transform

## Key Concepts
- `m_pole`: The "up" vector relative to sphere surface at current position
- `m_orientation`: The direction from sphere center to player position (surface normal)
- `m_position`: Player position on sphere surface
- `m_horizontal`, `m_vertical`: Mouse accumulated rotation angles

## Current Issues to Debug
1. Player position relative to sphere center
2. Camera orientation matrix construction
3. Movement input transformation
4. Sphere surface normal calculation

## Debug Values to Track
- Player position (world space)
- Distance from sphere center
- Surface normal at player position
- Camera forward/up/right vectors
- Mouse rotation angles (horizontal/vertical)
- Movement input vectors (before/after transformation)

## Test Cases
1. Start at north pole (0, 3000, 0) - should look "down" at sphere
2. Move to equator - camera should naturally reorient
3. Move to south pole - "up" should be opposite of north pole
4. Continuous movement should feel natural without sudden orientation jumps
