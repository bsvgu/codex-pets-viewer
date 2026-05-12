const ATLAS = {
  cellWidth: 192,
  cellHeight: 208
};

const DEFAULT_WINDOW_SIZE = 340;
const BASE_SPRITE_SCALE = 1.38;
const MIN_SIZE_SCALE = 0.32;
const MAX_SIZE_SCALE = 2.24;
const SIZE_STEP = 0.1;
const CONTROL_BAR_WIDTH = 304;
const CONTROL_BAR_HEIGHT = 44;

const ANIMATIONS = [
  {
    id: "idle",
    row: 0,
    frames: 6,
    durations: [280, 110, 110, 140, 140, 320],
    loops: 3
  },
  {
    id: "waiting",
    row: 6,
    frames: 6,
    durations: [150, 150, 150, 150, 150, 260],
    loops: 2
  },
  {
    id: "waving",
    row: 3,
    frames: 4,
    durations: [140, 140, 140, 280],
    loops: 2
  },
  {
    id: "jumping",
    row: 4,
    frames: 5,
    durations: [140, 140, 140, 140, 280],
    loops: 2
  },
  {
    id: "review",
    row: 8,
    frames: 6,
    durations: [150, 150, 150, 150, 150, 280],
    loops: 2
  },
  {
    id: "running",
    row: 7,
    frames: 6,
    durations: [120, 120, 120, 120, 120, 220],
    loops: 2
  },
  {
    id: "running-right",
    row: 1,
    frames: 8,
    durations: [120, 120, 120, 120, 120, 120, 120, 220],
    loops: 1
  },
  {
    id: "running-left",
    row: 2,
    frames: 8,
    durations: [120, 120, 120, 120, 120, 120, 120, 220],
    loops: 1
  },
  {
    id: "failed",
    row: 5,
    frames: 8,
    durations: [140, 140, 140, 140, 140, 140, 140, 240],
    loops: 1
  }
];

const els = {
  stage: document.getElementById("stage"),
  sprite: document.getElementById("sprite"),
  label: document.getElementById("label"),
  empty: document.getElementById("empty"),
  prevPet: document.getElementById("prevPet"),
  nextPet: document.getElementById("nextPet"),
  zoomOut: document.getElementById("zoomOut"),
  zoomIn: document.getElementById("zoomIn"),
  nextAnimation: document.getElementById("nextAnimation"),
  settings: document.getElementById("settings"),
  menu: document.getElementById("menu"),
  minimize: document.getElementById("minimize"),
  close: document.getElementById("close"),
  resizeHandle: document.getElementById("resizeHandle")
};

let pets = [];
let petIndex = 0;
let animationIndex = 0;
let frameIndex = 0;
let completedLoops = 0;
let timer = null;
let sizeScale = readSizeScale();
let resizeDrag = null;
let moveDrag = null;
let spriteScale = BASE_SPRITE_SCALE;
let controlsVisible = false;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readSizeScale() {
  const stored = Number.parseFloat(localStorage.getItem("size-scale") || "1");

  return Number.isFinite(stored) ? clamp(stored, MIN_SIZE_SCALE, MAX_SIZE_SCALE) : 1;
}

function saveSizeScale() {
  localStorage.setItem("size-scale", sizeScale.toFixed(2));
}

function currentPetBoxSize() {
  return Math.round(DEFAULT_WINDOW_SIZE * sizeScale);
}

function currentWindowLayout() {
  const petBoxSize = currentPetBoxSize();

  return {
    width: controlsVisible ? Math.max(petBoxSize, CONTROL_BAR_WIDTH) : petBoxSize,
    height: controlsVisible ? petBoxSize + CONTROL_BAR_HEIGHT : petBoxSize
  };
}

function applyWindowLayout(anchor = "center") {
  const layout = currentWindowLayout();
  window.petViewer.setSize(layout.width, layout.height, anchor);
}

