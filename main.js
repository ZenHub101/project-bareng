import * as THREE from 'https://unpkg.com/three@0.165.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.165.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.165.0/examples/jsm/loaders/GLTFLoader.js';

// dom elements
const coordsInfo = document.getElementById("coords");
const turnInfo = document.getElementById("turn-text");
const toast = document.getElementById("toast");

// self-explanatory
class Piece {
  constructor(type, color) {
    this.type = type;
    this.color = color;
  }
}

// game variables
let board = Array(8).fill().map(() =>
  Array(8).fill().map(() =>
    Array(8).fill(null)
  )
);
let currentPlayer = 1; // 1 = white; 2 = black
const size = 8;
const selected = {
    file: 0,
    plane: 0,
    rank: 0
};
let activePiece = null;
const cells = [];
const backRankWhite = [
    "Rook",
    "Knight",
    "Bishop",
    "Queen",
    "King",
    "Bishop",
    "Knight",
    "Rook"
];
const backRankBlack = [
    "Rook",
    "Knight",
    "Bishop",
    "King",
    "Queen",
    "Bishop",
    "Knight",
    "Rook"
];
const backRankSecond = [
    "Rook",
    "Knight",
    "Bishop",
    "Unicorn",
    "Unicorn",
    "Bishop",
    "Knight",
    "Rook"
];
let highlightedCells = [];

// scene
const scene = new THREE.Scene();

// camera
const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.z = 12;
camera.position.y = 2
window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      needsRender = true;
  });

// reusable geometry — ONE shared instance for all cells
const geometry = new THREE.BoxGeometry(1, 1, 1);
const sharedEdges = new THREE.EdgesGeometry(geometry);

// renderer
const renderer = new THREE.WebGLRenderer({
    antialias: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);
controls.minDistance = 5;
controls.maxDistance = 20;
controls.update();

let controlsActive = false;
controls.addEventListener('start', () => { controlsActive = true; });
controls.addEventListener('end',   () => { controlsActive = false; });

// ambient light
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

// directional light
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(12, 12, 12);
scene.add(directionalLight);

// fake environment
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new THREE.Scene()).texture;

const boxMaterialShared = new THREE.MeshStandardMaterial({
    color: 0xffff00,
    transparent: true,
    opacity: 0.01
});
const wireMaterialEven = new THREE.LineBasicMaterial({
    color: 0xe0f0ef,
    transparent: true,
    opacity: 0.5
});
const wireMaterialOdd = new THREE.LineBasicMaterial({
    color: 0x815438,
    transparent: true,
    opacity: 0.5
});

const selectedBoxMaterial = new THREE.MeshStandardMaterial({
    color: 0xffff00,
    transparent: true,
    opacity: 0.5
});

let previousSelectedCell = null;

// board cells
for (let file = 0; file < size; file++) {
    cells[file] = [];
    for (let plane = 0; plane < size; plane++) {
        cells[file][plane] = [];
        for (let rank = 0; rank < size; rank++) {
            const isEven = (file + plane + rank) % 2 === 0;

            const wire = new THREE.LineSegments(
                sharedEdges,
                isEven ? wireMaterialEven : wireMaterialOdd
            );
            const boxMat = boxMaterialShared.clone();
            const box = new THREE.Mesh(geometry, boxMat);

            const cell = new THREE.Group();
            cells[file][plane][rank] = cell;
            cell.userData.box = box;
            cell.userData.wire = wire;
            cell.userData.file = file;
            cell.userData.plane = plane;
            cell.userData.rank = rank;

            cell.position.x =  (file  - (size - 1) / 2);
            cell.position.y = -(plane - (size - 1) / 2);
            cell.position.z = -(rank  - (size - 1) / 2);

            cell.add(box);
            cell.add(wire);
            box.userData.parentCell  = cell;
            wire.userData.parentCell = cell;
            scene.add(cell);
        }
    }
}



// --- function definitions ---

const modelCache = {};

// showing toast notifications
function showToast(message, msDuration) {
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => {toast.classList.remove("show");}, msDuration);
}

function getPiece(x, y, z) {
    if (x < 0 || x > 7 || y < 0 || y > 7 || z < 0 || z > 7) return null;
    return board[x][y][z];
}

