# THREE.Line2DGeometry

Creates a 2D line geometry with width from a path shape for Three.js

## Installation

```bash
npm install three-line2d-geometry
```

## Usage

```typescript
import * as THREE from 'three';
import { Line2DGeometry } from 'three-line2d-geometry';

// Create a path shape
const path = new THREE.Shape();
path.moveTo(0, 0);
path.lineTo(10, 10);
path.lineTo(20, 0);

// Create line geometry with width
const geometry = new Line2DGeometry(path, {
  width: 2,
  uvSpread: true
});

// Create mesh
const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `width` | `number` | `0.000001` | Line width in world units |
| `uvSpread` | `boolean` | `false` | If true, UV coordinates are normalized to [0,1]; if false, uses actual path length |
| `UVGenerator` | `object` | `undefined` | Optional custom UV generator |

## Development

```bash
# Install dependencies
npm install

# Development
npm run dev

# Build
npm run build
```

## License

MIT
