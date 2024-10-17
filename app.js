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
    _modelPlaced = false;
    _carPlaced = false;
    _lastPinchDistance = null;
    _lastTouchX = null;

    async init() {
        this._raycaster = new THREE.Raycaster();
        this._animationMixers = [];
        this._clock = new THREE.Clock(true);
        this._carPlaced = false;

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

        // Enhanced hit test for better iOS support
        this.oxSDK.subscribe(OnirixSDK.Events.OnHitTestResult, (hitResult) => {
            if (!this._carPlaced) {
                this._surfacePlaceholder.position.copy(hitResult.position);
                this._surfacePlaceholder.visible = true;
            } else {
                this._surfacePlaceholder.visible = false;
            }
        });

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

        this.addTouchListeners();
    }

    async initSDK() {
        this.oxSDK = new OnirixSDK("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...");
        const config = {
            mode: OnirixSDK.TrackingMode.Surface,
        };

        // iOS compatibility check
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS) {
            config.iosUseARKit = true;
        }

        return this.oxSDK.init(config);
    }

    placeCar() {
        this._carPlaced = true;
        this._model.visible = true;
        this._model.position.copy(this._surfacePlaceholder.position);
        this.oxSDK.start();
    }

    createSurfacePlaceholder() {
        const geometry = new THREE.RingGeometry(0.1, 0.2, 32);
        const material = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(geometry, material);
        ring.rotation.x = -Math.PI / 2;
        ring.userData.isPlaceholder = true;
        this._scene.add(ring);
        this._surfacePlaceholder = ring;
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
                this._lastPinchDistance = newDistance;
                this.scaleCar(this._model.scale.x * scale);
            } else if (event.touches.length === 1 && this._lastTouchX !== null) {
                const deltaX = event.touches[0].clientX - this._lastTouchX;
                this._lastTouchX = event.touches[0].clientX;
                this.rotateCar(this._model.rotation.y + deltaX * 0.01);
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
}

class OxExperienceUI {
    init() {
        this._loadingScreen = document.querySelector("#loading-screen");
        this._errorScreen = document.querySelector("#error-screen");
        this._errorTitle = document.querySelector("#error-title");
        this._errorMessage = document.querySelector("#error-message");

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
        this._transformControls.classList.remove("hidden");
        this._colorControls.classList.remove("hidden");
    }

    hideLoading() {
        this._loadingScreen.classList.add("hidden");
    }

    showError(error, message) {
        this._loadingScreen.classList.add("hidden");
        this._errorTitle.innerHTML = error;
        this._errorMessage.innerHTML = message;
        this._errorScreen.classList.remove("hidden");
    }
}

export { OxExperience, OxExperienceUI };
