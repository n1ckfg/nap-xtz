import * as THREE from 'three';

// Number of points to trim from start and end of each stroke
const pointsTrim = 5;

// Flicker duration and interval for undo/clear animations
const FLICKER_DURATION = 300; // ms
const FLICKER_INTERVAL = 50; // ms

export class Stroke {
    constructor(color = 0xffffff) {
        this.points = [];
        this.color = color;
        this.smoothReps = 10;
        this.splitReps = 2;
    }

    /**
     * Adds a point to the stroke
     * @param {THREE.Vector3} point - Position to add
     */
    addPoint(point) {
        this.points.push(point.clone());
    }

    /**
     * Converts points to line segments format (pairs of points)
     * @returns {THREE.Vector3[]} Array of points in line segments format
     */
    toLineSegments() {
        const segments = [];
        for (let i = 1; i < this.points.length; i++) {
            segments.push(this.points[i - 1]);
            segments.push(this.points[i]);
        }
        // Close the loop back to origin
        if (this.points.length > 2) {
            segments.push(this.points[this.points.length - 1]);
            segments.push(this.points[0]);
        }
        return segments;
    }

    /**
     * Creates a filled mesh geometry using ear-clipping triangulation
     * Projects points to 2D for triangulation, then uses indices on 3D points
     * @returns {THREE.BufferGeometry} The fill geometry
     */
    toFillGeometry() {
        if (this.points.length < 3) return null;

        // Calculate best-fit plane normal using Newell's method
        const normal = new THREE.Vector3(0, 0, 0);
        for (let i = 0; i < this.points.length; i++) {
            const curr = this.points[i];
            const next = this.points[(i + 1) % this.points.length];
            normal.x += (curr.y - next.y) * (curr.z + next.z);
            normal.y += (curr.z - next.z) * (curr.x + next.x);
            normal.z += (curr.x - next.x) * (curr.y + next.y);
        }
        normal.normalize();

        // Create basis vectors for projection
        let up = new THREE.Vector3(0, 1, 0);
        if (Math.abs(normal.dot(up)) > 0.9) {
            up = new THREE.Vector3(1, 0, 0);
        }
        const basisX = new THREE.Vector3().crossVectors(up, normal).normalize();
        const basisY = new THREE.Vector3().crossVectors(normal, basisX).normalize();

        // Project points to 2D
        const points2D = this.points.map(p => new THREE.Vector2(
            p.dot(basisX),
            p.dot(basisY)
        ));

        // Use Three.js ShapeUtils for triangulation
        const indices = THREE.ShapeUtils.triangulateShape(points2D, []);

        // Build geometry with original 3D points
        const vertices = [];
        for (const p of this.points) {
            vertices.push(p.x, p.y, p.z);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices.flat());
        geometry.computeVertexNormals();

        return geometry;
    }

    /**
     * Subdivides the stroke by inserting midpoints between each pair of points
     */
    splitStroke() {
        for (let i = 1; i < this.points.length; i += 2) {
            const x = (this.points[i].x + this.points[i - 1].x) / 2;
            const y = (this.points[i].y + this.points[i - 1].y) / 2;
            const z = (this.points[i].z + this.points[i - 1].z) / 2;
            const p = new THREE.Vector3(x, y, z);
            this.points.splice(i, 0, p);
        }
    }

    /**
     * Smooths the stroke using weighted average of neighboring points
     */
    smoothStroke() {
        const weight = 18;
        const scale = 1.0 / (weight + 2);
        const nPointsMinusTwo = this.points.length - 2;

        for (let i = 1; i < nPointsMinusTwo; i++) {
            const lower = this.points[i - 1];
            const center = this.points[i];
            const upper = this.points[i + 1];

            center.x = (lower.x + weight * center.x + upper.x) * scale;
            center.y = (lower.y + weight * center.y + upper.y) * scale;
            center.z = (lower.z + weight * center.z + upper.z) * scale;
        }
    }

    /**
     * Refines the stroke by splitting and smoothing multiple times
     */
    refine() {
        if (this.points.length < 2) return;

        // First do splitReps iterations of split + smooth
        for (let i = 0; i < this.splitReps; i++) {
            this.splitStroke();
            this.smoothStroke();
        }
        // Then do remaining smooth-only iterations
        for (let i = 0; i < this.smoothReps - this.splitReps; i++) {
            this.smoothStroke();
        }
    }

