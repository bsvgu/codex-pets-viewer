const ATLAS = {
  cellWidth: 192,
  cellHeight: 208,
  cols: 8,
  rows: 9
};

const PREVIEW_SCALE = 0.34;
const PLAY_PREVIEW_SCALE = 0.45;

const DEFAULT_ANIMATIONS = [
  { id: "idle", row: 0, frames: 6, durations: [280, 110, 110, 140, 140, 320], loops: 3 },
  { id: "waiting", row: 6, frames: 6, durations: [150, 150, 150, 150, 150, 260], loops: 2 },
  { id: "waving", row: 3, frames: 4, durations: [140, 140, 140, 280], loops: 2 },
  { id: "jumping", row: 4, frames: 5, durations: [140, 140, 140, 140, 280], loops: 2 },
  { id: "review", row: 8, frames: 6, durations: [150, 150, 150, 150, 150, 280], loops: 2 },
  { id: "running", row: 7, frames: 6, durations: [120, 120, 120, 120, 120, 220], loops: 2 },
  { id: "running-right", row: 1, frames: 8, durations: [120, 120, 120, 120, 120, 120, 120, 220], loops: 1 },
  { id: "running-left", row: 2, frames: 8, durations: [120, 120, 120, 120, 120, 120, 120, 220], loops: 1 },
  { id: "failed", row: 5, frames: 8, durations: [140, 140, 140, 140, 140, 140, 140, 240], loops: 1 }
];

const els = {
  petList: document.getElementById("petList"),
  petName: document.getElementById("petName"),
  petMeta: document.getElementById("petMeta"),
  version: document.getElementById("version"),
  save: document.getElementById("save"),
  openFolder: document.getElementById("openFolder"),
  sheet: document.getElementById("sheet"),
  animationSelect: document.getElementById("animationSelect"),
  loops: document.getElementById("loops"),
  duration: document.getElementById("duration"),
  applyDuration: document.getElementById("applyDuration"),
  reset: document.getElementById("reset"),
  clear: document.getElementById("clear"),
  previewSprite: document.getElementById("previewSprite"),
  previewMeta: document.getElementById("previewMeta"),
  playPreview: document.getElementById("playPreview"),
  sequence: document.getElementById("sequence"),
  status: document.getElementById("status")
};

let pets = [];
let selectedPet = null;
let draftAnimations = [];
let selectedAnimationId = DEFAULT_ANIMATIONS[0].id;
let previewTimer = null;
let previewFrameIndex = 0;
let previewPlaying = false;

function bumpPatch(version = "1.0.0") {
  const parts = String(version).split(".").map((part) => Number.parseInt(part, 10) || 0);
  while (parts.length < 3) {
    parts.push(0);
  }
  parts[2] += 1;
  return parts.slice(0, 3).join(".");
}

function clampCell(value, max) {
  return Math.min(max, Math.max(0, Number.parseInt(value, 10) || 0));
}

function clampDuration(value) {
  return Math.min(3000, Math.max(40, Number.parseInt(value, 10) || 140));
}

function defaultSequence(animation) {
  const frameCount = Array.isArray(animation.frames) ? animation.frames.length : Number.parseInt(animation.frames, 10) || 0;
  const frames = Array.isArray(animation.frames)
    ? animation.frames
    : Array.from({ length: frameCount }, (_value, index) => index);
  const durations = Array.isArray(animation.durations) ? animation.durations : [];

  return frames.map((col, index) => ({
    row: clampCell(animation.row, ATLAS.rows - 1),
    col: clampCell(col, ATLAS.cols - 1),
    duration: clampDuration(durations[index] || durations[durations.length - 1] || 140)
  }));
}

function normalizeAnimation(animation, fallback = {}) {
  return {
    id: animation.id || fallback.id,
    loops: Math.min(99, Math.max(1, Number.parseInt(animation.loops ?? fallback.loops ?? 1, 10) || 1)),
    sequence: Array.isArray(animation.sequence) && animation.sequence.length
      ? animation.sequence.map((cell) => ({
          row: clampCell(cell.row, ATLAS.rows - 1),
          col: clampCell(cell.col ?? cell.frame, ATLAS.cols - 1),
          duration: clampDuration(cell.duration)
        }))
      : defaultSequence(fallback)
  };
}

function buildDraftAnimations(pet) {
  const overrides = new Map((pet.animations || []).map((animation) => [animation.id, animation]));
  const draft = DEFAULT_ANIMATIONS.map((fallback) => normalizeAnimation(overrides.get(fallback.id) || {}, fallback));
  const known = new Set(draft.map((animation) => animation.id));

  for (const animation of pet.animations || []) {
    if (animation.id && !known.has(animation.id)) {
      draft.push(normalizeAnimation(animation));
    }
  }

  return draft;
}

