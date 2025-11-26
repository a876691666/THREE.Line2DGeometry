/**
 * Line2DGeometry - Creates a 2D line geometry with width from a path shape
 *
 * This class generates a BufferGeometry for rendering 2D lines with configurable width,
 * handling corner joins and UV mapping for proper texture application.
 *
 * @param {ShapePath} shape - The path shape used to create the geometry
 * @param {Line2DGeometryOptions} options - Configuration options:
 *   - width: Line width in world units (default: 0.000001)
 *   - uvSpread: If true, UV coordinates are normalized to [0,1]; if false, uses actual path length
 *   - UVGenerator: Optional custom UV generator providing f3UV and f4UV functions for triangular and quadrilateral faces
 *
 * @example
 * const path = new THREE.ShapePath();
 * path.moveTo(0, 0);
 * path.lineTo(10, 10);
 * const geometry = new Line2DGeometry(path, { width: 2, uvSpread: true });
 */
import * as THREE from 'three';
const { BufferGeometry, Vector2, Float32BufferAttribute } = THREE;

export const clock = new THREE.Clock();

interface Line2DGeometryOptions {
  width: number;
  uvSpread: boolean;
  UVGenerator?: UVGenerator;
}

interface UVGenerator {
  f3UV(
    geometry: Line2DGeometry,
    startPosition: number,
    endPosition: number,
    totalLength: number,
    isLeft: boolean
  ): THREE.Vector2[];
  f4UV(
    geometry: Line2DGeometry,
    startPosition: number,
    endPosition: number,
    totalLength: number
  ): THREE.Vector2[];
}

interface ShapeCurve {
  v1: THREE.Vector2;
  v2: THREE.Vector2;
  getLength(): number;
}

interface PolylineSegment {
  lineIndex: number;
  curve: ShapeCurve;
  v1: THREE.Vector2;
  v2: THREE.Vector2;
  vv1: [THREE.Vector2, THREE.Vector2];
  vv2: [THREE.Vector2, THREE.Vector2];
  angle: number;
  length: number;
  endPosition: number;
  startPosition: number;
}

function getAngle(v1: THREE.Vector2, v2: THREE.Vector2): number {
  const arr = v2.clone().sub(v1).toArray().reverse() as [number, number];
  return Math.atan2.apply(Math, arr);
}

function getVertical(
  v1: THREE.Vector2,
  v2: THREE.Vector2,
  width: number = 5
): [THREE.Vector2, THREE.Vector2] {
  const angle = getAngle(v1, v2);
  return [
    new THREE.Vector2(
      Math.sin(angle) * width + v1.x,
      -Math.cos(angle) * width + v1.y
    ),
    new THREE.Vector2(
      -Math.sin(angle) * width + v1.x,
      Math.cos(angle) * width + v1.y
    )
  ];
}

// Epsilon for floating point comparison
const EPSILON = 1e-6;
/**
 * Calculate the intersection point of two lines
 *
 * Solves for the intersection coordinates of two lines using line equations.
 * Line 1 is defined by points a and b, Line 2 is defined by points c and d.
 *
 * Algorithm:
 * 1. Calculate slope k0 and intercept e for Line 1: y = k0 * x + e
 * 2. Calculate slope k1 and intercept e1 for Line 2: y = k1 * x + e1
 * 3. Solve for intersection x-coordinate: x = (e1 - e) / (k0 - k1)
 * 4. Substitute to find y-coordinate: y = k0 * x + e
 *
 * @param {THREE.Vector2} a - Start point of Line 1
 * @param {THREE.Vector2} b - End point of Line 1
 * @param {THREE.Vector2} c - Start point of Line 2
 * @param {THREE.Vector2} d - End point of Line 2
 * @returns {THREE.Vector2} The intersection point of the two lines. Returns point a if the result is invalid (NaN or Infinity)
 */