function updateSpriteScale() {
  const petBoxSize = currentPetBoxSize();
  const petAreaHeight = controlsVisible ? Math.max(1, window.innerHeight - CONTROL_BAR_HEIGHT) : window.innerHeight;
  const padding = clamp(petBoxSize * 0.1, 6, 18);
  const desiredScale = BASE_SPRITE_SCALE * (petBoxSize / DEFAULT_WINDOW_SIZE);
  const maxWidthScale = Math.max(0.1, (window.innerWidth - padding * 2) / ATLAS.cellWidth);
  const maxHeightScale = Math.max(0.1, (petAreaHeight - padding * 2) / ATLAS.cellHeight);

  spriteScale = Math.min(desiredScale, maxWidthScale, maxHeightScale);
  els.sprite.style.setProperty("--sprite-width", `${(ATLAS.cellWidth * spriteScale).toFixed(2)}px`);
  els.sprite.style.setProperty("--sprite-height", `${(ATLAS.cellHeight * spriteScale).toFixed(2)}px`);
  els.sprite.style.setProperty("--sprite-sheet-width", `${(ATLAS.cellWidth * 8 * spriteScale).toFixed(2)}px`);
  els.sprite.style.setProperty("--sprite-sheet-height", `${(ATLAS.cellHeight * 9 * spriteScale).toFixed(2)}px`);
  updateFrame();
}

function resizeToScale(nextScale, anchor = "center") {
  sizeScale = clamp(nextScale, MIN_SIZE_SCALE, MAX_SIZE_SCALE);
  saveSizeScale();
  applyWindowLayout(anchor);
  updateSpriteScale();
}

function currentPet() {
  return pets[petIndex] || null;
}

function currentAnimation() {
  return ANIMATIONS[animationIndex];
}

function savePetChoice() {
  const pet = currentPet();

  if (pet) {
    localStorage.setItem("selected-pet-id", pet.id);
  }
}

function updateFrame() {
  const animation = currentAnimation();
  const x = -frameIndex * ATLAS.cellWidth * spriteScale;
  const y = -animation.row * ATLAS.cellHeight * spriteScale;

  els.sprite.style.backgroundPosition = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
}

function clearAnimationTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function scheduleFrame() {
  const animation = currentAnimation();
  const duration = animation.durations[frameIndex] || animation.durations[animation.durations.length - 1];

  timer = window.setTimeout(() => {
    frameIndex += 1;

    if (frameIndex >= animation.frames) {
      frameIndex = 0;
      completedLoops += 1;

      if (completedLoops >= animation.loops) {
        nextAnimation(true);
        return;
      }
    }

    updateFrame();
    scheduleFrame();
  }, duration);
}

function playAnimation(index = animationIndex) {
  clearAnimationTimer();
  animationIndex = (index + ANIMATIONS.length) % ANIMATIONS.length;
  frameIndex = 0;
  completedLoops = 0;
  updateFrame();
  scheduleFrame();
}

function nextAnimation(auto = false) {
  const nextIndex = auto ? animationIndex + 1 : animationIndex + 1;
  playAnimation(nextIndex);
}

function setPetByIndex(index) {
  if (!pets.length) {
    return;
  }

  petIndex = (index + pets.length) % pets.length;
  const pet = currentPet();

  els.sprite.style.backgroundImage = `url("${pet.spriteUrl}")`;
  els.label.textContent = pet.displayName;
  els.stage.setAttribute("aria-label", pet.displayName);
  savePetChoice();
  playAnimation(0);
}

function setPetById(petId) {
  const nextIndex = pets.findIndex((pet) => pet.id === petId);

  if (nextIndex >= 0) {
    setPetByIndex(nextIndex);
  }
}

function showMenu() {
  window.petViewer.showMenu(currentPet()?.id || "");
}

function setControlsVisible(visible) {
  if (controlsVisible === visible) {
    return;
  }

  controlsVisible = visible;
  els.stage.classList.toggle("controls-visible", controlsVisible);
  applyWindowLayout(controlsVisible ? "show-controls" : "hide-controls");
  updateSpriteScale();
}

function isControlTarget(target) {
  return Boolean(target.closest("button, #chrome, #resizeHandle"));
}

async function startMoveDrag(event) {
  if (event.button !== 0 || isControlTarget(event.target)) {
    return;
  }

  const bounds = await window.petViewer.getBounds();

  if (!bounds) {
    return;
  }

  moveDrag = {
    pointerId: event.pointerId,
    startX: event.screenX,
    startY: event.screenY,
    windowX: bounds.x,
    windowY: bounds.y
  };
  els.stage.setPointerCapture(event.pointerId);
}

async function boot() {
  pets = await window.petViewer.getPets();
  resizeToScale(sizeScale);

  if (!pets.length) {
    els.empty.hidden = false;
    els.sprite.hidden = true;
    return;
  }

  const storedPetId = localStorage.getItem("selected-pet-id");
  const storedIndex = pets.findIndex((pet) => pet.id === storedPetId);
  setPetByIndex(storedIndex >= 0 ? storedIndex : 0);
}

