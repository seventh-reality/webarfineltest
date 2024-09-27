// ====== Imports ======
import OnirixSDK from "https://unpkg.com/@onirix/ar-engine-sdk@1.6.5/dist/ox-sdk.esm.js";
import * as THREE from "https://cdn.skypack.dev/three@0.136.0";
import { GLTFLoader } from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/loaders/GLTFLoader.js";

class OxExperience {

    _renderer = null;
    _scene = null;
    _camera = null;
    _models = {};  // Store all models here
    _currentModel = null;  // Reference to the currently visible model
    _surfacePlaceholder = null; // Surface placeholder reference
    oxSDK;
    _modelPlaced = false;
    _carPlaced = false; // Model will be placed after click

    async init() {
        this._raycaster = new THREE.Raycaster();
        this._animationMixers = [];
        this._clock = new THREE.Clock(true);
        this._carPlaced = false;

        const renderCanvas = await this.initSDK();
        this.setupRenderer(renderCanvas);

        // Load env map
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

        this.oxSDK.subscribe(OnirixSDK.Events.OnPose, (pose) => {
            this.updatePose(pose);
        });

        this.oxSDK.subscribe(OnirixSDK.Events.OnResize, () => {
            this.onResize();
        });

        // Detect surface and move the placeholder there
        this.oxSDK.subscribe(OnirixSDK.Events.OnHitTestResult, (hitResult) => {
            if (!this._carPlaced) {
                // Move the placeholder to the detected surface position
                this._surfacePlaceholder.position.copy(hitResult.position);
                this._surfacePlaceholder.visible = true; // Ensure the placeholder is visible
            } else {
                this._surfacePlaceholder.visible = false; // Hide the placeholder once the car is placed
            }
        });

        // Load multiple models
        const modelsToLoad = ["Steerad.glb", "Sterrad_PARTS.glb", "USAGE.glb", "USP_1.glb", "UPS_2.glb", "UPS_3.glb"];
        const gltfLoader = new GLTFLoader();

        for (const modelName of modelsToLoad) {
            gltfLoader.load(modelName, (gltf) => {
                const model = gltf.scene;
                model.traverse((child) => {
                    if (child.material) {
                        child.material.envMap = this._envMap;
                        child.material.needsUpdate = true;
                    }
                });
                model.scale.set(0.5, 0.5, 0.5);
                model.visible = false; // Hide the model initially
                this._scene.add(model);
                this._models[modelName] = model; // Add to models object
            });
        }
    }

    async initSDK() {
        this.oxSDK = new OnirixSDK("your-token-here");
        const config = {
            mode: OnirixSDK.TrackingMode.Surface,
        };
        return this.oxSDK.init(config);
    }

    placeModel() {
        this._carPlaced = true;
        if (this._currentModel) {
            this._currentModel.visible = true; // Show the current model when placed
            this._currentModel.position.copy(this._surfacePlaceholder.position); // Move model to placeholder's position
            this.oxSDK.start();
        }
    }

    switchModel(modelName) {
        if (this._currentModel) {
            this._currentModel.visible = false; // Hide current model
        }

        this._currentModel = this._models[modelName]; // Switch to new model
        this._currentModel.visible = this._carPlaced; // Show the model if already placed
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

    isModelPlaced() {
        return this._carPlaced;
    }

    onHitTest(listener) {
        this.oxSDK.subscribe(OnirixSDK.Events.OnHitTestResult, listener);
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
}

class OxExperienceUI {

    init() {
        this._loadingScreen = document.querySelector("#loading-screen");
        this._errorScreen = document.querySelector("#error-screen");

        // Model selection buttons
        this._buttons = {
            steerad: document.querySelector("#btn-steerad"),
            sterradParts: document.querySelector("#btn-sterrad-parts"),
            usage: document.querySelector("#btn-usage"),
            usp1: document.querySelector("#btn-usp1"),
            ups2: document.querySelector("#btn-ups2"),
            ups3: document.querySelector("#btn-ups3"),
        };
    }

    onModelSwitch(modelName, listener) {
        this._buttons[modelName].addEventListener('click', listener);
    }

    hideLoadingScreen() {
        this._loadingScreen.style.display = 'none';
    }

    showError(errorTitle, errorMessage) {
        this._errorScreen.style.display = 'flex';
        // Set error message
    }
}

const oxExp = new OxExperience();
const oxUI = new OxExperienceUI();

oxUI.init();
try {
    await oxExp.init();

    oxUI.onModelSwitch('steerad', () => oxExp.switchModel('Steerad.glb'));
    oxUI.onModelSwitch('sterradParts', () => oxExp.switchModel('Sterrad_PARTS.glb'));
    oxUI.onModelSwitch('usage', () => oxExp.switchModel('USAGE.glb'));
    oxUI.onModelSwitch('usp1', () => oxExp.switchModel('USP_1.glb'));
    oxUI.onModelSwitch('ups2', () => oxExp.switchModel('UPS_2.glb'));
    oxUI.onModelSwitch('ups3', () => oxExp.switchModel('UPS_3.glb'));

    oxUI.hideLoadingScreen();

} catch (error) {
    console.error(error);
}
