// ====== Imports ======

import OnirixSDK from "https://unpkg.com/@onirix/ar-engine-sdk@1.8.4/dist/ox-sdk.esm.js";
import * as THREE from "https://cdn.skypack.dev/three@0.136.0";
import { GLTFLoader } from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/loaders/GLTFLoader.js";

class OxExperience {
    _renderer = null;
    _scene = null;
    _camera = null;
    _model = null;
    _surfacePlaceholder = null;
    oxSDK;
    _carPlaced = false;
    _lastPinchDistance = null;
    _lastTouchX = null;

    async init() {
        this._clock = new THREE.Clock(true);
        const renderCanvas = await this.initSDK();
        this.setupRenderer(renderCanvas);
        this.loadEnvironmentMap();
        this.createSurfacePlaceholder();
        this.setupEventListeners();
        this.loadModel();

        this.addTouchListeners();
    }

    async initSDK() {
        this.oxSDK = new OnirixSDK("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjUyMDIsInByb2plY3RJZCI6MTQ0MjgsInJvbGUiOjMsImlhdCI6MTYxNjc1ODY5NX0.8F5eAPcBGaHzSSLuQAEgpdja9aEZ6Ca_Ll9wg84Rp5k");
        return this.oxSDK.init({ mode: OnirixSDK.TrackingMode.Surface });
    }

    loadEnvironmentMap() {
        const textureLoader = new THREE.TextureLoader();
        this._envMap = textureLoader.load("envmap.jpg");
        this._envMap.mapping = THREE.EquirectangularReflectionMapping;
        this._envMap.encoding = THREE.sRGBEncoding;
    }

    createSurfacePlaceholder() {
        const geometry = new THREE.RingGeometry(0.1, 0.2, 32);
        const material = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide });
        this._surfacePlaceholder = new THREE.Mesh(geometry, material);
        this._surfacePlaceholder.rotation.x = -Math.PI / 2;
        this._surfacePlaceholder.visible = false; 
        this._scene.add(this._surfacePlaceholder);
    }

    setupRenderer(renderCanvas) {
        this._renderer = new THREE.WebGLRenderer({ canvas: renderCanvas, alpha: true });
        this._renderer.setSize(renderCanvas.width, renderCanvas.height);
        this._renderer.outputEncoding = THREE.sRGBEncoding;

        const cameraParams = this.oxSDK.getCameraParameters();
        this._camera = new THREE.PerspectiveCamera(cameraParams.fov, cameraParams.aspect, 0.1, 1000);
        this._camera.matrixAutoUpdate = false;

        this._scene = new THREE.Scene();
        this._scene.add(new THREE.AmbientLight(0xcccccc, 0.4));
        this._scene.add(new THREE.HemisphereLight(0xbbbbff, 0x444422));
    }

    setupEventListeners() {
        this.oxSDK.subscribe(OnirixSDK.Events.OnFrame, () => this.render());
        this.oxSDK.subscribe(OnirixSDK.Events.OnPose, (pose) => this.updatePose(pose));
        this.oxSDK.subscribe(OnirixSDK.Events.OnHitTestResult, (hitResult) => this.updatePlaceholderPosition(hitResult));
    }

    updatePlaceholderPosition(hitResult) {
        if (!this._carPlaced) {
            this._surfacePlaceholder.position.copy(hitResult.position);
            this._surfacePlaceholder.visible = true;
        } else {
            this._surfacePlaceholder.visible = false;
        }
    }

    loadModel() {
        const gltfLoader = new GLTFLoader();
        gltfLoader.load("Steerad.glb", (gltf) => {
            this._model = gltf.scene;
            this._model.traverse((child) => {
                if (child.material) {
                    child.material.envMap = this._envMap;
                    child.material.needsUpdate = true;
                }
            });
            this._model.scale.set(0.5, 0.5, 0.5);
            this._model.visible = false;
            this._scene.add(this._model);
        });
    }

    placeCar() {
        this._carPlaced = true;
        this._model.visible = true;
        this._model.position.copy(this._surfacePlaceholder.position);
        this.oxSDK.start();
    }

    updatePose(pose) {
        const modelViewMatrix = new THREE.Matrix4().fromArray(pose);
        this._camera.matrix.copy(modelViewMatrix);
        this._camera.matrixWorldNeedsUpdate = true;
    }

    render() {
        this._renderer.render(this._scene, this._camera);
    }

    addTouchListeners() {
        const canvas = this._renderer.domElement;

        canvas.addEventListener('touchstart', (event) => {
            if (event.touches.length === 2) {
                this._lastPinchDistance = this.getDistance(event.touches);
            } else if (event.touches.length === 1) {
                this._lastTouchX = event.touches[0].clientX;
            }
        });

        canvas.addEventListener('touchmove', (event) => {
            if (event.touches.length === 2 && this._lastPinchDistance !== null) {
                const newDistance = this.getDistance(event.touches);
                const scale = newDistance / this._lastPinchDistance;
                this.scaleCar(this._model.scale.x * scale);
                this._lastPinchDistance = newDistance;
            } else if (event.touches.length === 1 && this._lastTouchX !== null) {
                const deltaX = event.touches[0].clientX - this._lastTouchX;
                this.rotateCar(this._model.rotation.y + deltaX * 0.01);
                this._lastTouchX = event.touches[0].clientX;
            }
        });

        canvas.addEventListener('touchend', () => {
            this._lastPinchDistance = null;
            this._lastTouchX = null;
        });
    }

    getDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    scaleCar(value) {
        this._model.scale.set(value, value, value);
    }

    rotateCar(value) {
        this._model.rotation.y = value;
    }

    changeCarColor(value) {
        this._model.traverse((child) => {
            if (child.material && child.material.name === "CarPaint") {
                child.material.color.setHex(value);
            }
        });
    }
}

