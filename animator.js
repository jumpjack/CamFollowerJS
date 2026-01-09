
// animator.js

// --- Globals ---
let scene, camera, renderer, controls;
let stickman, followerRod, camDisk;
let isPlaying = false;
let playSpeed = 1; // degrees per frame
let animationId;

// State
const state = {
    angle: 0,       // 0-360 degrees
    height: 0,      // 0-100 units
    keyframes: []   // Array of { angle: number, height: number }
};

// Dragging state
let draggingKeyframe = null;
let profileCanvas = null;
let profileCtx = null;
let smoothCurve = true; // Smooth curve interpolation enabled by default

// DOM Elements
const elCanvas = document.getElementById('canvas-container');
const elAngleSlider = document.getElementById('cam-angle');
const elAngleVal = document.getElementById('cam-angle-val');
const elHeightSlider = document.getElementById('follower-height');
const elHeightVal = document.getElementById('follower-height-val');
const elTimeline = document.getElementById('timeline-viz');
const elCurrentMarker = document.getElementById('current-time-marker');

// --- Initialization ---
function init() {
    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);
    scene.fog = new THREE.Fog(0x222222, 200, 500);

    // 2. Camera Setup
    camera = new THREE.PerspectiveCamera(45, elCanvas.clientWidth / elCanvas.clientHeight, 1, 1000);
    camera.position.set(200, 150, 200);
    camera.lookAt(0, 50, 0);

    // 3. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(elCanvas.clientWidth, elCanvas.clientHeight);
    renderer.shadowMap.enabled = true;
    elCanvas.appendChild(renderer.domElement);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, 200, 100);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // 5. Objects
    createGround();
    createMechanism();
    // createStickman(); // Removed - keeping only the follower rod

    // 6. Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 50;
    controls.maxDistance = 800;
    controls.maxPolarAngle = Math.PI / 2; // Don't allow going below ground

    // 7. Initialize Profile Canvas
    profileCanvas = document.getElementById('profile-canvas');
    profileCtx = profileCanvas.getContext('2d');
    resizeProfileCanvas();

    // 8. Listeners
    window.addEventListener('resize', onWindowResize, false);
    setupUI();
    setupProfileInteraction();

    // 9. Load imported keyframes from localStorage (if any)
    loadImportedKeyframes();

    // 10. Initial Render
    drawProfileCurve();
    animate();
}