    /**
     * Calculates the best-fit plane normal for this stroke using Newell's method
     * @returns {THREE.Vector3} The normalized normal vector
     */
    computeNormal() {
        if (this.points.length < 3) return new THREE.Vector3(0, 0, 1);

        const normal = new THREE.Vector3(0, 0, 0);
        for (let i = 0; i < this.points.length; i++) {
            const curr = this.points[i];
            const next = this.points[(i + 1) % this.points.length];
            normal.x += (curr.y - next.y) * (curr.z + next.z);
            normal.y += (curr.z - next.z) * (curr.x + next.x);
            normal.z += (curr.x - next.x) * (curr.y + next.y);
        }
        normal.normalize();

        // Fallback if normal is zero
        if (normal.lengthSq() < 0.001) {
            return new THREE.Vector3(0, 0, 1);
        }
        return normal;
    }

    /**
     * Offsets all points along the stroke's normal by a given amount
     * @param {number} amount - Distance to offset
     */
    offsetAlongNormal(amount) {
        if (this.points.length < 3 || amount === 0) return;

        const normal = this.computeNormal();
        for (const point of this.points) {
            point.addScaledVector(normal, amount);
        }
    }
}

export class Frame extends THREE.Group {
    /**
     * @param {THREE.Object3D} worldOrigin - The world origin node this frame is parented to
     * @param {number} [color=0xffffff] - Default stroke color
     */
    constructor(worldOrigin, color = 0xffffff) {
        super();
        this.strokes = [];
        this.worldOrigin = worldOrigin;
        this.activeStroke = null;
        this.defaultColor = color;

        // Create the line segments geometry and mesh with vertex colors
        this.geometry = new THREE.BufferGeometry();
        this.material = new THREE.LineBasicMaterial({ vertexColors: true });
        this.lineMesh = new THREE.LineSegments(this.geometry, this.material);
        this.lineMesh.frustumCulled = false;
        this.add(this.lineMesh);

        // Per-controller active stroke state (keyed by controller ID)
        this._activeStrokes = new Map();  // controllerId -> Stroke
        this._tempPoints = new Map();     // controllerId -> Vector3[]
        this._rawPoints = new Map();      // controllerId -> Vector3[]

        // Fill meshes for closed strokes (white to match line)
        this._fillMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide
        });
        this._fillMeshes = [];           // Array of fill meshes for completed strokes
        this._tempFillMeshes = new Map(); // controllerId -> temp fill mesh

        // Stroke counter for Z-offset to prevent z-fighting
        this._strokeCounter = 0;
        this._zOffsetPerStroke = 0.002;

        // Parent this frame to the world origin
        worldOrigin.add(this);
    }

    /**
     * Check if a specific controller has an active stroke
     * @param {number|string} controllerId
     * @returns {boolean}
     */
    hasActiveStroke(controllerId) {
        return this._activeStrokes.has(controllerId);
    }

    /**
     * Begins a new stroke at the given position for a specific controller
     * @param {THREE.Vector3} worldPosition - Starting world position
     * @param {number|string} controllerId - Controller identifier
     * @param {number} [color] - Stroke color (optional)
     * @returns {Stroke} The new stroke
     */
    beginStroke(worldPosition, controllerId, color) {
        const stroke = new Stroke(color ?? this.defaultColor);
        this._activeStrokes.set(controllerId, stroke);
        this._tempPoints.set(controllerId, []);
        this._rawPoints.set(controllerId, []);

        // Convert world position to local and buffer it (trimming applied later)
        const localPoint = this.worldToLocal(worldPosition.clone());
        this._rawPoints.get(controllerId).push(localPoint);

        return stroke;
    }

    /**
     * Continues the active stroke with a new point for a specific controller
     * @param {THREE.Vector3} worldPosition - World position to add
     * @param {number|string} controllerId - Controller identifier
     */
    continueStroke(worldPosition, controllerId) {
        const activeStroke = this._activeStrokes.get(controllerId);
        if (!activeStroke) return;

        const rawPoints = this._rawPoints.get(controllerId);
        const tempPoints = this._tempPoints.get(controllerId);

        const localPoint = this.worldToLocal(worldPosition.clone());
        rawPoints.push(localPoint);

        // Add point that is pointsTrim behind current, skipping first pointsTrim
        // This trims pointsTrim from start and pointsTrim from end (end points stay in buffer)
        const addIndex = rawPoints.length - 1 - pointsTrim;
        if (addIndex >= pointsTrim) {
            const pointToAdd = rawPoints[addIndex];
            activeStroke.addPoint(pointToAdd);
            tempPoints.push(pointToAdd);
            this._refreshGeometry();
        }
    }

    /**
     * Ends the current stroke for a specific controller
     * @param {number|string} controllerId - Controller identifier
     */
    endStroke(controllerId) {
        const activeStroke = this._activeStrokes.get(controllerId);

        // Last pointsTrim points remain in _rawPoints buffer and are discarded
        if (activeStroke && activeStroke.points.length > 1) {
            // Refine the stroke (split + smooth) before finalizing
            activeStroke.refine();

            // Offset along normal to prevent z-fighting with other strokes
            activeStroke.offsetAlongNormal(this._strokeCounter * this._zOffsetPerStroke);
            this._strokeCounter++;

            this.strokes.push(activeStroke);
        }

        this._activeStrokes.delete(controllerId);
        this._tempPoints.delete(controllerId);
        this._rawPoints.delete(controllerId);

        // Clean up temp fill mesh
        const tempFill = this._tempFillMeshes.get(controllerId);
        if (tempFill) {
            this.remove(tempFill);
            tempFill.geometry.dispose();
            this._tempFillMeshes.delete(controllerId);
        }

        // Final refresh with completed stroke
        this._refreshGeometry();
    }

    /**
     * Rebuilds the geometry from all strokes plus active temp points from all controllers
     * @private
     */
    _refreshGeometry() {
        const positions = [];
        const colors = [];

        // Remove old fill meshes
        for (const mesh of this._fillMeshes) {
            this.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
        this._fillMeshes = [];

        // Add all completed strokes and their fills
        for (const stroke of this.strokes) {
            const segments = stroke.toLineSegments();
            const strokeColor = new THREE.Color(stroke.color);

            for (const point of segments) {
                positions.push(point.x, point.y, point.z);
                colors.push(strokeColor.r, strokeColor.g, strokeColor.b);
            }

            // Create fill mesh for completed stroke with stroke's color
            const fillGeo = stroke.toFillGeometry();
            if (fillGeo) {
                const fillMat = new THREE.MeshBasicMaterial({
                    color: stroke.color,
                    side: THREE.DoubleSide
                });
                const fillMesh = new THREE.Mesh(fillGeo, fillMat);
                fillMesh.frustumCulled = false;
                this.add(fillMesh);
                this._fillMeshes.push(fillMesh);
            }
        }

        // Add temp points from all active strokes
        for (const [controllerId, tempPoints] of this._tempPoints.entries()) {
            const activeStroke = this._activeStrokes.get(controllerId);
            const strokeColor = new THREE.Color(activeStroke ? activeStroke.color : 0xffffff);

            for (let i = 1; i < tempPoints.length; i++) {
                positions.push(tempPoints[i - 1].x, tempPoints[i - 1].y, tempPoints[i - 1].z);
                colors.push(strokeColor.r, strokeColor.g, strokeColor.b);
                positions.push(tempPoints[i].x, tempPoints[i].y, tempPoints[i].z);
                colors.push(strokeColor.r, strokeColor.g, strokeColor.b);
            }
            // Close the loop back to origin while drawing
            if (tempPoints.length > 2) {
                const last = tempPoints[tempPoints.length - 1];
                const first = tempPoints[0];
                positions.push(last.x, last.y, last.z);
                colors.push(strokeColor.r, strokeColor.g, strokeColor.b);
                positions.push(first.x, first.y, first.z);
                colors.push(strokeColor.r, strokeColor.g, strokeColor.b);
            }

            // Update temp fill mesh for this controller
            this._updateTempFill(controllerId, tempPoints);
        }

        // Remove temp fills for controllers no longer drawing
        for (const [controllerId, mesh] of this._tempFillMeshes.entries()) {
            if (!this._tempPoints.has(controllerId)) {
                this.remove(mesh);
                mesh.geometry.dispose();
                mesh.material.dispose();
                this._tempFillMeshes.delete(controllerId);
            }
        }

        // Update geometry with positions and colors
        this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        this.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }

    /**
     * Updates or creates a temp fill mesh for active drawing
     * @private
     */
    _updateTempFill(controllerId, tempPoints) {
        // Remove existing temp fill
        const existing = this._tempFillMeshes.get(controllerId);
        if (existing) {
            this.remove(existing);
            existing.geometry.dispose();
            existing.material.dispose();
            this._tempFillMeshes.delete(controllerId);
        }

        if (tempPoints.length < 3) {
            return;
        }

        // Calculate best-fit plane normal using Newell's method
        const normal = new THREE.Vector3(0, 0, 0);
        for (let i = 0; i < tempPoints.length; i++) {
            const curr = tempPoints[i];
            const next = tempPoints[(i + 1) % tempPoints.length];
            normal.x += (curr.y - next.y) * (curr.z + next.z);
            normal.y += (curr.z - next.z) * (curr.x + next.x);
            normal.z += (curr.x - next.x) * (curr.y + next.y);
        }
        normal.normalize();

        // Create basis vectors for projection
        let up = new THREE.Vector3(0, 1, 0);
        if (Math.abs(normal.dot(up)) > 0.9) {
            up = new THREE.Vector3(1, 0, 0);
        }
        const basisX = new THREE.Vector3().crossVectors(up, normal).normalize();
        const basisY = new THREE.Vector3().crossVectors(normal, basisX).normalize();

        // Project points to 2D
        const points2D = tempPoints.map(p => new THREE.Vector2(
            p.dot(basisX),
            p.dot(basisY)
        ));

        // Use Three.js ShapeUtils for triangulation
        let indices;
        try {
            indices = THREE.ShapeUtils.triangulateShape(points2D, []);
        } catch (e) {
            return; // Triangulation failed, skip fill
        }

        if (indices.length === 0) return;

        // Build geometry with original 3D points
        const vertices = [];
        for (const p of tempPoints) {
            vertices.push(p.x, p.y, p.z);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices.flat());
        geometry.computeVertexNormals();

        // Use active stroke's color for the fill
        const activeStroke = this._activeStrokes.get(controllerId);
        const fillColor = activeStroke ? activeStroke.color : 0xffffff;
        const fillMat = new THREE.MeshBasicMaterial({
            color: fillColor,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, fillMat);
        mesh.frustumCulled = false;
        this.add(mesh);
        this._tempFillMeshes.set(controllerId, mesh);
    }

    /**
     * Removes the last completed stroke
     * @returns {boolean} True if a stroke was removed, false if no strokes to undo
     */
    undo() {
        if (this.strokes.length === 0) {
            return false;
        }
        this.strokes.pop();
        this._refreshGeometry();
        return true;
    }

    /**
     * Flickers the last stroke for 0.3 seconds then removes it
     * @param {Function} [onComplete] - Callback when flicker and removal complete
     * @returns {boolean} True if undo started, false if no strokes
     */
    undoWithFlicker(onComplete) {
        if (this.strokes.length === 0) {
            if (onComplete) onComplete(false);
            return false;
        }

        // Get the last stroke and create a temporary mesh for it
        const strokeToRemove = this.strokes[this.strokes.length - 1];
        const segments = strokeToRemove.toLineSegments();
        const tempGeometry = new THREE.BufferGeometry().setFromPoints(segments);
        const tempMaterial = new THREE.LineBasicMaterial({ color: strokeToRemove.color });
        const tempMesh = new THREE.LineSegments(tempGeometry, tempMaterial);
        tempMesh.frustumCulled = false;
        this.add(tempMesh);

        // Remove the stroke from main geometry immediately (temp mesh shows it)
        this.strokes.pop();
        this._refreshGeometry();

        // Flicker the temp mesh
        const startTime = performance.now();
        const flicker = () => {
            const elapsed = performance.now() - startTime;
            if (elapsed < FLICKER_DURATION) {
                tempMesh.visible = Math.floor(elapsed / FLICKER_INTERVAL) % 2 === 0;
                requestAnimationFrame(flicker);
            } else {
                // Cleanup temp mesh
                this.remove(tempMesh);
                tempGeometry.dispose();
                tempMaterial.dispose();
                if (onComplete) onComplete(true);
            }
        };
        flicker();
        return true;
    }

    /**
     * Clears all strokes and resets the world origin
     */
    clear() {
        this.strokes = [];
        this._activeStrokes.clear();
        this._tempPoints.clear();
        this._rawPoints.clear();

        // Clear fill meshes
        for (const mesh of this._fillMeshes) {
            this.remove(mesh);
            mesh.geometry.dispose();
        }
        this._fillMeshes = [];

        for (const mesh of this._tempFillMeshes.values()) {
            this.remove(mesh);
            mesh.geometry.dispose();
        }
        this._tempFillMeshes.clear();

        // Reset stroke counter
        this._strokeCounter = 0;

        // Clear geometry
        this.geometry.setFromPoints([]);

        // Reset world origin transform
        this.worldOrigin.position.set(0, 0, 0);
        this.worldOrigin.quaternion.identity();
        this.worldOrigin.scale.set(1, 1, 1);
    }

    /**
     * Flickers the entire Frame for 0.3 seconds then clears everything
     * @param {Function} [onComplete] - Callback when flicker and clear complete
     */
    clearWithFlicker(onComplete) {
        // Flicker the entire line mesh
        const startTime = performance.now();
        const flicker = () => {
            const elapsed = performance.now() - startTime;
            if (elapsed < FLICKER_DURATION) {
                this.lineMesh.visible = Math.floor(elapsed / FLICKER_INTERVAL) % 2 === 0;
                requestAnimationFrame(flicker);
            } else {
                this.lineMesh.visible = true;
                this.clear();
                if (onComplete) onComplete();
            }
        };
        flicker();
    }
}