// check detection
// find where is the king
function findKing(color) {
    for (let file = 0; file < size; file++) {
        for (let plane = 0; plane < size; plane++) {
            for (let rank = 0; rank < size; rank++) {
                const piece = board[file][plane][rank];
                if (piece && piece.type.toLowerCase() === "king" && piece.color === color) {
                    return { file, plane, rank };
                }
            }
        }
    }
    return null;
}
// check if the king is in danger (check for check)
function isKingInCheck(color) {
    const kingPos = findKing(color);
    if (!kingPos) return false;
    const enemyColor = color === "white" ? "black" : "white";
    for (let file = 0; file < size; file++) {
        for (let plane = 0; plane < size; plane++) {
            for (let rank = 0; rank < size; rank++) {
                const piece = board[file][plane][rank];
                if (!piece || piece.color !== enemyColor) continue;
                const moves = getValidMoves(file, plane, rank);
                const attacksKing = moves.some(m => 
                    m.file === kingPos.file &&
                    m.plane === kingPos.plane &&
                    m.rank === kingPos.rank
                );
                if (attacksKing) return true;
            }
        }
    }
    return false;
}

function placePiece(file, plane, rank, piece, color) {
    if (!board[file] || !board[file][plane]) {
        console.error("BROKEN BOARD STATE:", file, plane, rank);
        debugger;
    }
    console.log("board slot:", board[file], board[file]?.[plane]);
    board[file][plane][rank] = new Piece(piece, color);

    const applyModel = (gltfScene) => {
        const model = gltfScene.clone(true);

        model.position.set(
            (file  - (size - 1) / 2),
            -(plane - (size - 1) / 2) - 0.5,
            -(rank  - (size - 1) / 2)
        );

        const pieceMat = new THREE.MeshStandardMaterial({
            color: color === "white" ? 0xdfd3c3 : 0x815438,
            metalness: 0.5,
            roughness: 0.1
        });
        model.traverse(obj => {
            if (obj.isMesh) obj.material = pieceMat;
        });

        model.scale.set(0.05, 0.05, 0.05);
        model.rotation.x = -Math.PI / 2;

        if (piece.toLowerCase() === "king") {
            model.rotation.z = Math.PI / 2;
        }
        if (color === "black") {
            model.rotation.z += Math.PI;
        }
        scene.add(model);
        cells[file][plane][rank].userData.pieceModel = model;
        // FIX 2: trigger a re-render when a model finishes loading
        needsRender = true;
    };

    if (modelCache[piece]) {
        applyModel(modelCache[piece]);
    } else {
        loader.load(
            `assets/3D models/${piece}.glb`,
            gltf => {
                modelCache[piece] = gltf.scene;
                applyModel(gltf.scene);
                gltf.scene.userData.boardPos = { file, plane, rank };
            }
        );
    }
}

const loader = new GLTFLoader();