function createGround() {
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(500, 500),
        new THREE.MeshPhongMaterial({ color: 0x444444, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const grid = new THREE.GridHelper(500, 50, 0x000000, 0x555555);
    scene.add(grid);
}

function createMechanism() {
    // Create initial cam disk (will be updated dynamically)
    updateCamGeometry();

    // Follower Rod
    const rodGeo = new THREE.CylinderGeometry(2, 2, 100, 8);
    const rodMat = new THREE.MeshPhongMaterial({ color: 0x44aaff });
    followerRod = new THREE.Mesh(rodGeo, rodMat);
    followerRod.position.x = 0;
    followerRod.position.y = 80; // Initial pos
    followerRod.castShadow = true;
    scene.add(followerRod);
}

// Constants for cam geometry
const CAM_BASE_RADIUS = 25;  // Base radius when height = 0
const CAM_MAX_OFFSET = 100;   // Maximum additional radius when height = 100 (larger = more visible profile)
const CAM_THICKNESS = 8;     // Thickness of the cam
const CAM_RESOLUTION = 72;   // Number of points around the cam (every 5 degrees)

function updateCamGeometry() {
    // Remove old cam if exists
    if (camDisk) {
        scene.remove(camDisk);
        if (camDisk.geometry) camDisk.geometry.dispose();
        if (camDisk.material) camDisk.material.dispose();
    }

    // Build cam profile shape based on keyframes
    const shape = new THREE.Shape();
    const sortedKeyframes = [...state.keyframes].sort((a, b) => a.angle - b.angle);

    // Generate points around the cam
    const points = [];
    for (let i = 0; i < CAM_RESOLUTION; i++) {
        const angle = (i / CAM_RESOLUTION) * 360;
        const heightValue = getInterpolatedHeightForCam(angle, sortedKeyframes);
        const radius = CAM_BASE_RADIUS + (heightValue / 100) * CAM_MAX_OFFSET;

        // Convert to cartesian (angle 0 = top, counter-clockwise direction)
        // Use negative angle to match profile curve direction
        const rad = THREE.MathUtils.degToRad(-angle + 90); // +90 to start at top, negative for CCW
        const x = Math.cos(rad) * radius;
        const y = Math.sin(rad) * radius;
        points.push(new THREE.Vector2(x, y));
    }

    // Create the shape from points
    if (points.length > 0) {
        shape.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            shape.lineTo(points[i].x, points[i].y);
        }
        shape.lineTo(points[0].x, points[0].y); // Close the shape
    }

    // Add center hole
    const holePath = new THREE.Path();
    const holeRadius = 3;
    holePath.moveTo(holeRadius, 0);
    for (let i = 1; i <= 32; i++) {
        const theta = (i / 32) * Math.PI * 2;
        holePath.lineTo(Math.cos(theta) * holeRadius, Math.sin(theta) * holeRadius);
    }
    shape.holes.push(holePath);

    // Extrude settings
    const extrudeSettings = {
        depth: CAM_THICKNESS,
        bevelEnabled: true,
        bevelThickness: 1,
        bevelSize: 0.5,
        bevelOffset: 0,
        bevelSegments: 2
    };

    // Create geometry
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // The shape is in XY plane, extrusion goes along Z.
    // We want the cam to face the camera (like a vertical wheel).
    // The shape is already centered at origin (0,0) which is where the hole is.

    // Only center the Z-axis (depth) so the cam is centered in thickness
    // but keeps rotating around the origin (center hole)
    geometry.computeBoundingBox();
    const zCenter = (geometry.boundingBox.min.z + geometry.boundingBox.max.z) / 2;
    geometry.translate(0, 0, -zCenter);

    // Create material
    const material = new THREE.MeshPhongMaterial({
        color: 0x888888,
        flatShading: false,
        side: THREE.DoubleSide
    });

    // Create mesh
    camDisk = new THREE.Mesh(geometry, material);
    camDisk.position.y = 30;
    camDisk.castShadow = true;
    camDisk.receiveShadow = true;

    // Add a visual marker to see rotation (at 0 degrees position)
    const markerGeo = new THREE.BoxGeometry(4, 4, CAM_THICKNESS + 4);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const marker = new THREE.Mesh(markerGeo, markerMat);

    // Position marker at the top (0 degrees = top of cam, which is +Y in our coordinate)
    const markerRadius = CAM_BASE_RADIUS + (getInterpolatedHeightForCam(0, sortedKeyframes) / 100) * CAM_MAX_OFFSET;
    marker.position.set(0, markerRadius - 3, 0);
    camDisk.add(marker);

    scene.add(camDisk);

    // Apply current rotation (Z-axis since cam faces camera in XY plane)
    camDisk.rotation.z = THREE.MathUtils.degToRad(state.angle);
}

// Helper function to get interpolated height for cam geometry
// Uses same interpolation as profile curve (smooth or linear based on setting)
function getInterpolatedHeightForCam(angle, sortedKeyframes) {
    if (sortedKeyframes.length === 0) return 0;
    if (sortedKeyframes.length === 1) return sortedKeyframes[0].height;

    // Use smooth Catmull-Rom interpolation if enabled
    if (smoothCurve && sortedKeyframes.length >= 2) {
        return catmullRomInterpolate(angle, sortedKeyframes);
    }

    // Fall back to linear interpolation
    return linearInterpolate(angle, sortedKeyframes);
}


function createStickman() {
    stickman = new THREE.Group();

    // Materials
    const jointMat = new THREE.MeshPhongMaterial({ color: 0xffcc00 }); // Yellow joints
    const boneMat = new THREE.MeshPhongMaterial({ color: 0xffffff });  // White bones

    // 1. Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(10, 40, 5), boneMat);
    torso.position.y = 20; // local y, relative to hip
    stickman.add(torso);

    // 2. Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 16), jointMat);
    head.position.y = 45;
    torso.add(head);

    // 3. Arms (Static for now, could be animated later)
    const armL = new THREE.Mesh(new THREE.BoxGeometry(4, 30, 4), boneMat);
    armL.position.set(-8, 30, 0);
    armL.rotation.z = 0.5;
    stickman.add(armL);

    const armR = new THREE.Mesh(new THREE.BoxGeometry(4, 30, 4), boneMat);
    armR.position.set(8, 30, 0);
    armR.rotation.z = -0.5;
    stickman.add(armR);

    // 4. Legs
    // We will attach stickman to the rod, so the whole group moves up/down.
    // Let's add simple legs hanging down.
    const legL = new THREE.Mesh(new THREE.BoxGeometry(5, 40, 5), boneMat);
    legL.position.set(-6, -20, 0);
    stickman.add(legL);

    const legR = new THREE.Mesh(new THREE.BoxGeometry(5, 40, 5), boneMat);
    legR.position.set(6, -20, 0);
    stickman.add(legR);

    // Position entire stickman on top of the rod
    stickman.position.y = 50; // Half rod height roughly
    followerRod.add(stickman); // Attach to rod so it moves with it
}

// --- Logic ---

function updateScene() {
    // 1. Rotate Cam
    // Cam faces camera in XY plane, so we rotate around Z axis
    if (camDisk) {
        camDisk.rotation.z = THREE.MathUtils.degToRad(state.angle);
    }

    // 2. Move Follower Rod based on cam profile at current angle
    // Get the interpolated height from the keyframes at the current rotation angle
    const sortedKeyframes = [...state.keyframes].sort((a, b) => a.angle - b.angle);
    const profileHeight = getInterpolatedHeightForCam(state.angle, sortedKeyframes);

    // Calculate the cam radius at this angle
    const camRadius = CAM_BASE_RADIUS + (profileHeight / 100) * CAM_MAX_OFFSET;

    // Position the follower rod so its bottom touches the cam profile
    // The cam center is at Y=30, the follower rod is 100 units tall
    // Reduce offset to bring stickman feet closer to cam
    const camCenterY = 30;
    const rodOffset = 53; // No offset - rod bottom touches cam edge
    followerRod.position.y = camCenterY + camRadius + rodOffset;

    // Update state.height to match the profile (for UI sync)
    if (isPlaying) {
        state.height = profileHeight;
    }

    // 3. Update UI values
    elAngleVal.innerText = Math.round(state.angle) + '°';
    elHeightVal.innerText = Math.round(profileHeight);

    // Update Slider UI if not being dragged (to sync with play)
    if (isPlaying) {
        elAngleSlider.value = state.angle;
        elHeightSlider.value = profileHeight;
    }

    // Update timeline marker
    const pct = state.angle / 360 * 100;
    elCurrentMarker.style.left = pct + '%';
}

function updateInterpolation() {
    // If we are playing or moving angle, and we have keyframes, interpolate height
    if (state.keyframes.length < 2) return;

    // Sort keyframes by angle
    state.keyframes.sort((a, b) => a.angle - b.angle);

    // Find current interval
    let cur = state.angle;
    // Handle wrap-around logic? 
    // Basic linear interpolation:
    // Find p1 <= cur < p2

    // Ensure we have a point at 0 and 360 for loop?
    // If user didn't set 0/360, we might wrap.
    // For now, let's just look for neighbors.

    let p1 = state.keyframes[0];
    let p2 = state.keyframes[state.keyframes.length - 1];

    for (let i = 0; i < state.keyframes.length - 1; i++) {
        if (state.angle >= state.keyframes[i].angle && state.angle <= state.keyframes[i + 1].angle) {
            p1 = state.keyframes[i];
            p2 = state.keyframes[i + 1];
            break;
        }
    }

    // Special case: if angle > last keyframe, interpolate to first (loop)?
    // Or just clamp to last? 
    // For a cyclic cam, 360 should equal 0.

    // Let's implement simple linear between p1 and p2
    // If p1 == p2, height is p1.height
    if (p1 === p2) {
        state.height = p1.height;
        return;
    }

    const t = (state.angle - p1.angle) / (p2.angle - p1.angle);
    state.height = p1.height + (p2.height - p1.height) * t;
}

function onWindowResize() {
    camera.aspect = elCanvas.clientWidth / elCanvas.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(elCanvas.clientWidth, elCanvas.clientHeight);
    resizeProfileCanvas();
    drawProfileCurve();
}

function animate() {
    requestAnimationFrame(animate);

    // required if controls.enableDamping or controls.autoRotate are set to true
    if (controls) controls.update();

    if (isPlaying) {
        state.angle += playSpeed;
        if (state.angle >= 360) state.angle = 0;
        updateInterpolation();
        updateScene();
    }

    renderer.render(scene, camera);
}

// --- UI Binding ---

function setupUI() {
    // Sliders
    elAngleSlider.addEventListener('input', (e) => {
        state.angle = parseFloat(e.target.value);
        isPlaying = false;
        // Optionally snap to existing keyframe?
        updateInterpolation(); // If we want to see the curve while scrubbing
        updateScene(); // Just update visual
    });

    elHeightSlider.addEventListener('input', (e) => {
        state.height = parseFloat(e.target.value);
        updateScene();
    });

    // Buttons
    document.getElementById('btn-add-keyframe').addEventListener('click', addKeyframe);
    document.getElementById('btn-play').addEventListener('click', togglePlay);
    document.getElementById('btn-clear').addEventListener('click', clearKeyframes);
    document.getElementById('btn-save-exit').addEventListener('click', exportAndExit);

    // Initial state
    // Add default keyframes at 0 and 360?

    // Smooth curve checkbox
    const chkSmooth = document.getElementById('chk-smooth');
    if (chkSmooth) {
        chkSmooth.addEventListener('change', (e) => {
            smoothCurve = e.target.checked;
            updateCamGeometry();
            drawProfileCurve();
        });
    }
}

function loadImportedKeyframes() {
    const stored = localStorage.getItem('editorKeyframes');
    if (stored) {
        try {
            const keyframes = JSON.parse(stored);
            if (Array.isArray(keyframes) && keyframes.length > 0) {
                // Load the keyframes
                state.keyframes = keyframes.map(k => ({
                    angle: parseFloat(k.angle) || 0,
                    height: parseFloat(k.height) || 0
                }));
                console.log('Loaded ' + state.keyframes.length + ' keyframes from main editor');

                // Update visuals
                updateCamGeometry();
                renderTimeline();
            }
        } catch (e) {
            console.error('Failed to load keyframes:', e);
        }
        // Clear after loading (so refreshing doesn't reload)
        localStorage.removeItem('editorKeyframes');
    }
}

function addKeyframe() {
    // Check if keyframe exists at this angle
    const existingIdx = state.keyframes.findIndex(k => Math.abs(k.angle - state.angle) < 0.5);

    const newKey = { angle: state.angle, height: state.height };

    if (existingIdx >= 0) {
        // Update
        state.keyframes[existingIdx] = newKey;
    } else {
        // Add
        state.keyframes.push(newKey);
    }

    renderTimeline();
    updateCamGeometry(); // Update 3D cam shape live
}

function clearKeyframes() {
    state.keyframes = [];
    renderTimeline();
    updateCamGeometry(); // Reset 3D cam to default circle
}

function togglePlay() {
    isPlaying = !isPlaying;
    document.getElementById('btn-play').innerText = isPlaying ? "Pause" : "Play Preview";
}

function renderTimeline() {
    // Clear existing markers
    const markers = elTimeline.querySelectorAll('.keyframe-marker');
    markers.forEach(m => m.remove());

    const rect = elTimeline.getBoundingClientRect();
    const canvasHeight = rect.height;
    const padding = 10;

    state.keyframes.forEach((k, index) => {
        const div = document.createElement('div');
        div.className = 'keyframe-marker';
        div.dataset.index = index;

        // Position X based on angle (0-360 -> 0-100%)
        const xPercent = (k.angle / 360 * 100);
        div.style.left = xPercent + '%';

        // Position Y based on height (0-100 -> bottom to top)
        const yPos = canvasHeight - padding - ((k.height / 100) * (canvasHeight - 2 * padding));
        div.style.top = yPos + 'px';

        div.title = `Angle: ${Math.round(k.angle)}°, Height: ${Math.round(k.height)}`;

        // Click to select
        div.addEventListener('click', (e) => {
            e.stopPropagation();
            state.angle = k.angle;
            state.height = k.height;
            elAngleSlider.value = k.angle;
            elHeightSlider.value = k.height;
            updateScene();
            drawProfileCurve();
        });

        // Drag to move
        div.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            draggingKeyframe = { index, element: div };
        });

        elTimeline.appendChild(div);
    });

    drawProfileCurve();
}