els.prevPet.addEventListener("click", () => setPetByIndex(petIndex - 1));
els.nextPet.addEventListener("click", () => setPetByIndex(petIndex + 1));
els.zoomOut.addEventListener("click", () => resizeToScale(sizeScale - SIZE_STEP));
els.zoomIn.addEventListener("click", () => resizeToScale(sizeScale + SIZE_STEP));
els.nextAnimation.addEventListener("click", () => nextAnimation(false));
els.settings.addEventListener("click", () => window.petViewer.openSettings());
els.menu.addEventListener("click", showMenu);
els.minimize.addEventListener("click", () => window.petViewer.minimize());
els.close.addEventListener("click", () => window.petViewer.close());
els.stage.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  showMenu();
});
els.stage.addEventListener("click", (event) => {
  if (event.button !== 0 || isControlTarget(event.target)) {
    return;
  }

  setControlsVisible(true);
});
els.stage.addEventListener("dblclick", (event) => {
  if (isControlTarget(event.target)) {
    return;
  }

  event.preventDefault();
  moveDrag = null;
  window.petViewer.runAction();
});
els.stage.addEventListener("pointerdown", (event) => {
  startMoveDrag(event);
});
els.stage.addEventListener("pointermove", (event) => {
  if (!moveDrag || event.pointerId !== moveDrag.pointerId || event.buttons !== 1) {
    return;
  }

  window.petViewer.moveTo(
    moveDrag.windowX + event.screenX - moveDrag.startX,
    moveDrag.windowY + event.screenY - moveDrag.startY
  );
});
els.stage.addEventListener("pointerup", (event) => {
  if (moveDrag && event.pointerId === moveDrag.pointerId) {
    moveDrag = null;
  }
});
els.stage.addEventListener("pointercancel", () => {
  moveDrag = null;
});
els.stage.addEventListener("pointerleave", () => {
  setControlsVisible(false);
});
els.stage.addEventListener("wheel", (event) => {
  event.preventDefault();
  resizeToScale(sizeScale + (event.deltaY < 0 ? SIZE_STEP : -SIZE_STEP));
});
els.resizeHandle.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  resizeDrag = {
    pointerId: event.pointerId,
    startX: event.screenX,
    startY: event.screenY,
    startScale: sizeScale
  };
  els.resizeHandle.setPointerCapture(event.pointerId);
});
els.resizeHandle.addEventListener("pointermove", (event) => {
  if (!resizeDrag || event.pointerId !== resizeDrag.pointerId) {
    return;
  }

  const delta = Math.max(event.screenX - resizeDrag.startX, event.screenY - resizeDrag.startY);
  resizeToScale(resizeDrag.startScale + delta / DEFAULT_WINDOW_SIZE, "top-left");
});
els.resizeHandle.addEventListener("pointerup", (event) => {
  if (resizeDrag && event.pointerId === resizeDrag.pointerId) {
    resizeDrag = null;
  }
});
els.resizeHandle.addEventListener("pointercancel", () => {
  resizeDrag = null;
});
window.addEventListener("resize", () => {
  const petAreaHeight = controlsVisible ? Math.max(1, window.innerHeight - CONTROL_BAR_HEIGHT) : window.innerHeight;
  sizeScale = clamp(Math.min(window.innerWidth, petAreaHeight) / DEFAULT_WINDOW_SIZE, MIN_SIZE_SCALE, MAX_SIZE_SCALE);
  saveSizeScale();
  updateSpriteScale();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    window.petViewer.close();
  }

  if (event.key === "ArrowLeft") {
    setPetByIndex(petIndex - 1);
  }

  if (event.key === "ArrowRight") {
    setPetByIndex(petIndex + 1);
  }

  if (event.key === " ") {
    event.preventDefault();
    nextAnimation(false);
  }

  if (event.key === "+" || event.key === "=") {
    resizeToScale(sizeScale + SIZE_STEP);
  }

  if (event.key === "-") {
    resizeToScale(sizeScale - SIZE_STEP);
  }
});

window.petViewer.onSelectPet(setPetById);
window.petViewer.onNextPet(() => setPetByIndex(petIndex + 1));
window.petViewer.onNextAnimation(() => nextAnimation(false));

boot().catch(() => {
  els.empty.hidden = false;
  els.empty.textContent = "Could not load pets.";
});
