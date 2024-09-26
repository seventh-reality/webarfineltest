// ====== Imports ======
import OnirixSDK from "https://unpkg.com/@onirix/ar-engine-sdk@1.6.5/dist/ox-sdk.esm.js";
import * as THREE from "https://cdn.skypack.dev/three@0.136.0";
import { GLTFLoader } from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/loaders/GLTFLoader.js";

class OxExperience {

    constructor() {
        this._renderer = null;
        this._scene = null;
        this._camera = null;
        this._models = []; // Array to hold multiple models
        this._currentModelIndex = null; // Track the currently active model
        this._surfacePlaceholder = null;
        this.oxSDK = null;
        this._modelPlaced = false;
        this._carPlaced = false;
        this._raycaster = null;
        this._animationMixers = [];
        this._clock = new THREE.Clock(true);
        this._envMap = null;
    }

    async init() {
        const renderCanvas = await this.initSDK();
        this.setupRenderer(renderCanvas);

        const textureLoader = new THREE.TextureLoader();
        this._envMap = textureLoader.load("envmap.jpg");
        this._envMap.mapping = THREE.EquirectangularReflectionMapping;
        this._envMap.encoding = THREE.sRGBEncoding;

        this.createSurfacePlaceholder();

        this.oxSDK.subscribe(OnirixSDK.Events.OnFrame, () => {
            const delta = this._clock.getDelta();
            this._animationMixers.forEach((mixer) => mixer.update(delta));
            this.render();
        });

        this.oxSDK.subscribe(OnirixSDK.Events.OnPose, (pose) => this.updatePose(pose));
        this.oxSDK.subscribe(OnirixSDK.Events.OnResize, () => this.onResize());
        this.oxSDK.subscribe(OnirixSDK.Events.OnHitTestResult, (hitResult) => {
            if (!this._carPlaced) {
                this._surfacePlaceholder.position.copy(hitResult.position);
                this._surfacePlaceholder.visible = true;
            } else {
                this._surfacePlaceholder.visible = false;
            }
        });

        const gltfLoader = new GLTFLoader();

        // Load models
        gltfLoader.load("range_rover.glb", (gltf) => this.loadModel(gltf));
        gltfLoader.load("UPS_2.glb", (gltf) => this.loadModel(gltf));
        gltfLoader.load("UPS_3.glb", (gltf) => this.loadModel(gltf));
    }

    loadModel(gltf) {
        const model = gltf.scene;
        model.traverse((child) => {
            if (child.material) {
                child.material.envMap = this._envMap;
                child.material.needsUpdate = true;
            }
        });
        model.scale.set(0.5, 0.5, 0.5);
        model.visible = false; // Initially hidden
        this._scene.add(model);
        this._models.push(model);
    }

    async initSDK() {
        // SDK initialization logic goes here, return the canvas for rendering.
        this.oxSDK = await OnirixSDK.initialize({ projectId: "your-project-id" });
        return this.oxSDK.getRenderCanvas();
    }

    placeCar() {
        this._carPlaced = true;
        this.showModel(this._currentModelIndex);
        this.oxSDK.start();
    }

    showModel(index) {
        // Hide all models
        this._models.forEach((model) => model.visible = false);

        // Show the selected model and move it to the placeholder position
        const selectedModel = this._models[index];
        selectedModel.visible = true;
        selectedModel.position.copy(this._surfacePlaceholder.position);
    }

    switchModel(index) {
        this._currentModelIndex = index; // Update the active model index
        if (this._carPlaced) {
            this.showModel(index); // If the car is placed, switch to the selected model
        }
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

    scaleCar(value) {
        this._models[this._currentModelIndex].scale.set(value, value, value); // Fix: scaling the selected model
    }

    rotateCar(value) {
        this._models[this._currentModelIndex].rotation.y = value; // Fix: rotating the selected model
    }

    changeCarColor(value) {
        this._models[this._currentModelIndex].traverse((child) => {
            if (child.material && child.material.name === "CarPaint") {
                child.material.color.setHex(value);
            }
        });
    }
}

class OxExperienceUI {

    constructor() {
        this._loadingScreen = null;
        this._errorScreen = null;
        this._transformControls = null;
        this._colorControls = null;
        this._placeButton = null;
        this._scaleSlider = null;
        this._rotationSlider = null;
        this._model1Button = null;
        this._model2Button = null;
        this._model3Button = null;
        this._black = null;
        this._orange = null;
        this._blue = null;
        this._silver = null;
    }