function crossover(
  a: THREE.Vector2,
  b: THREE.Vector2,
  c: THREE.Vector2,
  d: THREE.Vector2
): THREE.Vector2 {
  if (
    (b.x - a.x === 0 && d.x - c.x === 0) ||
    (Math.abs(b.x - a.x) < EPSILON && Math.abs(d.x - c.x) < EPSILON)
  ) {
    // Both lines are vertical, cannot calculate intersection, return point a
    return a;
  }
  // Calculate slope of Line 1 (a->b), avoid division by zero
  const k0 = (b.y - a.y) / (b.x - a.x || 1);
  // Calculate intercept of Line 1: e = y - k * x
  const e = b.y - k0 * b.x;

  // Calculate slope of Line 2 (c->d), avoid division by zero
  const k1 = (d.y - c.y) / (d.x - c.x || 1);
  // Calculate intercept of Line 2
  const e1 = d.y - k1 * d.x;

  // Solve for x-coordinate of intersection: k0 * x + e = k1 * x + e1
  const x = (e1 - e) / (k0 - k1);
  // Solve for y-coordinate of intersection
  const y = k0 * x + e;

  // Check if the result is valid
  if (
    Number.isNaN(x) ||
    Number.isNaN(y) ||
    Math.abs(x) + Math.abs(y) === Infinity
  ) {
    // If result is invalid (parallel lines, coincident lines, or other anomalies), return first point as default
    return a;
  }
  return new THREE.Vector2(x, y);
}

class Line2DGeometry extends BufferGeometry {
  declare type: string;
  declare parameters: {
    shape: THREE.Shape;
    options: Line2DGeometryOptions;
  };