// move validation
function isTarget(f, p, r, color) {
    if (f<0 || f>7 || p<0 || p>7 || r<0 || r>7) return false;
    const target = getPiece(f, p, r);
    return !target || target.color !== color;
}
function slide(file, plane, rank, color, directions) {
    const moves = [];
    for (const [df, dp, dr] of directions) {
        let f = file + df, p = plane + dp, r = rank + dr;
        while (f>=0 && f<8 && p>=0 && p<8 && r>=0 && r<8) {
            const target = getPiece(f, p, r);
            if (target) {
                if (target.color !== color) moves.push({ file: f, plane: p, rank: r });
                break;
            }
            moves.push({ file: f, plane: p, rank: r });
            f += df; p += dp; r += dr;
        }
    }
    return moves;
}
function getRookMoves(file, plane, rank, color) {
    return slide(file, plane, rank, color, [
        [1,0,0],[-1,0,0],
        [0,1,0],[0,-1,0],
        [0,0,1],[0,0,-1]
    ]);
}
function getBishopMoves(file, plane, rank, color) {
    return slide(file, plane, rank, color, [
        [1,1,0],[1,-1,0],[-1,1,0],[-1,-1,0],
        [1,0,1],[1,0,-1],[-1,0,1],[-1,0,-1],
        [0,1,1],[0,1,-1],[0,-1,1],[0,-1,-1]
    ]);
}
function getUnicornMoves(file, plane, rank, color) {
    return slide(file, plane, rank, color, [
        [1,1,1],[1,1,-1],[1,-1,1],[1,-1,-1],
        [-1,1,1],[-1,1,-1],[-1,-1,1],[-1,-1,-1]
    ]);
}
function getKnightMoves(file, plane, rank, color) {
    const moves = [];
    const deltas = [
        [2,1,0],[2,-1,0],[-2,1,0],[-2,-1,0],
        [2,0,1],[2,0,-1],[-2,0,1],[-2,0,-1],
        [1,2,0],[1,-2,0],[-2,1,0],[-2,-1,0],
        [0,2,1],[0,2,-1],[0,-2,1],[0,-2,-1],
        [1,0,2],[1,0,-2],[-1,0,2],[-1,0,-2],
        [0,1,2],[0,1,-2],[0,-1,2],[0,-1,-2]
    ];
    for (const [df, dp, dr] of deltas) {
        const f = file + df, p = plane + dp, r = rank + dr;
        if (isTarget(f, p, r, color)) moves.push({ file: f, plane: p, rank: r });
    }
    return moves;
}
function getKingMoves(file, plane, rank, color) {
    const moves = [];
    for (let df = -1; df <= 1; df++) {
        for (let dp = -1; dp <= 1; dp++) {
            for (let dr = -1; dr <= 1; dr++) {
                if (df === 0 && dp === 0 && dr === 0) continue;
                const f = file + df, p = plane + dp, r = rank + dr;
                if (isTarget(f, p, r, color)) moves.push({ file: f, plane: p, rank: r });
            }
        }
    }
    return moves;
}
function getPawnMoves(file, plane, rank, color) {
    const moves = [];
    const [fwd1, fwd2] = color === "white" ? [1, 1] : [-1, -1];
    const isStarting = color === "white" ? (rank === 1) : (rank === 6);

    const r1 = rank + fwd1;
    if (r1 >= 0 && r1 < 8 && !getPiece(file, plane, r1)) {
        moves.push({ file, plane, rank: r1 });
        const r2 = rank + fwd1 * 2;
        if (isStarting && r2 >= 0 && r2 < 8 && !getPiece(file, plane, r2)) {
            moves.push({ file, plane, rank: r2 });
        }
    }

    const p1 = plane + fwd2;
    if (p1 >= 0 && p1 < 8 && !getPiece(file, p1, rank)) {
        moves.push({ file, plane: p1, rank });
        const p2 = plane + fwd2 * 2;
        if (isStarting && p2 >= 0 && p2 < 8 && !getPiece(file, p2, rank)) {
            moves.push({ file, plane: p2, rank });
        }
    }

    const captures = [
        { file: file+1, plane, rank: rank + fwd1 },
        { file: file-1, plane, rank: rank + fwd1 },
        { file: file+1, plane: plane + fwd2, rank },
        { file: file-1, plane: plane + fwd2, rank }
    ];
    for (const m of captures) {
        if (m.file >= 0 && m.file < 8 && m.plane >= 0 && m.plane < 8 && m.rank >= 0 && m.rank < 8) {
            const target = getPiece(m.file, m.plane, m.rank);
            if (target && target.color !== color) moves.push(m);
        }
    }

    return moves;
}
function getValidMoves(file, plane, rank) {
    const piece = getPiece(file, plane, rank);
    if (!piece) return [];
    switch (piece.type) {
        case "Pawn":    return getPawnMoves(file, plane, rank, piece.color);
        case "Rook":    return getRookMoves(file, plane, rank, piece.color);
        case "Knight":  return getKnightMoves(file, plane, rank, piece.color);
        case "Bishop":  return getBishopMoves(file, plane, rank, piece.color);
        case "Queen":   return [...getRookMoves(file, plane, rank, piece.color), ...getBishopMoves(file, plane, rank, piece.color)];
        case "King":    return getKingMoves(file, plane, rank, piece.color);
        case "Unicorn": return getUnicornMoves(file, plane, rank, piece.color);
        default: return [];
    }
}
function getLegalMoves(file, plane, rank) {
    const piece = board[file][plane][rank];
    if (!piece) return [];

    const validMoves = getValidMoves(file, plane, rank);

    return validMoves.filter(move => {
        const capturedPiece =
            board[move.file][move.plane][move.rank];

        // simulate
        board[move.file][move.plane][move.rank] = piece;
        board[file][plane][rank] = null;

        const illegal =
            isKingInCheck(piece.color);

        // undo
        board[file][plane][rank] = piece;
        board[move.file][move.plane][move.rank] =
            capturedPiece;

        return !illegal;
    });
}

