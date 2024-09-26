// ====== Imports ======

import OnirixSDK from "https://unpkg.com/@onirix/ar-engine-sdk@1.6.5/dist/ox-sdk.esm.js";
import * as THREE from "https://cdn.skypack.dev/three@0.136.0";
import { GLTFLoader } from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/loaders/GLTFLoader.js";

class OxExperience {

    _renderer = null;
    _scene = null;
    _camera = null;
    _model = null;
    _surfacePlaceholder = null; // Surface placeholder reference

    oxSDK;

    async init() {
        this._raycaster = new THREE.Raycaster();
        this._animationMixers = [];
        this._clock = new THREE.Clock(true);
        this._carPlaced = false;

        const renderCanvas = await this.initSDK();
        this.setupRenderer(renderCanvas);

        // Create and add the surface placeholder
        this.createSurfacePlaceholder();

        this.oxSDK.subscribe(OnirixSDK.Events.OnFrame, () => {
            const delta = this._clock.getDelta();
            this._animationMixers.forEach((mixer) => mixer.update(delta));
            this.render();
        });

        this.oxSDK.subscribe(OnirixSDK.Events.OnHitTestResult, (hitResult) => {
            if (!this._carPlaced) {
                // Move the placeholder to the detected surface position
                this._surfacePlaceholder.position.copy(hitResult.position);
                this._surfacePlaceholder.visible = true; // Ensure the placeholder is visible
            } else {
                this._surfacePlaceholder.visible = false; // Hide the placeholder once the car is placed
            }
        });

        const gltfLoader = new GLTFLoader();
        gltfLoader.load("range_rover.glb", (gltf) => {
            this._model = gltf.scene;
            this._model.traverse((child) => {
                if (child.material) {
                    child.material.envMap = this._envMap;
                    child.material.needsUpdate = true;
                }
            });
            this._model.scale.set(0.5, 0.5, 0.5);
            this._scene.add(this._model);
            this._modelPlaced = true;
        });
    }

    async initSDK() {
        this.oxSDK = new OnirixSDK("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjUyMDIsInByb2plY3RJZCI6MTQ0MjgsInJvbGUiOjMsImlhdCI6MTYxNjc1ODY5NX0.8F5eAPcBGaHzSSLuQAEgpdja9aEZ6Ca_Ll9wg84Rp5k");
        const config = {
            mode: OnirixSDK.TrackingMode.Surface,
        }
        return this.oxSDK.init(config);
    }

    placeCar() {
        this._carPlaced = true;
        this._surfacePlaceholder.visible = false; // Hide the placeholder after placement
        this.oxSDK.start();
    }

    createSurfacePlaceholder() {
        const geometry = new THREE.RingGeometry(0.1, 0.2, 32);
        const material = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(geometry, material);
        ring.rotation.x = -Math.PI / 2; // Rotate to lie flat on the ground
        this._scene.add(ring);
        this._surfacePlaceholder = ring;
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

    _loadingScreen = null;
    _errorScreen = null;
    _moveAnimation = null;
    _errorTitle = null;
    _errorMessage = null;

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
        this._errorTitle.innerText = errorTitle;
        this._errorMessage.innerText = errorMessage;
        this._errorScreen.style.display = 'flex';
    }

}

const oxExp = new OxExperience();
const oxUI = new OxExperienceUI();

oxUI.init();

async function runExperience() {
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

        oxUI.onRotationChange((value) => { oxExp.rotateCar(value); });
        oxUI.onScaleChange((value) => { oxExp.scaleCar(value); });

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
                oxUI.showError('Camera Error', 'Could not access your device\'s camera. Please, ensure you have given the required permissions from your browser settings.');
                break;
            case 'SENSORS_ERROR':
                oxUI.showError('Sensors Error', 'Could not access your device\'s motion sensors. Please, ensure you have given the required permissions from your browser settings.');
                break;
            case 'LICENSE_ERROR':
                oxUI.showError('License Error', 'This experience does not exist or has been unpublished.');
                break;
        }
    }
}

// Run the experience after initializing everything
runExperience();