class OxExperienceUI {
    init() {
        this._loadingScreen = document.querySelector("#loading-screen");
        this._errorScreen = document.querySelector("#error-screen");
        this._placeButton = document.querySelector("#tap-to-place");
        this._scaleSlider = document.querySelector("#scale-slider");
        this._rotationSlider = document.querySelector("#rotation-slider");
        this._colorButtons = {
            black: document.querySelector("#black"),
            orange: document.querySelector("#orange"),
            blue: document.querySelector("#blue"),
            silver: document.querySelector("#silver"),
        };
    }

    showControls() {
        document.querySelector("#transform-controls").style.display = "block";
    }

    hideLoadingScreen() {
        this._loadingScreen.style.display = 'none';
    }

    showError(errorTitle, errorMessage) {
        document.querySelector("#error-title").innerText = errorTitle;
        document.querySelector("#error-message").innerText = errorMessage;
        this._errorScreen.style.display = 'flex';
    }

    onPlace(listener) {
        this._placeButton.addEventListener('click', listener);
    }

    onScaleChange(listener) {
        this._scaleSlider.addEventListener('input', () => { listener(this._scaleSlider.value / 100); });
    }

    onRotationChange(listener) {
        this._rotationSlider.addEventListener('input', () => { listener(this._rotationSlider.value * Math.PI / 180); });
    }

    onColorChange(listener) {
        for (const [color, button] of Object.entries(this._colorButtons)) {
            button.addEventListener('click', () => listener(color));
        }
    }
}

const oxExp = new OxExperience();
const oxUI = new OxExperienceUI();

oxUI.init();
try {
    await oxExp.init();

    oxUI.onPlace(() => {
        oxExp.placeCar();
        oxUI.showControls();
    });

    oxUI.onScaleChange((value) => oxExp.scaleCar(value));
    oxUI.onRotationChange((value) => oxExp.rotateCar(value));
    oxUI.onColorChange((color) => {
        const colors = {
            black: 0x111111,
            blue: 0x0011ff,
            orange: 0xff2600,
            silver: 0xffffff,
        };
        oxExp.changeCarColor(colors[color]);
    });

    oxUI.hideLoadingScreen();
} catch (error) {
    let errorMessage;
    switch (error.name) {
        case 'INTERNAL_ERROR':
            errorMessage = 'An unspecified error has occurred. Your device might not be compatible with this experience.';
            break;
        case 'CAMERA_ERROR':
            errorMessage = 'Could not access your device\'s camera. Please ensure you have given required permissions from your browser settings.';
            break;
        case 'SENSORS_ERROR':
            errorMessage = 'Could not access your device\'s motion sensors. Please ensure you have given required permissions from your browser settings.';
            break;
        case 'LICENSE_ERROR':
            errorMessage = 'This experience does not exist or has been unpublished.';
            break;
        default:
            errorMessage = 'An unknown error occurred.';
    }
    oxUI.showError('Error', errorMessage);
}
