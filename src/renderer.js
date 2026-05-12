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
const CLICK_MOVE_THRESHOLD = 6;
const DOUBLE_CLICK_MS = 320;
const IDLE_ANIMATION_ID = "idle";
const IDLE_LOOPS_MIN = 6;
const IDLE_LOOPS_MAX = 10;

const DEFAULT_ANIMATIONS = [
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
  close: document.getElementById("close")
};

let pets = [];
let petIndex = 0;
let activeAnimations = DEFAULT_ANIMATIONS;
let animationIndex = 0;
let frameIndex = 0;
let completedLoops = 0;
let targetLoops = IDLE_LOOPS_MIN;
let timer = null;
let sizeScale = readSizeScale();
let moveDrag = null;
let spritePress = null;
let spriteScale = BASE_SPRITE_SCALE;
let controlsVisible = false;
let lastSpriteClickAt = 0;

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
    width: Math.max(petBoxSize, CONTROL_BAR_WIDTH),
    height: petBoxSize + CONTROL_BAR_HEIGHT
  };
}

function applyWindowLayout(anchor = "center") {
  const layout = currentWindowLayout();
  return window.petViewer.setSize(layout.width, layout.height, anchor);
}

function updateSpriteScale() {
  const petBoxSize = currentPetBoxSize();
  const petAreaHeight = Math.max(1, window.innerHeight - CONTROL_BAR_HEIGHT);
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
  return activeAnimations[animationIndex] || activeAnimations[0];
}

function idleAnimationIndex() {
  const index = activeAnimations.findIndex((animation) => animation.id === IDLE_ANIMATION_ID);
  return index >= 0 ? index : 0;
}

function randomIdleLoops() {
  return IDLE_LOOPS_MIN + Math.floor(Math.random() * (IDLE_LOOPS_MAX - IDLE_LOOPS_MIN + 1));
}

function randomNonIdleAnimationIndex() {
  const idleIndex = idleAnimationIndex();
  const candidates = activeAnimations
    .map((_animation, index) => index)
    .filter((index) => index !== idleIndex);

  return candidates[Math.floor(Math.random() * candidates.length)] || idleIndex;
}

function clampCell(value, max) {
  return Math.min(max, Math.max(0, Number.parseInt(value, 10) || 0));
}

function defaultAnimationCells(animation) {
  const frameCount = Array.isArray(animation.frames) ? animation.frames.length : Number.parseInt(animation.frames, 10) || 0;
  const frames = Array.isArray(animation.frames)
    ? animation.frames
    : Array.from({ length: frameCount }, (_value, index) => index);
  const durations = Array.isArray(animation.durations) ? animation.durations : [];

  return frames.map((frame, index) => ({
    row: clampCell(animation.row, 8),
    col: clampCell(frame, 7),
    duration: Math.max(40, Number.parseInt(durations[index] || durations[durations.length - 1] || 140, 10) || 140)
  }));
}

function animationCells(animation) {
  if (Array.isArray(animation.sequence) && animation.sequence.length) {
    return animation.sequence.map((cell) => ({
      row: clampCell(cell.row, 8),
      col: clampCell(cell.col ?? cell.frame, 7),
      duration: Math.max(40, Number.parseInt(cell.duration, 10) || 140)
    }));
  }

  return defaultAnimationCells(animation);
}

function normalizeAnimation(animation, fallback = {}) {
  const merged = {
    ...fallback,
    ...animation,
    id: animation.id || fallback.id,
    loops: Math.max(1, Number.parseInt(animation.loops ?? fallback.loops ?? 1, 10) || 1)
  };

  if (Array.isArray(animation.sequence)) {
    merged.sequence = animation.sequence.map((cell) => ({
      row: clampCell(cell.row, 8),
      col: clampCell(cell.col ?? cell.frame, 7),
      duration: Math.max(40, Number.parseInt(cell.duration, 10) || 140)
    }));
  }

  return merged;
}

function animationsForPet(pet) {
  const overrides = new Map((pet.animations || []).map((animation) => [animation.id, animation]));
  const animations = DEFAULT_ANIMATIONS.map((fallback) => normalizeAnimation(overrides.get(fallback.id) || {}, fallback));
  const knownIds = new Set(animations.map((animation) => animation.id));

  for (const animation of pet.animations || []) {
    if (animation.id && !knownIds.has(animation.id)) {
      animations.push(normalizeAnimation(animation));
    }
  }

  return animations;
}

function savePetChoice() {
  const pet = currentPet();

  if (pet) {
    localStorage.setItem("selected-pet-id", pet.id);
  }
}

function updateFrame() {
  const animation = currentAnimation();
  const cells = animationCells(animation);
  const cell = cells[frameIndex] || cells[0] || { row: 0, col: 0 };
  const x = -cell.col * ATLAS.cellWidth * spriteScale;
  const y = -cell.row * ATLAS.cellHeight * spriteScale;

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
  const cells = animationCells(animation);
  const duration = cells[frameIndex]?.duration || cells[cells.length - 1]?.duration || 140;

  timer = window.setTimeout(() => {
    frameIndex += 1;

    if (frameIndex >= cells.length) {
      frameIndex = 0;
      completedLoops += 1;

      if (completedLoops >= targetLoops) {
        playNextScheduledAnimation();
        return;
      }
    }

    updateFrame();
    scheduleFrame();
  }, duration);
}

function playAnimation(index = animationIndex, loops = null) {
  clearAnimationTimer();
  animationIndex = (index + activeAnimations.length) % activeAnimations.length;
  targetLoops = loops || currentAnimation().loops || 1;
  frameIndex = 0;
  completedLoops = 0;
  updateFrame();
  scheduleFrame();
}

function playIdleAnimation() {
  playAnimation(idleAnimationIndex(), randomIdleLoops());
}

