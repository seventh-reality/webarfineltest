// ====== Imports ======

import OnirixSDK from "https://unpkg.com/@onirix/ar-engine-sdk@1.8.4/dist/ox-sdk.esm.js";
import * as THREE from "https://cdn.skypack.dev/three@0.136.0";
import { GLTFLoader } from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/loaders/GLTFLoader.js";

class OxExperience {

    _renderer = null;
    _scene = null;
    _camera = null;
    _model = null;
    _surfacePlaceholder = null; // Surface placeholder reference
    oxSDK;
    _modelPlaced = false;
    _carPlaced = false; // Model will be placed after click
    _lastPinchDistance = null; // To track pinch zoom
    _lastTouchX = null; // To track single-finger rotation

    async init() {
        this._raycaster = new THREE.Raycaster();
        this._animationMixers = [];
        this._clock = new THREE.Clock(true);
        this._carPlaced = false;

        const renderCanvas = await this.initSDK();  // Initialize SDK with World Tracking mode
        this.setupRenderer(renderCanvas);

        // Load environment map
        const textureLoader = new THREE.TextureLoader();
        this._envMap = textureLoader.load("envmap.jpg");
        this._envMap.mapping = THREE.EquirectangularReflectionMapping;
        this._envMap.encoding = THREE.sRGBEncoding;

        // Create and add the surface placeholder
        this.createSurfacePlaceholder();

        this.oxSDK.subscribe(OnirixSDK.Events.OnFrame, () => {
            const delta = this._clock.getDelta();
            this._animationMixers.forEach((mixer) => {
                mixer.update(delta);
            });
            this.render();
        });

        this.oxSDK.subscribe(OnirixSDK.Events.OnFrame, () => {
            this.render();
        });

        this.oxSDK.subscribe(OnirixSDK.Events.OnPose, (pose) => {
            this.updatePose(pose);
        });

        this.oxSDK.subscribe(OnirixSDK.Events.OnResize, () => {
            this.onResize();
        });

        // Detect SLAM tracking and move the placeholder accordingly
        this.oxSDK.subscribe(OnirixSDK.Events.OnWorldTrackingResult, (trackingResult) => {
            if (!this._carPlaced) {
                // Move the placeholder to the detected position in SLAM
                this._surfacePlaceholder.position.copy(trackingResult.position);
                this._surfacePlaceholder.visible = true; // Ensure the placeholder is visible
            } else {
                this._surfacePlaceholder.visible = false; // Hide the placeholder once the car is placed
            }
        });

        // Load a GLB model (Car or Object)
        const gltfLoader = new GLTFLoader();
        gltfLoader.load("Steerad.glb", (gltf) => {
            this._model = gltf.scene;
            this._model.traverse((child) => {
                if (child.material) {
                    console.log("updating material");
                    child.material.envMap = this._envMap;
                    child.material.needsUpdate = true;
                }
            });
            this._model.scale.set(0.5, 0.5, 0.5);
            this._model.visible = false; // Initially hide the model
            this._scene.add(this._model);
        });

        // Add touch event listeners for pinch zoom and rotation
        this.addTouchListeners();
    }

    async initSDK() {
        // Initialize the Onirix SDK in World Tracking (SLAM) mode
        this.oxSDK = new OnirixSDK("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjUyMDIsInByb2plY3RJZCI6MTQ0MjgsInJvbGUiOjMsImlhdCI6MTYxNjc1ODY5NX0.8F5eAPcBGaHzSSLuQAEgpdja9aEZ6Ca_Ll9wg84Rp5k");

        const config = {
            mode: OnirixSDK.TrackingMode.World,  // Switch to World Tracking (SLAM)
        };

        return this.oxSDK.init(config);
    }

    placeCar() {
        this._carPlaced = true;
        this._model.visible = true; // Show the model when car is placed
        this._model.position.copy(this._surfacePlaceholder.position); // Move model to placeholder's position
        this.oxSDK.start();
    }

    createSurfacePlaceholder() {
        const geometry = new THREE.RingGeometry(0.1, 0.2, 32);
        const material = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(geometry, material);
        ring.rotation.x = -Math.PI / 2; // Rotate to lie flat on the ground
        ring.userData.isPlaceholder = true; // Add a flag for detecting click
        this._scene.add(ring);
        this._surfacePlaceholder = ring;
    }