function currentAnimation() {
  return draftAnimations.find((animation) => animation.id === selectedAnimationId) || draftAnimations[0];
}

function setSpritePreviewStyle(element, row, col, scale = PREVIEW_SCALE) {
  element.style.backgroundImage = `url("${selectedPet.spriteUrl}")`;
  element.style.backgroundSize = `${ATLAS.cellWidth * ATLAS.cols * scale}px ${ATLAS.cellHeight * ATLAS.rows * scale}px`;
  element.style.backgroundPosition = `${-col * ATLAS.cellWidth * scale}px ${-row * ATLAS.cellHeight * scale}px`;
}

function stopPreview() {
  if (previewTimer) {
    clearTimeout(previewTimer);
    previewTimer = null;
  }

  previewPlaying = false;
  els.playPreview.textContent = "Play";
}

function updatePreviewFrame() {
  const animation = currentAnimation();
  const sequence = animation?.sequence || [];
  const frame = sequence[previewFrameIndex] || sequence[0];

  if (!frame || !selectedPet) {
    els.previewSprite.style.backgroundImage = "";
    els.previewMeta.textContent = "Keine Frames";
    return;
  }

  setSpritePreviewStyle(els.previewSprite, frame.row, frame.col, PLAY_PREVIEW_SCALE);
  els.previewMeta.textContent = `${animation.id}: ${sequence.length} Frame(s), ${animation.loops} Loop(s)`;
}

function schedulePreviewFrame() {
  const animation = currentAnimation();
  const sequence = animation?.sequence || [];

  if (!previewPlaying || !sequence.length) {
    stopPreview();
    updatePreviewFrame();
    return;
  }

  const frame = sequence[previewFrameIndex] || sequence[0];
  previewTimer = window.setTimeout(() => {
    previewFrameIndex = (previewFrameIndex + 1) % sequence.length;
    updatePreviewFrame();
    schedulePreviewFrame();
  }, clampDuration(frame.duration));
}

function togglePreview() {
  if (previewPlaying) {
    stopPreview();
    return;
  }

  previewFrameIndex = 0;
  previewPlaying = true;
  els.playPreview.textContent = "Stop";
  updatePreviewFrame();
  schedulePreviewFrame();
}

function renderPetList() {
  els.petList.replaceChildren(...pets.map((pet) => {
    const button = document.createElement("button");
    const name = document.createElement("strong");
    const version = document.createElement("span");

    button.type = "button";
    button.className = `petButton${selectedPet?.id === pet.id ? " selected" : ""}`;
    name.textContent = pet.displayName;
    version.textContent = `v${pet.version || "1.0.0"}`;
    button.append(name, version);
    button.addEventListener("click", () => selectPet(pet.id));
    return button;
  }));
}

function renderAnimationSelect() {
  els.animationSelect.replaceChildren(...draftAnimations.map((animation) => {
    const option = document.createElement("option");
    option.value = animation.id;
    option.textContent = animation.id;
    return option;
  }));
  els.animationSelect.value = selectedAnimationId;
}

function renderSheet() {
  const cells = [];

  for (let row = 0; row < ATLAS.rows; row += 1) {
    for (let col = 0; col < ATLAS.cols; col += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cell";
      button.title = `row ${row}, col ${col}`;
      setSpritePreviewStyle(button, row, col);
      button.innerHTML = `<span>${row}:${col}</span>`;
      button.addEventListener("click", () => {
        const animation = currentAnimation();
        if (!animation) {
          return;
        }

        animation.sequence.push({
          row,
          col,
          duration: clampDuration(els.duration.value)
        });
        renderSequence();
      });
      cells.push(button);
    }
  }

  els.sheet.replaceChildren(...cells);
}

