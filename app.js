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
        // Check for WebGL support
        if (!this.isWebGLAvailable()) {
            console.error("WebGL is not supported in this browser.");
            return;
        }

        this._raycaster = new THREE.Raycaster();
        this._animationMixers = [];
        this._clock = new THREE.Clock(true);
        
        const renderCanvas = await this.initSDK();
        this.setupRenderer(renderCanvas);
        this.loadEnvMap();

        this.createSurfacePlaceholder();
        this.setupEventListeners();

        await this.loadModel();

        this.addTouchListeners();
    }

    isWebGLAvailable() {
        return !!window.WebGLRenderingContext;
    }

    async initSDK() {
        this.oxSDK = new OnirixSDK("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjUyMDIsInByb2plY3RJZCI6MTQ0MjgsInJvbGUiOjMsImlhdCI6MTYxNjc1ODY5NX0.8F5eAPcBGaHzSSLuQAEgpdja9aEZ6Ca_Ll9wg84Rp5k");
        const config = {
            mode: OnirixSDK.TrackingMode.Surface,
        };
        return this.oxSDK.init(config);
    }

    loadEnvMap() {
        const textureLoader = new THREE.TextureLoader();
        this._envMap = textureLoader.load("envmap.jpg");
        this._envMap.mapping = THREE.EquirectangularReflectionMapping;
        this._envMap.encoding = THREE.sRGBEncoding;
    }

    async loadModel() {
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
            this._model.visible = false; // Initially hide the model
            this._scene.add(this._model);
        });
    }

    createSurfacePlaceholder() {
        const geometry = new THREE.RingGeometry(0.1, 0.2, 32);
        const material = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(geometry, material);
        ring.rotation.x = -Math.PI / 2; // Rotate to lie flat
        this._surfacePlaceholder = ring;
        this._scene.add(ring);
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
        this.addLights();
    }

    addLights() {
        const ambientLight = new THREE.AmbientLight(0xcccccc, 0.4);
        this._scene.add(ambientLight);
        const hemisphereLight = new THREE.HemisphereLight(0xbbbbff, 0x444422);
        this._scene.add(hemisphereLight);
    }

    setupEventListeners() {
        this.oxSDK.subscribe(OnirixSDK.Events.OnFrame, () => {
            this.render();
        });

        this.oxSDK.subscribe(OnirixSDK.Events.OnPose, (pose) => {
            this.updatePose(pose);
        });

        this.oxSDK.subscribe(OnirixSDK.Events.OnResize, () => {
            this.onResize();
        });

        this.oxSDK.subscribe(OnirixSDK.Events.OnHitTestResult, (hitResult) => {
            if (!this._carPlaced) {
                this._surfacePlaceholder.position.copy(hitResult.position);
                this._surfacePlaceholder.visible = true;
            } else {
                this._surfacePlaceholder.visible = false;
            }
        });
    }

    render() {
        this._renderer.render(this._scene, this._camera);
    }

    updatePose(pose) {
        let modelViewMatrix = new THREE.Matrix4();
        modelViewMatrix.fromArray(pose);
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

    placeCar() {
        this._carPlaced = true;
        this._model.visible = true;
        this._model.position.copy(this._surfacePlaceholder.position);
        this.oxSDK.start();
    }

    // Additional methods for scaling, rotating, and color changes...

    addTouchListeners() {
        const canvas = this._renderer.domElement;

        canvas.addEventListener('touchstart', (event) => {
            if (event.touches.length === 2) {
                this._lastPinchDistance = this.getDistance(event.touches);
            } else if (event.touches.length === 1) {
                this._lastTouchX = event.touches[0].clientX;
            }
        }, { passive: true });

        canvas.addEventListener('touchmove', (event) => {
            if (event.touches.length === 2 && this._lastPinchDistance !== null) {
                const newDistance = this.getDistance(event.touches);
                const scale = newDistance / this._lastPinchDistance;
                this._lastPinchDistance = newDistance;
                this.scaleCar(this._scene.scale.x * scale);
            } else if (event.touches.length === 1 && this._lastTouchX !== null) {
                const deltaX = event.touches[0].clientX - this._lastTouchX;
                this._lastTouchX = event.touches[0].clientX;
                this.rotateCar(this._scene.rotation.y + deltaX * 0.01);
            }
        }, { passive: true });

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
}

class OxExperienceUI {
    // UI code...

    showError(errorTitle, errorMessage) {
        this._errorTitle.innerText = errorTitle;
        this._errorMessage.innerText = errorMessage;
        this._errorScreen.style.display = 'flex';
    }
}

// Initialize Experience and UI
const oxExp = new OxExperience();
const oxUI = new OxExperienceUI();

oxUI.init();
try {
    await oxExp.init();

    oxUI.onPlace(() => { 
        oxExp.placeCar();
        oxUI.showColors();
    });

    // Additional UI event listeners...

    oxUI.hideLoadingScreen();
} catch (error) {
    // Improved error handling...
    oxUI.showError('Error', error.message);
}
