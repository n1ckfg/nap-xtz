import * as THREE from 'three';

export class Palette extends THREE.Group {
    constructor(radius = 0.5, swatchSize = 0.1) {
        super();

        this.colors = [
            { name: 'Maroon', hex: 0x800000 },  // 12 o'clock
            { name: 'Red', hex: 0xff0000 },     // 1 o'clock
            { name: 'Orange', hex: 0xff8000 },  // 2 o'clock
            { name: 'Yellow', hex: 0xffff00 },  // 3 o'clock
            { name: 'Green', hex: 0x00ff00 },   // 4 o'clock
            { name: 'Teal', hex: 0x008080 },    // 5 o'clock
            { name: 'Blue', hex: 0x0000ff },    // 6 o'clock
            { name: 'Purple', hex: 0x800080 },  // 7 o'clock
            { name: 'Pink', hex: 0xff69b4 },    // 8 o'clock
            { name: 'White', hex: 0xffffff },   // 9 o'clock
            { name: 'Gray', hex: 0x808080 },    // 10 o'clock
            { name: 'Black', hex: 0x000000 }    // 11 o'clock
        ];

        this.radius = radius;
        this.swatchSize = swatchSize;
        this.swatches = [];
        this.selectedIndex = 0;

        this._createSwatches();
    }

    _createSwatches() {
        const geometry = new THREE.CircleGeometry(this.swatchSize, 16);
        const whiteRimGeo = new THREE.RingGeometry(this.swatchSize, this.swatchSize * 1.1, 16);
        const blackRimGeo = new THREE.RingGeometry(this.swatchSize * 1.1, this.swatchSize * 1.2, 16);

        const whiteRimMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false
        });
        const blackRimMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false
        });

        for (let i = 0; i < this.colors.length; i++) {
            // Clock position: 12 o'clock is up (negative Z in default view)
            // Angle starts at top and goes clockwise
            const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
            const x = Math.cos(angle) * this.radius;
            const y = Math.sin(angle) * this.radius;

            const material = new THREE.MeshBasicMaterial({
                color: this.colors[i].hex,
                side: THREE.DoubleSide,
                depthTest: false,
                depthWrite: false
            });

            // Create swatch group to hold color circle and rims
            const swatchGroup = new THREE.Group();
            swatchGroup.position.set(x, y, 0);
            swatchGroup.userData = { index: i, color: this.colors[i] };

            // Black outer rim (render first/behind)
            const blackRim = new THREE.Mesh(blackRimGeo, blackRimMat);
            blackRim.renderOrder = 997;
            swatchGroup.add(blackRim);

            // White inner rim
            const whiteRim = new THREE.Mesh(whiteRimGeo, whiteRimMat);
            whiteRim.renderOrder = 998;
            swatchGroup.add(whiteRim);

            // Color circle on top
            const swatch = new THREE.Mesh(geometry, material);
            swatch.renderOrder = 999;
            swatchGroup.add(swatch);

            this.swatches.push(swatchGroup);
            this.add(swatchGroup);
        }

        // Create selection indicator
        const ringGeo = new THREE.RingGeometry(this.swatchSize * 1.1, this.swatchSize * 1.3, 16);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false
        });
        this.selectionRing = new THREE.Mesh(ringGeo, ringMat);
        this.selectionRing.renderOrder = 1000;
        this.add(this.selectionRing);
        this._updateSelectionRing();
    }

    _updateSelectionRing() {
        const swatch = this.swatches[this.selectedIndex];
        this.selectionRing.position.copy(swatch.position);
    }

    /**
     * Select a color by index (0-11)
     * @param {number} index
     */
    select(index) {
        this.selectedIndex = Math.max(0, Math.min(11, index));
        this._updateSelectionRing();
    }

    /**
     * Get the currently selected color
     * @returns {{ name: string, hex: number }}
     */
    getSelectedColor() {
        return this.colors[this.selectedIndex];
    }

    /**
     * Get the selected color as a THREE.Color
     * @returns {THREE.Color}
     */
    getSelectedThreeColor() {
        return new THREE.Color(this.colors[this.selectedIndex].hex);
    }

    /**
     * Check if a world position hits a swatch and select it
     * @param {THREE.Vector3} worldPosition
     * @param {number} [threshold] - Hit distance threshold
     * @returns {boolean} True if a swatch was hit
     */
    hitTest(worldPosition, threshold = 0.1) {
        const localPos = this.worldToLocal(worldPosition.clone());
        localPos.z = 0; // Flatten to palette plane

        for (let i = 0; i < this.swatches.length; i++) {
            const swatchPos = this.swatches[i].position;
            const dist = localPos.distanceTo(swatchPos);
            if (dist < this.swatchSize + threshold) {
                this.select(i);
                return true;
            }
        }
        return false;
    }
}