// highlight possible moves
function showMoves(moves) {
    clearMoves();
    for (const m of moves) {
        const cell = cells[m.file][m.plane][m.rank];
        const isCapture = !!getPiece(m.file, m.plane, m.rank);
        cell.userData.box.material.color.set(isCapture ? 0xff0000 : 0x00ff00);
        cell.userData.box.material.opacity = 0.3;
        highlightedCells.push(cell);
    }
    needsRender = true;
}
function clearMoves() {
    for (const cell of highlightedCells) {
        cell.userData.box.material.color.set(0xffff00);
        cell.userData.box.material.opacity = 0.01;
    }
    highlightedCells = [];
    cells[selected.file][selected.plane][selected.rank].userData.box.material.color.set(0xffff00);
    cells[selected.file][selected.plane][selected.rank].userData.box.material.opacity = 0.3;
    needsRender = true;
}

// move pieces
function movePiece(from, to) {
    const piece = board[from.file][from.plane][from.rank];
    if (!piece) return;
    const valid = getValidMoves(from.file, from.plane, from.rank);
    const allowed = valid.some(m =>
        m.file === to.file &&
        m.plane === to.plane &&
        m.rank === to.rank
    );
    if (!allowed) {
        console.log("illegal move!");
        activePiece = null;
        return;
    }
    const capturedPiece = board[to.file][to.plane][to.rank];
    board[to.file][to.plane][to.rank] = piece;
    board[from.file][from.plane][from.rank] = null;
    
    const leavesKingInCheck = isKingInCheck(piece.color);

    // undo simulation
    board[from.file][from.plane][from.rank] = piece;
    board[to.file][to.plane][to.rank] = capturedPiece;

    if (leavesKingInCheck) {
        console.log("Move leaves king in check!");
        console.log("illegal move!");
        activePiece = null;
        return;
    }

    // --- real move starts here ---

    if (capturedPiece) {
        const capturedModel =
            cells[to.file][to.plane][to.rank].userData.pieceModel;

        if (capturedModel) {
            scene.remove(capturedModel);
        }

        cells[to.file][to.plane][to.rank].userData.pieceModel = null;
    }

    board[to.file][to.plane][to.rank] = piece;
    board[from.file][from.plane][from.rank] = null;

    const model =
        cells[from.file][from.plane][from.rank].userData.pieceModel;

    if (model) {
        model.position.set(
            (to.file - (size - 1) / 2),
            -(to.plane - (size - 1) / 2) - 0.5,
            -(to.rank - (size - 1) / 2)
        );

        cells[to.file][to.plane][to.rank].userData.pieceModel = model;
        cells[from.file][from.plane][from.rank].userData.pieceModel = null;
    }

    currentPlayer = currentPlayer === 1 ? 2 : 1;

    turnInfo.textContent =
        currentPlayer === 1
            ? "White's turn"
            : "Black's turn";

    needsRender = true;

    if (isKingInCheck("white")) {
        console.log("White is in check!");
        showToast("White is in Check!", 3000);
    }

    if (isKingInCheck("black")) {
        console.log("Black is in check!");
        showToast("Black is in Check!", 3000);
    }
}

function clampSelection() {
    selected.file  = Math.max(0, Math.min(size - 1, selected.file));
    selected.plane = Math.max(0, Math.min(size - 1, selected.plane));
    selected.rank  = Math.max(0, Math.min(size - 1, selected.rank));
}

function updateHighlight() {
    if (previousSelectedCell) {
        // FIX 1: restore to move/capture highlight color if the cell is in
        //        highlightedCells, otherwise restore to default dim state
        const wasHighlighted = highlightedCells.includes(previousSelectedCell);
        if (wasHighlighted) {
            const isCapture = !!getPiece(
                previousSelectedCell.userData.file,
                previousSelectedCell.userData.plane,
                previousSelectedCell.userData.rank
            );
            previousSelectedCell.userData.box.material.color.set(isCapture ? 0xff0000 : 0x00ff00);
            previousSelectedCell.userData.box.material.opacity = 0.3;
        } else {
            previousSelectedCell.userData.box.material.opacity = 0.01;
        }
    }
    const cell = cells[selected.file][selected.plane][selected.rank];
    cell.userData.box.material.opacity = 0.3;
    previousSelectedCell = cell;
    needsRender = true;
}

let needsRender = true;