function exportAndExit() {
    // Sort keyframes by angle
    state.keyframes.sort((a, b) => a.angle - b.angle);

    // If no keyframes, warn
    if (state.keyframes.length === 0) {
        alert("No keyframes created! Please add at least 2 keyframes.");
        return;
    }

    // Export only the actual keyframe points (not interpolated)
    const exportPoints = state.keyframes.map(k => ({
        x: k.angle,
        y: k.height
    }));

    const exportData = {
        name: "3D Editor Profile",
        segments: exportPoints,
        rotSpeed: 1,
        stepsWidth: -1,
        rotationDir: 1,
        dataType: "rotating"
    };

    localStorage.setItem('camImport', JSON.stringify(exportData));
    window.location.href = 'index.html';
}

// --- Profile Canvas Functions ---

function resizeProfileCanvas() {
    const rect = elTimeline.getBoundingClientRect();
    profileCanvas.width = rect.width;
    profileCanvas.height = rect.height;
}

function drawProfileCurve() {
    if (!profileCtx) return;

    const width = profileCanvas.width;
    const height = profileCanvas.height;
    const padding = 10;

    // Clear canvas
    profileCtx.clearRect(0, 0, width, height);

    // Draw grid lines
    profileCtx.strokeStyle = '#555';
    profileCtx.lineWidth = 0.5;

    // Horizontal grid lines (height levels)
    for (let h = 0; h <= 100; h += 25) {
        const y = height - padding - (h / 100) * (height - 2 * padding);
        profileCtx.beginPath();
        profileCtx.moveTo(0, y);
        profileCtx.lineTo(width, y);
        profileCtx.stroke();

        // Label
        profileCtx.fillStyle = '#888';
        profileCtx.font = '10px sans-serif';
        profileCtx.fillText(h.toString(), 2, y - 2);
    }

    // Vertical grid lines (angle markers)
    for (let a = 0; a <= 360; a += 90) {
        const x = (a / 360) * width;
        profileCtx.beginPath();
        profileCtx.moveTo(x, 0);
        profileCtx.lineTo(x, height);
        profileCtx.stroke();

        // Label
        profileCtx.fillStyle = '#888';
        profileCtx.fillText(a + '°', x + 2, height - 2);
    }

    // Draw the interpolated profile curve
    if (state.keyframes.length >= 2) {
        const sortedKeyframes = [...state.keyframes].sort((a, b) => a.angle - b.angle);

        profileCtx.strokeStyle = '#4CAF50';
        profileCtx.lineWidth = 3;
        profileCtx.beginPath();

        // Draw smooth curve through all points
        for (let angle = 0; angle <= 360; angle += 1) {
            const interpolatedHeight = getInterpolatedHeight(angle, sortedKeyframes);
            const x = (angle / 360) * width;
            const y = height - padding - (interpolatedHeight / 100) * (height - 2 * padding);

            if (angle === 0) {
                profileCtx.moveTo(x, y);
            } else {
                profileCtx.lineTo(x, y);
            }
        }
        profileCtx.stroke();

        // Draw filled area under curve
        profileCtx.lineTo(width, height - padding);
        profileCtx.lineTo(0, height - padding);
        profileCtx.closePath();
        profileCtx.fillStyle = 'rgba(76, 175, 80, 0.2)';
        profileCtx.fill();
    } else if (state.keyframes.length === 1) {
        // Single keyframe - draw as horizontal line
        const y = height - padding - (state.keyframes[0].height / 100) * (height - 2 * padding);
        profileCtx.strokeStyle = '#4CAF50';
        profileCtx.lineWidth = 2;
        profileCtx.setLineDash([5, 5]);
        profileCtx.beginPath();
        profileCtx.moveTo(0, y);
        profileCtx.lineTo(width, y);
        profileCtx.stroke();
        profileCtx.setLineDash([]);
    }
}

