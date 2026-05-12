const ATLAS = {
  cellWidth: 192,
  cellHeight: 208
};

const els = {
  grid: document.getElementById("grid"),
  empty: document.getElementById("empty"),
  refresh: document.getElementById("refresh")
};

let currentPetId = new URLSearchParams(window.location.search).get("currentPetId") || "";

function sourceLabel(source) {
  return source === "downloaded" ? "Heruntergeladen" : "Gebundelt";
}

function makeCard(pet) {
  const card = document.createElement("article");
  card.className = `card${pet.id === currentPetId ? " selected" : ""}`;

  const preview = document.createElement("div");
  preview.className = "preview";

  const sprite = document.createElement("div");
  sprite.className = "sprite";
  sprite.style.backgroundImage = `url("${pet.spriteUrl}")`;
  sprite.style.backgroundPosition = "0 0";
  sprite.style.backgroundSize = `${ATLAS.cellWidth * 8 * (74 / ATLAS.cellWidth)}px ${ATLAS.cellHeight * 9 * (80 / ATLAS.cellHeight)}px`;
  preview.append(sprite);

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = pet.displayName;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${sourceLabel(pet.source)} - v${pet.version || "1.0.0"}`;

  const button = document.createElement("button");
  button.type = "button";
  button.className = pet.id === currentPetId ? "" : "primary";
  button.textContent = pet.id === currentPetId ? "Ausgewaehlt" : "Auswaehlen";
  button.disabled = pet.id === currentPetId;
  button.addEventListener("click", () => {
    window.petViewer.selectPet(pet.id);
    window.close();
  });

  card.append(preview, name, meta, button);
  return card;
}

async function render() {
  const pets = await window.petViewer.getPets();

  els.grid.replaceChildren(...pets.map(makeCard));
  els.empty.hidden = pets.length > 0;
}

els.refresh.addEventListener("click", render);
window.petViewer.onPetsChanged(render);
window.petViewer.onPetPickerCurrent((petId) => {
  currentPetId = petId || "";
  render();
});

render();