function moveUp()    { selected.plane--; clampSelection(); updateHighlight(); coordsInfo.textContent = `File: ${selected.file + 1} | Plane: ${selected.plane + 1} | Rank: ${selected.rank + 1}`; }
function moveDown()  { selected.plane++; clampSelection(); updateHighlight(); coordsInfo.textContent = `File: ${selected.file + 1} | Plane: ${selected.plane + 1} | Rank: ${selected.rank + 1}`; }
function moveRight() { selected.file++;  clampSelection(); updateHighlight(); coordsInfo.textContent = `File: ${selected.file + 1} | Plane: ${selected.plane + 1} | Rank: ${selected.rank + 1}`; }
function moveLeft()  { selected.file--;  clampSelection(); updateHighlight(); coordsInfo.textContent = `File: ${selected.file + 1} | Plane: ${selected.plane + 1} | Rank: ${selected.rank + 1}`; }
function moveFront() { selected.rank--;  clampSelection(); updateHighlight(); coordsInfo.textContent = `File: ${selected.file + 1} | Plane: ${selected.plane + 1} | Rank: ${selected.rank + 1}`; }
function moveBack()  { selected.rank++;  clampSelection(); updateHighlight(); coordsInfo.textContent = `File: ${selected.file + 1} | Plane: ${selected.plane + 1} | Rank: ${selected.rank + 1}`; }

window.addEventListener('keydown', (event) => {
    console.log(event.code);
    const blockedKeys = ['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','Enter'];
    if (blockedKeys.includes(event.code)) event.preventDefault();

    switch(event.code) {
        case 'KeyW': moveUp();    break;
        case 'KeyA': moveLeft();  break;
        case 'KeyS': moveDown();  break;
        case 'KeyD': moveRight(); break;
        case 'KeyQ': moveFront(); break;
        case 'KeyE': moveBack();  break;
        case 'Enter': {
            console.log("Enter hit", activePiece, board[selected.file][selected.plane][selected.rank]);
            if (!activePiece) {
                if (!board[selected.file][selected.plane][selected.rank]) break;
                const piece = board[selected.file][selected.plane][selected.rank];
                if (piece.color !== (currentPlayer === 1 ? "white" : "black")) break;
                activePiece = { ...selected };
                showMoves(getLegalMoves(selected.file, selected.plane, selected.rank));
                cells[activePiece.file][activePiece.plane][activePiece.rank]
                    .userData.box.material.opacity = 0.8;
                needsRender = true;
            } else {
                clearMoves();
                movePiece(activePiece, { ...selected });
                activePiece = null;
            }
            console.log(getValidMoves(selected.file, selected.plane, selected.rank));
            console.log(getLegalMoves(selected.file, selected.plane, selected.rank));
            break;
        }
    }
});

// on-screen buttons
document.getElementById("up").addEventListener('click',    moveUp);
document.getElementById("down").addEventListener('click',  moveDown);
document.getElementById("left").addEventListener('click',  moveLeft);
document.getElementById("right").addEventListener('click', moveRight);
document.getElementById("front").addEventListener('click', moveFront);
document.getElementById("back").addEventListener('click',  moveBack);
document.getElementById("place").addEventListener('click', () => {
    console.log("Enter hit", activePiece, board[selected.file][selected.plane][selected.rank]);
    if (!activePiece) {
        if (!board[selected.file][selected.plane][selected.rank]) return;
        const piece = board[selected.file][selected.plane][selected.rank];
        if (piece.color !== (currentPlayer === 1 ? "white" : "black")) return;
        activePiece = { ...selected };
        showMoves(getLegalMoves(selected.file, selected.plane, selected.rank));
        cells[activePiece.file][activePiece.plane][activePiece.rank]
            .userData.box.material.opacity = 0.8;
        needsRender = true;
    } else {
        clearMoves();
        movePiece(activePiece, { ...selected });
        activePiece = null;
    }
});

// starting pieces
for (let file = 0; file < size; file++) {
    placePiece(file, 0, 0, backRankWhite[file], "white");
    placePiece(file, 0, 1, "Pawn", "white");
    placePiece(file, 1, 0, backRankSecond[file], "white");
    placePiece(file, 1, 1, "Pawn", "white");
    placePiece(file, 7, 7, backRankBlack[file], "black");
    placePiece(file, 7, 6, "Pawn", "black");
    placePiece(file, 6, 7, backRankSecond[file], "black");
    placePiece(file, 6, 6, "Pawn", "black");
}

updateHighlight();

function animate() {
    requestAnimationFrame(animate);

    const damping = controls.enableDamping;

    if (damping && (controlsActive || controls.update())) {
        needsRender = true;
    }

    if (!needsRender) return;
    needsRender = false;

    renderer.render(scene, camera);
}

controls.addEventListener('change', () => { needsRender = true; });

animate();