function getInterpolatedHeight(angle, sortedKeyframes) {
    if (sortedKeyframes.length === 0) return 0;
    if (sortedKeyframes.length === 1) return sortedKeyframes[0].height;

    // Use smooth Catmull-Rom interpolation if enabled
    if (smoothCurve && sortedKeyframes.length >= 2) {
        return catmullRomInterpolate(angle, sortedKeyframes);
    }

    // Fall back to linear interpolation
    return linearInterpolate(angle, sortedKeyframes);
}

// Catmull-Rom spline interpolation for smooth curves
function catmullRomInterpolate(angle, sortedKeyframes) {
    const n = sortedKeyframes.length;

    // Find the segment containing the angle
    let idx = 0;
    for (let i = 0; i < n - 1; i++) {
        if (angle >= sortedKeyframes[i].angle && angle <= sortedKeyframes[i + 1].angle) {
            idx = i;
            break;
        }
    }

    // Handle wrap-around
    if (angle > sortedKeyframes[n - 1].angle || angle < sortedKeyframes[0].angle) {
        idx = n - 1; // Last segment wraps to first
    }

    // Get 4 control points (p0, p1, p2, p3) for Catmull-Rom
    const p0 = sortedKeyframes[(idx - 1 + n) % n];
    const p1 = sortedKeyframes[idx];
    const p2 = sortedKeyframes[(idx + 1) % n];
    const p3 = sortedKeyframes[(idx + 2) % n];

    // Calculate t (0-1) within the current segment
    let t;
    if (idx === n - 1) {
        // Wrap-around segment
        const segmentLength = (360 - p1.angle) + p2.angle;
        if (angle >= p1.angle) {
            t = (angle - p1.angle) / segmentLength;
        } else {
            t = (360 - p1.angle + angle) / segmentLength;
        }
    } else {
        const segmentLength = p2.angle - p1.angle;
        t = segmentLength > 0 ? (angle - p1.angle) / segmentLength : 0;
    }

    t = Math.max(0, Math.min(1, t));

    // Catmull-Rom spline formula
    const t2 = t * t;
    const t3 = t2 * t;

    const h0 = p0.height;
    const h1 = p1.height;
    const h2 = p2.height;
    const h3 = p3.height;

    // Catmull-Rom coefficients (tension = 0.5)
    const result = 0.5 * (
        (2 * h1) +
        (-h0 + h2) * t +
        (2 * h0 - 5 * h1 + 4 * h2 - h3) * t2 +
        (-h0 + 3 * h1 - 3 * h2 + h3) * t3
    );

    return Math.max(0, Math.min(100, result));
}