function renderSequence() {
  const animation = currentAnimation();

  if (!animation) {
    els.sequence.replaceChildren();
    updatePreviewFrame();
    return;
  }

  previewFrameIndex = Math.min(previewFrameIndex, Math.max(0, animation.sequence.length - 1));
  els.loops.value = animation.loops;
  els.sequence.replaceChildren(...animation.sequence.map((cell, index) => {
    const item = document.createElement("div");
    item.className = "seqItem";

    const preview = document.createElement("div");
    preview.className = "seqItemPreview";
    setSpritePreviewStyle(preview, cell.row, cell.col);

    const label = document.createElement("div");
    const title = document.createElement("strong");
    const meta = document.createElement("p");
    title.textContent = `#${index + 1}`;
    meta.textContent = `row ${cell.row}, col ${cell.col}`;
    label.append(title, meta);

    const duration = document.createElement("input");
    duration.type = "number";
    duration.min = "40";
    duration.max = "3000";
    duration.step = "10";
    duration.value = cell.duration;
    duration.addEventListener("input", () => {
      cell.duration = clampDuration(duration.value);
      updatePreviewFrame();
    });

    const up = document.createElement("button");
    up.type = "button";
    up.className = "miniButton";
    up.textContent = "<";
    up.disabled = index === 0;
    up.addEventListener("click", () => {
      const previous = animation.sequence[index - 1];
      animation.sequence[index - 1] = cell;
      animation.sequence[index] = previous;
      renderSequence();
    });

    const down = document.createElement("button");
    down.type = "button";
    down.className = "miniButton";
    down.textContent = ">";
    down.disabled = index === animation.sequence.length - 1;
    down.addEventListener("click", () => {
      const next = animation.sequence[index + 1];
      animation.sequence[index + 1] = cell;
      animation.sequence[index] = next;
      renderSequence();
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "miniButton";
    remove.textContent = "X";
    remove.addEventListener("click", () => {
      animation.sequence.splice(index, 1);
      renderSequence();
    });

    item.append(preview, label, duration, up, down, remove);
    return item;
  }));
  updatePreviewFrame();
}

function renderSelectedPet() {
  if (!selectedPet) {
    els.petName.textContent = "Kein Pet";
    els.petMeta.textContent = "";
    els.sheet.replaceChildren();
    els.sequence.replaceChildren();
    els.animationSelect.replaceChildren();
    updatePreviewFrame();
    return;
  }

  els.petName.textContent = selectedPet.displayName;
  els.petMeta.textContent = `${selectedPet.id} - ${selectedPet.description || "keine Beschreibung"}`;
  els.version.value = bumpPatch(selectedPet.version || "1.0.0");
  els.duration.value = els.duration.value || "140";
  renderPetList();
  renderAnimationSelect();
  renderSheet();
  renderSequence();
}

function selectPet(petId) {
  stopPreview();
  selectedPet = pets.find((pet) => pet.id === petId) || pets[0];
  if (!selectedPet) {
    draftAnimations = [];
    renderSelectedPet();
    return;
  }

  draftAnimations = buildDraftAnimations(selectedPet);
  selectedAnimationId = draftAnimations[0]?.id || DEFAULT_ANIMATIONS[0].id;
  renderSelectedPet();
}

async function boot() {
  pets = await window.animationEditor.listPets();
  selectPet(pets[0]?.id);
}

els.animationSelect.addEventListener("change", () => {
  stopPreview();
  selectedAnimationId = els.animationSelect.value;
  renderSequence();
});

els.loops.addEventListener("input", () => {
  const animation = currentAnimation();
  if (!animation) {
    return;
  }

  animation.loops = Math.min(99, Math.max(1, Number.parseInt(els.loops.value, 10) || 1));
  updatePreviewFrame();
});

els.applyDuration.addEventListener("click", () => {
  const animation = currentAnimation();
  if (!animation) {
    return;
  }

  const duration = clampDuration(els.duration.value);
  animation.sequence.forEach((cell) => {
    cell.duration = duration;
  });
  renderSequence();
});

els.reset.addEventListener("click", () => {
  stopPreview();
  const fallback = DEFAULT_ANIMATIONS.find((animation) => animation.id === selectedAnimationId);
  const index = draftAnimations.findIndex((animation) => animation.id === selectedAnimationId);
  if (index < 0 || !fallback) {
    return;
  }

  draftAnimations[index] = normalizeAnimation({}, fallback);
  renderSequence();
});

els.clear.addEventListener("click", () => {
  const animation = currentAnimation();
  if (!animation) {
    return;
  }

  stopPreview();
  animation.sequence = [];
  renderSequence();
});

els.save.addEventListener("click", async () => {
  if (!selectedPet) {
    return;
  }

  try {
    const result = await window.animationEditor.savePet({
      id: selectedPet.id,
      version: els.version.value.trim() || bumpPatch(selectedPet.version || "1.0.0"),
      animations: draftAnimations
    });

    els.status.textContent = result.ok ? `Gespeichert: ${selectedPet.displayName} v${result.version}` : "Speichern fehlgeschlagen.";
    pets = await window.animationEditor.listPets();
    selectedPet = pets.find((pet) => pet.id === result.id) || selectedPet;
    renderSelectedPet();
  } catch (error) {
    els.status.textContent = error.message;
  }
});

els.playPreview.addEventListener("click", togglePreview);
els.openFolder.addEventListener("click", () => window.animationEditor.openPetsFolder());

boot().catch((error) => {
  els.status.textContent = error.message;
});
