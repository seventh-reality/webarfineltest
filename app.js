// ====== Imports ======
import OnirixSDK from "https://unpkg.com/@onirix/ar-engine-sdk@1.6.5/dist/ox-sdk.esm.js";
import * as THREE from "https://cdn.skypack.dev/three@0.136.0";
import { GLTFLoader } from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/loaders/GLTFLoader.js";

class OxExperience {

    _renderer = null;
    _scene = null;
    _camera = null;
    _models = {}; // Store models in an object keyed by their name
    _currentModel = null; // Track current active model
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

        this.oxSDK.subscribe(OnirixSDK.Events.OnPose, (pose) => {
            this.updatePose(pose);
        });

        this.oxSDK.subscribe(OnirixSDK.Events.OnResize, () => {
            this.onResize();
        });

        // Detect surface and move the placeholder
        this.oxSDK.subscribe(OnirixSDK.Events.OnHitTestResult, (hitResult) => {
            if (!this._carPlaced) {
                this._surfacePlaceholder.position.copy(hitResult.position);
                this._surfacePlaceholder.visible = true; // Ensure the placeholder is visible
            } else {
                this._surfacePlaceholder.visible = false;
            }
        });

        const modelsToLoad = [
            { name: "Steerad", file: "Steerad.glb" },
            { name: "Sterrad Parts", file: "Sterrad_PARTS.glb" },
            { name: "Usage", file: "USAGE.glb" },
            { name: "USP 1", file: "USP_1.glb" },
            { name: "UPS 2", file: "UPS_2.glb" },
            { name: "UPS 3", file: "UPS_3.glb" }
        ];

        const gltfLoader = new GLTFLoader();
        for (const model of modelsToLoad) {
            gltfLoader.load(model.file, (gltf) => {
                const loadedModel = gltf.scene;
                loadedModel.traverse((child) => {
                    if (child.material) {
                        child.material.envMap = this._envMap;
                        child.material.needsUpdate = true;
                    }
                });
                loadedModel.scale.set(0.5, 0.5, 0.5);
                loadedModel.visible = false; // Hide all models initially
                this._scene.add(loadedModel);
                this._models[model.name] = loadedModel; // Store the model
            });
        }
    }

    async initSDK() {
        this.oxSDK = new OnirixSDK("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjUyMDIsInByb2plY3RJZCI6MTQ0MjgsInJvbGUiOjMsImlhdCI6MTYxNjc1ODY5NX0.8F5eAPcBGaHzSSLuQAEgpdja9aEZ6Ca_Ll9wg84Rp5k");
        const config = { mode: OnirixSDK.TrackingMode.Surface };
        return this.oxSDK.init(config);
    }

    placeCar() {
        this._carPlaced = true;
        if (this._currentModel) {
            this._currentModel.visible = true; // Show the current model
            this._currentModel.position.copy(this._surfacePlaceholder.position); // Move model to placeholder
        }
        this.oxSDK.start();
    }

    createSurfacePlaceholder() {
        const geometry = new THREE.RingGeometry(0.1, 0.2, 32);
        const material = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(geometry, material);
        ring.rotation.x = -Math.PI / 2;
        this._scene.add(ring);
        this._surfacePlaceholder = ring;
    }

    isCarPlaced() {
        return this._carPlaced;
    }

    switchModel(modelName) {
        if (this._currentModel) {
            this._currentModel.visible = false; // Hide the current model
        }
        this._currentModel = this._models[modelName];
        if (this._currentModel && this._carPlaced) {
            this._currentModel.visible = true; // Show the new model
            this._currentModel.position.copy(this._surfacePlaceholder.position);
        }
    }

    onHitTest(listener) {
        this.oxSDK.subscribe(OnirixSDK.Events.OnHitTestResult, listener);
    }

    setupRenderer(renderCanvas) {
        const width = renderCanvas.width;
        const height = renderCanvas.height;

        this._renderer = new THREE.WebGLRenderer({ canvas: renderCanvas, alpha: true });
        this._renderer.setClearColor(0x000000, 0);
        this._renderer.setSize(width, height);
        this._renderer.outputEncoding = THREE.sRGBEncoding;

        const cameraParams = this.oxSDK.getCameraParameters();
        this._camera = new THREE.PerspectiveCamera(cameraParams.fov, cameraParams.aspect, 0.1, 1000);
        this._camera.matrixAutoUpdate = false;

        this._scene = new THREE.Scene();

        const ambientLight = new THREE.AmbientLight(0xcccccc, 0.4);
        this._scene.add(ambientLight);
        const hemisphereLight = new THREE.HemisphereLight(0xbbbbff, 0x444422);
        this._scene.add(hemisphereLight);
    }

    render() {
        this._renderer.render(this._scene, this._camera);
    }

    updatePose(pose) {
        let modelViewMatrix = new THREE.Matrix4();
        modelViewMatrix = modelViewMatrix.fromArray(pose);
        this._camera.matrix = modelViewMatrix;
        this._camera.matrixWorldNeedsUpdate = true;
    }

    onResize() {
        const width = this._renderer.domElement.width;
        const height = this._renderer.domElement.height;
        const cameraParams = this.oxSDK.getCameraParameters();
        this._camera.fov = cameraParams.fov;
        this._camera.aspect = cameraParams.aspect;
        this._camera.updateProjectionMatrix();
        this._renderer.setSize(width, height);
    }

    scaleCar(value) {
        if (this._currentModel) {
            this._currentModel.scale.set(value, value, value);
        }
    }

    rotateCar(value) {
        if (this._currentModel) {
            this._currentModel.rotation.y = value;
        }
    }

    changeCarColor(value) {
        if (this._currentModel) {
            this._currentModel.traverse((child) => {
                if (child.material && child.material.name === "CarPaint") {
                    child.material.color.setHex(value);
                }
            });
        }
    }
}

