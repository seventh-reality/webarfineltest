<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Web AR with Pinch and Rotate</title>
    <style>
        body, html {
            margin: 0;
            padding: 0;
            height: 100%;
            overflow: hidden;
            display: flex;
            justify-content: center;
            align-items: center;
            background-color: #000;
        }
        #canvas {
            width: 100%;
            height: 100%;
        }
    </style>
</head>
<body>
    <canvas id="canvas"></canvas>
    
    <!-- Load the script as a module -->
     <script type="module">
        import OnirixSDK from "https://unpkg.com/@onirix/ar-engine-sdk@1.6.5/dist/ox-sdk.esm.js";
        import * as THREE from "https://cdn.skypack.dev/three@0.136.0";
        import { GLTFLoader } from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/loaders/GLTFLoader.js";
        import { OrbitControls } from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/controls/OrbitControls.js";


        class OxExperience {

            _renderer = null;
            _scene = null;
            _camera = null;
            _model = null;
            _surfacePlaceholder = null; // Surface placeholder reference
            _controls = null;
            oxSDK;
            _modelPlaced = false;
            _carPlaced = false;// Model will be placed after click

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
                    this._animationMixers.forEach((mixer) => mixer.update(delta));
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

                // Initialize OrbitControls for non-AR mode
                this._controls = new OrbitControls(this._camera, this._renderer.domElement);

                // Add touch event listeners for pinch zoom and rotation
                this.addTouchListeners();
            }

            async initSDK() {
                this.oxSDK = new OnirixSDK("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjUyMDIsInByb2plY3RJZCI6MTQ0MjgsInJvbGUiOjMsImlhdCI6MTYxNjc1ODY5NX0.8F5eAPcBGaHzSSLuQAEgpdja9aEZ6Ca_Ll9wg84Rp5k");
                const config = {
                    mode: OnirixSDK.TrackingMode.Surface,
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

            addTouchListeners() {
                let initialDistance = null;
                let initialRotation = null;

                // Touch start event for rotation
                window.addEventListener('touchstart', (event) => {
                    if (event.touches.length === 2) {
                        const dx = event.touches[0].pageX - event.touches[1].pageX;
                        const dy = event.touches[0].pageY - event.touches[1].pageY;
                        initialDistance = Math.sqrt(dx * dx + dy * dy); // Distance between two fingers
                        initialRotation = Math.atan2(dy, dx); // Initial rotation angle
                    }
                });

                // Touch move event for pinch zoom and rotate
                window.addEventListener('touchmove', (event) => {
                    if (event.touches.length === 2 && this._model) {
                        const dx = event.touches[0].pageX - event.touches[1].pageX;
                        const dy = event.touches[0].pageY - event.touches[1].pageY;
                        const currentDistance = Math.sqrt(dx * dx + dy * dy);
                        const currentRotation = Math.atan2(dy, dx);

                        // Pinch to zoom (scaling the model)
                        const scaleFactor = currentDistance / initialDistance;
                        this._model.scale.set(scaleFactor, scaleFactor, scaleFactor);

                        // Rotate the model based on touch movement
                        const rotationDelta = currentRotation - initialRotation;
                        this._model.rotation.y += rotationDelta;
                        initialRotation = currentRotation;
                    }
                });
            }

            render() {
                this._renderer.render(this._scene, this._camera);
                if (this._controls) {
                    this._controls.update(); // Update OrbitControls
                }
            }

            updatePose(pose) {
                // When a new pose is detected, update the 3D camera
                let modelViewMatrix = new THREE.Matrix4();
                modelViewMatrix = modelViewMatrix.fromArray(pose);
                this._camera.matrix = modelViewMatrix;
                this._camera.matrixWorldNeedsUpdate = true;
            }

            onResize() {
                // When device orientation changes, update camera params.
                const width = this._renderer.domElement.width;
                const height = this._renderer.domElement.height;
                const cameraParams = this.oxSDK.getCameraParameters();
                this._camera.fov = cameraParams.fov;
                this._camera.aspect = cameraParams.aspect;
                this._camera.updateProjectionMatrix();
                this._renderer.setSize(width, height);
            }
        }

        const oxExp = new OxExperience();
        await oxExp.init();
    </script>
</body>
</html>