    init() {
        this._loadingScreen = document.querySelector("#loading-screen");
        this._errorScreen = document.querySelector("#error-screen");

        this._transformControls = document.querySelector("#transform-controls");
        this._colorControls = document.querySelector("#color-controls");
        this._placeButton = document.querySelector("#tap-to-place");
        this._scaleSlider = document.querySelector("#scale-slider");
        this._rotationSlider = document.querySelector("#rotation-slider");

        // Add model buttons
        this._model1Button = document.querySelector("#model-1");
        this._model2Button = document.querySelector("#model-2");
        this._model3Button = document.querySelector("#model-3");

        this._black = document.querySelector("#black");
        this._orange = document.querySelector("#orange");
        this._blue = document.querySelector("#blue");
        this._silver = document.querySelector("#silver");
    }

    showControls() {
        this._transformControls.style.display = "block";
    }

    showColors() {
        this._transformControls.style.display = "none";
        this._colorControls.style.display = "block";
    }

    onPlace(listener) {
        this._placeButton.addEventListener('click', listener);
    }

    onScaleChange(listener) {
        this._scaleSlider.addEventListener('input', () => { listener(this._scaleSlider.value / 100) });
    }

    onRotationChange(listener) {
        this._rotationSlider.addEventListener('input', () => { listener(this._rotationSlider.value * Math.PI / 180) });
    }

    // Model switch event listeners
    onModel1Click(listener) {
        this._model1Button.addEventListener('click', listener);
    }

    onModel2Click(listener) {
        this._model2Button.addEventListener('click', listener);
    }

    onModel3Click(listener) {
        this._model3Button.addEventListener('click', listener);
    }

    onBlack(listener) {
        this._black.addEventListener('click', listener);
    }

    onOrange(listener) {
        this._orange.addEventListener('click', listener);
    }

    onBlue(listener) {
        this._blue.addEventListener('click', listener);
    }

    onSilver(listener) {
        this._silver.addEventListener('click', listener);
    }

    hideLoadingScreen() {
        this._loadingScreen.style.display = 'none';
    }

    showError(errorTitle, errorMessage) {
        this._errorScreen.querySelector("#error-title").innerText = errorTitle; // Fixed error title query selector
        this._errorScreen.querySelector("#error-message").innerText = errorMessage; // Fixed error message query selector
        this._errorScreen.style.display = 'flex';
    }
}

// Instantiate and initialize
const oxExp = new OxExperience();
const oxUI = new OxExperienceUI();

oxUI.init();
oxExp.init().then(() => {
    oxUI.onPlace(() => {
        oxExp.placeCar();
        oxUI.showColors();
    });

    oxExp.onHitTest(() => {
        if (!oxExp.isCarPlaced()) {
            oxUI.showControls();
        }
    });

    // Model switching
    oxUI.onModel1Click(() => oxExp.switchModel(0));
    oxUI.onModel2Click(() => oxExp.switchModel(1));
    oxUI.onModel3Click(() => oxExp.switchModel(2));

    oxUI.onRotationChange((value) => { oxExp.rotateCar(value) });
    oxUI.onScaleChange((value) => { oxExp.scaleCar(value) });

    oxUI.onBlack(() => oxExp.changeCarColor(0x111111));
    oxUI.onBlue(() => oxExp.changeCarColor(0x0011ff));
    oxUI.onOrange(() => oxExp.changeCarColor(0xff2600));
    oxUI.onSilver(() => oxExp.changeCarColor(0xffffff));

    oxUI.hideLoadingScreen();

}).catch((error) => {
    switch (error.name) {
        case 'INTERNAL_ERROR':
            oxUI.showError('Internal Error', 'An unspecified error has occurred. Your device might not be compatible with this experience.');
            break;
        case 'CAMERA_ERROR':
            oxUI.showError('Camera Error', 'Could not access your device\'s camera. Please, ensure you have given required permissions from your browser settings.');
            break;
        case 'SENSORS_ERROR':
            oxUI.showError('Sensors Error', 'Could not access your device\'s motion sensors. Please, ensure you have given required permissions from your browser settings.');
            break;
        case 'LICENSE_ERROR':
            oxUI.showError('License Error', 'This experience does not exist or has been unpublished.');
            break;
    }
});