function playRandomNonIdleAnimation() {
  const nextIndex = randomNonIdleAnimationIndex();
  playAnimation(nextIndex, activeAnimations[nextIndex].loops || 1);
}

function playNextScheduledAnimation() {
  if (currentAnimation().id === IDLE_ANIMATION_ID) {
    playRandomNonIdleAnimation();
  } else {
    playIdleAnimation();
  }
}

function nextAnimation() {
  playRandomNonIdleAnimation();
}

function setPetByIndex(index) {
  if (!pets.length) {
    return;
  }

  petIndex = (index + pets.length) % pets.length;
  const pet = currentPet();

  activeAnimations = animationsForPet(pet);
  els.sprite.style.backgroundImage = `url("${pet.spriteUrl}")`;
  els.label.textContent = pet.displayName;
  els.stage.setAttribute("aria-label", pet.displayName);
  savePetChoice();
  playIdleAnimation();
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
}

function isControlTarget(target) {
  return Boolean(target.closest("button, #chrome"));
}

async function startMoveDrag(event) {
  if (event.button !== 0 || isControlTarget(event.target)) {
    return;
  }

  const press = {
    pointerId: event.pointerId,
    startX: event.screenX,
    startY: event.screenY,
    moved: false
  };

  spritePress = press;
  try {
    els.sprite.setPointerCapture(event.pointerId);
  } catch {}

  const bounds = await window.petViewer.getBounds();

  if (!bounds || spritePress !== press) {
    return;
  }

  moveDrag = {
    pointerId: event.pointerId,
    startX: event.screenX,
    startY: event.screenY,
    windowX: bounds.x,
    windowY: bounds.y
  };
}

function handleSpritePointerUp(event) {
  if (!spritePress || event.pointerId !== spritePress.pointerId) {
    return;
  }

  const moved = spritePress.moved ||
    Math.abs(event.screenX - spritePress.startX) > CLICK_MOVE_THRESHOLD ||
    Math.abs(event.screenY - spritePress.startY) > CLICK_MOVE_THRESHOLD;

  spritePress = null;
  moveDrag = null;

  if (moved) {
    return;
  }

  const now = Date.now();
  const isDoubleClick = now - lastSpriteClickAt <= DOUBLE_CLICK_MS;
  lastSpriteClickAt = now;
  setControlsVisible(true);

  if (isDoubleClick) {
    lastSpriteClickAt = 0;
    window.petViewer.runAction();
  }
}

async function boot() {
  await refreshPets(localStorage.getItem("selected-pet-id"));
}

async function refreshPets(preferredPetId = currentPet()?.id || localStorage.getItem("selected-pet-id")) {
  pets = await window.petViewer.getPets();
  resizeToScale(sizeScale);

  if (!pets.length) {
    els.empty.hidden = false;
    els.sprite.hidden = true;
    return;
  }

  els.empty.hidden = true;
  els.sprite.hidden = false;

  const storedIndex = pets.findIndex((pet) => pet.id === preferredPetId);
  setPetByIndex(storedIndex >= 0 ? storedIndex : 0);
}

els.prevPet.addEventListener("click", () => setPetByIndex(petIndex - 1));
els.nextPet.addEventListener("click", () => setPetByIndex(petIndex + 1));
els.zoomOut.addEventListener("click", () => resizeToScale(sizeScale - SIZE_STEP));
els.zoomIn.addEventListener("click", () => resizeToScale(sizeScale + SIZE_STEP));
els.nextAnimation.addEventListener("click", () => nextAnimation());
els.settings.addEventListener("click", () => window.petViewer.openSettings());
els.menu.addEventListener("click", showMenu);
els.minimize.addEventListener("click", () => window.petViewer.minimize());
els.close.addEventListener("click", () => window.petViewer.close());
els.stage.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  showMenu();
});
els.sprite.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  startMoveDrag(event);
});
els.stage.addEventListener("pointermove", (event) => {
  if (!spritePress || event.pointerId !== spritePress.pointerId || event.buttons !== 1) {
    return;
  }

  if (
    Math.abs(event.screenX - spritePress.startX) > CLICK_MOVE_THRESHOLD ||
    Math.abs(event.screenY - spritePress.startY) > CLICK_MOVE_THRESHOLD
  ) {
    spritePress.moved = true;
  }

  if (!moveDrag) {
    return;
  }

  window.petViewer.moveTo(
    moveDrag.windowX + event.screenX - moveDrag.startX,
    moveDrag.windowY + event.screenY - moveDrag.startY
  );
});
els.stage.addEventListener("pointerup", (event) => {
  handleSpritePointerUp(event);
});
els.stage.addEventListener("pointercancel", () => {
  spritePress = null;
  moveDrag = null;
});
els.stage.addEventListener("pointerleave", () => {
  setControlsVisible(false);
});
els.stage.addEventListener("wheel", (event) => {
  event.preventDefault();
  resizeToScale(sizeScale + (event.deltaY < 0 ? SIZE_STEP : -SIZE_STEP));
});
window.addEventListener("resize", () => {
  const petAreaHeight = Math.max(1, window.innerHeight - CONTROL_BAR_HEIGHT);
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
    nextAnimation();
  }

  if (event.key === "+" || event.key === "=") {
    resizeToScale(sizeScale + SIZE_STEP);
  }

  if (event.key === "-") {
    resizeToScale(sizeScale - SIZE_STEP);
  }
});

window.petViewer.onSelectPet(setPetById);
window.petViewer.onPetsChanged(() => refreshPets());
window.petViewer.onNextPet(() => setPetByIndex(petIndex + 1));
window.petViewer.onNextAnimation(() => nextAnimation());

boot().catch(() => {
  els.empty.hidden = false;
  els.empty.textContent = "Could not load pets.";
});