// Linear interpolation fallback
function linearInterpolate(angle, sortedKeyframes) {
    // Find surrounding keyframes
    let p1 = sortedKeyframes[sortedKeyframes.length - 1];
    let p2 = sortedKeyframes[0];

    for (let i = 0; i < sortedKeyframes.length - 1; i++) {
        if (angle >= sortedKeyframes[i].angle && angle <= sortedKeyframes[i + 1].angle) {
            p1 = sortedKeyframes[i];
            p2 = sortedKeyframes[i + 1];
            break;
        }
    }

    // Handle wrap-around case (angle > last keyframe)
    if (angle > sortedKeyframes[sortedKeyframes.length - 1].angle) {
        p1 = sortedKeyframes[sortedKeyframes.length - 1];
        p2 = sortedKeyframes[0];
        const range = (360 - p1.angle) + p2.angle;
        const pos = angle - p1.angle;
        if (range > 0) {
            const t = pos / range;
            return p1.height + (p2.height - p1.height) * t;
        }
        return p1.height;
    }

    // Handle before first keyframe
    if (angle < sortedKeyframes[0].angle) {
        p1 = sortedKeyframes[sortedKeyframes.length - 1];
        p2 = sortedKeyframes[0];
        const range = (360 - p1.angle) + p2.angle;
        const pos = (360 - p1.angle) + angle;
        if (range > 0) {
            const t = pos / range;
            return p1.height + (p2.height - p1.height) * t;
        }
        return p2.height;
    }

    // Linear interpolation
    if (p1.angle === p2.angle) return p1.height;
    const t = (angle - p1.angle) / (p2.angle - p1.angle);
    return p1.height + (p2.height - p1.height) * t;
}