  constructor(
    shape: THREE.Shape,
    options: Line2DGeometryOptions = {
      width: 0.000001,
      uvSpread: false
    }
  ) {
    super();

    this.type = 'Line2DGeometry';

    this.parameters = {
      shape: shape,
      options: options
    };
    const tLength = shape.getLength();
    const totalLength = options.uvSpread ? 1 : tLength;
    const polyline: PolylineSegment[] = shape.curves.map(
      (item: any, index: number) => {
        return {
          lineIndex: index,
          curve: item,
          v1: item.v1,
          v2: item.v2,
          vv1: getVertical(item.v1, item.v2, options.width),
          vv2: getVertical(item.v2, item.v1, options.width),
          angle: (getAngle(item.v1, item.v2) / Math.PI) * 180,
          length: item.getLength(),
          endPosition: (shape as any).cacheLengths[index],
          startPosition: (shape as any).cacheLengths[index] - item.getLength()
        };
      }
    );

    const scope = this;

    const uvgen: UVGenerator =
      options.UVGenerator !== undefined
        ? options.UVGenerator
        : WorldUVGenerator;

    const verticesArray: number[] = [];
    const uvArray: number[] = [];

    for (let i = 0; i < polyline.length; i++) {
      let a1: THREE.Vector2,
        a2: THREE.Vector2,
        a3: THREE.Vector2,
        a4: THREE.Vector2;
      let b1: THREE.Vector2,
        b2: THREE.Vector2,
        b3: THREE.Vector2,
        b4: THREE.Vector2;
      let c1: THREE.Vector2,
        c2: THREE.Vector2,
        c3: THREE.Vector2,
        c4: THREE.Vector2;
      [a1, a2] = polyline[i].vv1;
      [a3, a4] = polyline[i].vv2;
      const face4: THREE.Vector2[] = [a1, a2, a3, a4];
      const face3: THREE.Vector2[] = [];
      if (i < polyline.length - 1) {
        // Get next segment parameters
        [b1, b2] = polyline[i + 1].vv1;
        [b3, b4] = polyline[i + 1].vv2;
        const angle = polyline[i + 1].angle - polyline[i].angle;
        if ((angle > 0 && angle < 180) || angle < -180) {
          let cross = crossover(a2, a3, b2, b3);
          face4[2] = cross;
          face3.push(a4, cross, b1);
        } else if (angle !== 0 && angle !== 180) {
          let cross = crossover(a1, a4, b1, b4);
          // if (!checkPointInLine(a1, a4, cross))
          //   cross = crossover(a1, a2, b2, b3);
          face4[3] = cross;
          face3.push(a3, cross, b2);
        }
      }
      if (i > 0) {
        // Get previous segment parameters
        [c1, c2] = polyline[i - 1].vv1;
        [c3, c4] = polyline[i - 1].vv2;
        const angle = polyline[i].angle - polyline[i - 1].angle;
        if ((angle > 0 && angle < 180) || angle < -180) {
          let cross = crossover(a2, a3, c2, c3);
          face4[1] = cross;
        } else if (angle !== 0 && angle !== 180) {
          let cross = crossover(a1, a4, c1, c4);
          face4[0] = cross;
        }
      }
      // console.log(JSON.stringify(face4), '\n\n');
      f4(
        face4[0],
        face4[1],
        face4[2],
        face4[3],
        polyline[i].startPosition,
        polyline[i].endPosition,
        totalLength
      );
      if (face3.length) {
        const angle = polyline[i + 1].angle - polyline[i].angle;
        f3(
          face3[0],
          face3[1],
          face3[2],
          polyline[i].endPosition,
          polyline[i + 1].startPosition,
          totalLength,
          angle > 0 || angle < -180
        );
      }
    }

    function f3(
      a: THREE.Vector2,
      b: THREE.Vector2,
      c: THREE.Vector2,
      startPosition: number,
      endPosition: number,
      totalLength: number,
      isLeft: boolean
    ): void {
      addVertex(b);
      addVertex(a);
      addVertex(c);

      const uvs = uvgen.f3UV(
        scope,
        startPosition,
        endPosition,
        totalLength,
        isLeft
      );

      addUV(uvs[1]);
      addUV(uvs[0]);
      addUV(uvs[2]);
    }

    function f4(
      a: THREE.Vector2,
      b: THREE.Vector2,
      c: THREE.Vector2,
      d: THREE.Vector2,
      startPosition: number,
      endPosition: number,
      totalLength: number
    ): void {
      // 124 -> 214
      addVertex(b);
      addVertex(a);
      addVertex(d);

      addVertex(c);
      addVertex(b);
      addVertex(d);

      const uvs = uvgen.f4UV(scope, startPosition, endPosition, totalLength);

      addUV(uvs[1]);
      addUV(uvs[0]);
      addUV(uvs[3]);

      addUV(uvs[2]);
      addUV(uvs[1]);
      addUV(uvs[3]);
    }

    function addVertex(vec2: THREE.Vector2): void {
      verticesArray.push(vec2.x);
      verticesArray.push(vec2.y);
      verticesArray.push(0);
    }

    function addUV(vector2: THREE.Vector2): void {
      uvArray.push(vector2.x);
      uvArray.push(vector2.y);
    }

    this.setAttribute('position', new Float32BufferAttribute(verticesArray, 3));
    this.setAttribute('uv', new Float32BufferAttribute(uvArray, 2));
  }
}

const WorldUVGenerator: UVGenerator = {
  f3UV: function (
    _geometry: Line2DGeometry,
    startPosition: number,
    endPosition: number,
    totalLength: number,
    isLeft: boolean
  ): THREE.Vector2[] {
    return [
      new Vector2(startPosition / totalLength, isLeft ? 1 : 0),
      new Vector2(startPosition / totalLength, isLeft ? 0 : 1),
      new Vector2(endPosition / totalLength, isLeft ? 1 : 0)
    ];
  },
  f4UV: function (
    _geometry: Line2DGeometry,
    startPosition: number,
    endPosition: number,
    totalLength: number
  ): THREE.Vector2[] {
    return [
      new Vector2(startPosition / totalLength, 1),
      new Vector2(startPosition / totalLength, 0),
      new Vector2(endPosition / totalLength, 0),
      new Vector2(endPosition / totalLength, 1)
    ];
  }
};

export { Line2DGeometry };
