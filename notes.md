Not all hexagons are the same shape. If you try and tile the hexasphere with an instanced hexagon it will not work without distorsion.

Strategies for instanced rendering:

- Find transform for each hexagon tile to make it align with the points on the sphere then distort to sphere in the shader.
- Use a non-spherical goldberg polyhedron and then distort the points to the sphere in the shader. This needs all the hexagons to be the same, which might not be true?

Strategy for merged geometry render:

- Merge all low detail geometry into one mesh and use some kind of shader to disable it.
    - How will vertices know which chunk they're in?