class OxExperienceUI {

    _loadingScreen = null;
    _errorScreen = null;
    _transformControls = null;
    _colorControls = null;
    _placeButton = null;
    _scaleSlider = null;
    _rotationSlider = null;
    _black = null;
    _orange = null;
    _blue = null;
    _silver = null;

    init() {
        this._loadingScreen = document.querySelector("#loading-screen");
        this._errorScreen = document.querySelector("#error-screen");
        this._transformControls = document.querySelector("#transform-controls");
        this._colorControls = document.querySelector("#color-controls");
        this._placeButton = document.querySelector("#tap-to-place");
        this._scaleSlider = document.querySelector("#scale-slider");
        this._rotationSlider = document.querySelector("#rotation-slider");
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
        document.querySelector("#error-title").innerText = errorTitle;
        document.querySelector("#error-message").innerText = errorMessage;
        this._errorScreen.style.display = 'flex';
    }
}

const oxExp = new OxExperience();
const oxUI = new OxExperienceUI();

oxUI.init();
try {
    await oxExp.init();

    oxUI.onPlace(() => { 
        oxExp.placeCar();
        oxUI.showColors();
    });

    oxExp.onHitTest(() => { 
        if (!oxExp.isCarPlaced()) {
            oxUI.showControls();
        }
    });

    // UI Button handlers for model switching
    document.querySelector("#model1").addEventListener('click', () => oxExp.switchModel("Steerad"));
    document.querySelector("#model2").addEventListener('click', () => oxExp.switchModel("Sterrad Parts"));
    document.querySelector("#model3").addEventListener('click', () => oxExp.switchModel("Usage"));
    document.querySelector("#model4").addEventListener('click', () => oxExp.switchModel("USP 1"));
    document.querySelector("#model5").addEventListener('click', () => oxExp.switchModel("UPS 2"));
    document.querySelector("#model6").addEventListener('click', () => oxExp.switchModel("UPS 3"));

    oxUI.onRotationChange((value) => { oxExp.rotateCar(value) });
    oxUI.onScaleChange((value) => { oxExp.scaleCar(value) });

    oxUI.onBlack(() => oxExp.changeCarColor(0x111111));
    oxUI.onBlue(() => oxExp.changeCarColor(0x0011ff));
    oxUI.onOrange(() => oxExp.changeCarColor(0xff2600));
    oxUI.onSilver(() => oxExp.changeCarColor(0xffffff));

    oxUI.hideLoadingScreen();

} catch (error) {
    switch (error.name) {
        case 'INTERNAL_ERROR':
            oxUI.showError('Internal Error', 'An unspecified error has occurred. Your device might not be compatible with this experience.');
            break;
        case 'CAMERA_ERROR':
            oxUI.showError('Camera Error', 'Could not access your device\'s camera. Please ensure you have given required permissions from your browser settings.');
            break;
        case 'SENSORS_ERROR':
            oxUI.showError('Sensors Error', 'Could not access your device\'s motion sensors. Please ensure you have given required permissions from your browser settings.');
            break;
        case 'LICENSE_ERROR':
            oxUI.showError('License Error', 'This experience does not exist or has been unpublished.');
    }
}