    isCarPlaced() {
        return this._carPlaced;
    }

    onHitTest(listener) {
        this.oxSDK.subscribe(OnirixSDK.Events.OnWorldTrackingResult, listener);  // Subscribe to World Tracking results
    }

    setupRenderer(renderCanvas) {
        const width = renderCanvas.width;
        const height = renderCanvas.height;

        // Initialize renderer with renderCanvas provided by Onirix SDK
        this._renderer = new THREE.WebGLRenderer({ canvas: renderCanvas, alpha: true });
        this._renderer.setClearColor(0x000000, 0);
        this._renderer.setSize(width, height);
        this._renderer.outputEncoding = THREE.sRGBEncoding;

        // Ask Onirix SDK for camera parameters to create a 3D camera that fits with the AR projection.
        const cameraParams = this.oxSDK.getCameraParameters();
        this._camera = new THREE.PerspectiveCamera(cameraParams.fov, cameraParams.aspect, 0.1, 1000);
        this._camera.matrixAutoUpdate = false;

        // Create an empty scene
        this._scene = new THREE.Scene();

        // Add some lights
        const ambientLight = new THREE.AmbientLight(0xcccccc, 0.4);
        this._scene.add(ambientLight);
        const hemisphereLight = new THREE.HemisphereLight(0xbbbbff, 0x444422);
        this._scene.add(hemisphereLight);
    }

    render() {
        this._renderer.render(this._scene, this._camera);
    }

    updatePose(pose) {
        // When a new pose is detected, update the 3D camera
        let modelViewMatrix = new THREE.Matrix4();
        modelViewMatrix = modelViewMatrix.fromArray(pose);
        this._camera.matrix = modelViewMatrix;
        this._camera.matrixWorldNeedsUpdate = true;
    }

    onResize() {
        // When device orientation changes, it is required to update camera params.
        const width = this._renderer.domElement.width;
        const height = this._renderer.domElement.height;
        const cameraParams = this.oxSDK.getCameraParameters();
        this._camera.fov = cameraParams.fov;
        this._camera.aspect = cameraParams.aspect;
        this._camera.updateProjectionMatrix();
        this._renderer.setSize(width, height);
    }

    scaleCar(value) {
        this._scene.scale.set(value, value, value);
    }

    rotateCar(value) {
        this._scene.rotation.y = value;
    }

    changeCarColor(value) {
        this._model.traverse((child) => {
            if (child.material && child.material.name === "CarPaint") {
                child.material.color.setHex(value);
            }
        });
    }

    // Add touch listeners for pinch zoom and single-finger rotation
    addTouchListeners() {
        const canvas = this._renderer.domElement;
        
        canvas.addEventListener('touchstart', (event) => {
            if (event.touches.length === 2) {
                // Pinch zoom start
                this._lastPinchDistance = this.getDistance(event.touches);
            } else if (event.touches.length === 1) {
                // Single finger rotation start
                this._lastTouchX = event.touches[0].clientX;
            }
        });

        canvas.addEventListener('touchmove', (event) => {
            if (event.touches.length === 2 && this._lastPinchDistance !== null) {
                // Pinch zoom move
                const newDistance = this.getDistance(event.touches);
                const scale = newDistance / this._lastPinchDistance;
                this._lastPinchDistance = newDistance;
                this.scaleCar(this._model.scale.x * scale); // Adjust scale
            } else if (event.touches.length === 1 && this._lastTouchX !== null) {
                // Single finger rotation move
                const deltaX = event.touches[0].clientX - this._lastTouchX;
                this._lastTouchX = event.touches[0].clientX;
                this.rotateCar(deltaX * 0.01); // Adjust rotation speed as needed
            }
        });

        canvas.addEventListener('touchend', (event) => {
            if (event.touches.length < 2) {
                this._lastPinchDistance = null; // Reset pinch zoom
            }
            if (event.touches.length === 0) {
                this._lastTouchX = null; // Reset single-finger rotation
            }
        });
    }

    getDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
}

const ox = new OxExperience();
ox.init();