function setupProfileInteraction() {
    // Click on canvas to add keyframe at that position
    elTimeline.addEventListener('click', (e) => {
        if (draggingKeyframe) return;

        const rect = elTimeline.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const padding = 10;

        // Convert position to angle and height
        const angle = (x / rect.width) * 360;
        const height = Math.max(0, Math.min(100,
            (1 - (y - padding) / (rect.height - 2 * padding)) * 100
        ));

        state.angle = angle;
        state.height = height;
        elAngleSlider.value = angle;
        elHeightSlider.value = height;

        addKeyframe();
        updateScene();
    });

    // Mouse move for dragging
    document.addEventListener('mousemove', (e) => {
        if (!draggingKeyframe) return;

        const rect = elTimeline.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const padding = 10;

        // Convert position to angle and height (clamped)
        const angle = Math.max(0, Math.min(360, (x / rect.width) * 360));
        const height = Math.max(0, Math.min(100,
            (1 - (y - padding) / (rect.height - 2 * padding)) * 100
        ));

        // Update keyframe
        state.keyframes[draggingKeyframe.index].angle = angle;
        state.keyframes[draggingKeyframe.index].height = height;

        // Update current state to match dragged keyframe
        state.angle = angle;
        state.height = height;
        elAngleSlider.value = angle;
        elHeightSlider.value = height;

        updateScene();
        renderTimeline();
        updateCamGeometry(); // Update 3D cam shape while dragging
    });

    // Mouse up to stop dragging
    document.addEventListener('mouseup', () => {
        draggingKeyframe = null;
    });

    // Double-click on marker to delete
    elTimeline.addEventListener('dblclick', (e) => {
        if (e.target.classList.contains('keyframe-marker')) {
            const index = parseInt(e.target.dataset.index);
            state.keyframes.splice(index, 1);
            renderTimeline();
            updateCamGeometry(); // Update 3D cam after deleting point
        }
    });
}

// Start
init();
