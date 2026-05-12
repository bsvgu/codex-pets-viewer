const els = {
  browserPanel: document.getElementById("browserPanel"),
  appPanel: document.getElementById("appPanel"),
  browserUrl: document.getElementById("browserUrl"),
  focusBrowserFirst: document.getElementById("focusBrowserFirst"),
  appPath: document.getElementById("appPath"),
  chooseApp: document.getElementById("chooseApp"),
  testAction: document.getElementById("testAction"),
  saveAction: document.getElementById("saveAction")
};

function selectedActionType() {
  return document.querySelector('input[name="actionType"]:checked')?.value || "none";
}

function setActionType(type) {
  const input = document.querySelector(`input[name="actionType"][value="${type}"]`);

  if (input) {
    input.checked = true;
  }

  refreshPanels();
}

function refreshPanels() {
  const type = selectedActionType();

  els.browserPanel.hidden = type !== "browser";
  els.appPanel.hidden = type !== "app";
}

function readForm() {
  return {
    actionType: selectedActionType(),
    appPath: els.appPath.value.trim(),
    browserUrl: els.browserUrl.value.trim() || "https://www.google.com",
    focusBrowserFirst: els.focusBrowserFirst.checked
  };
}

async function save() {
  await window.petViewer.saveActionConfig(readForm());
}

async function boot() {
  const config = await window.petViewer.getActionConfig();

  setActionType(config.actionType || "none");
  els.browserUrl.value = config.browserUrl || "https://www.google.com";
  els.focusBrowserFirst.checked = config.focusBrowserFirst !== false;
  els.appPath.value = config.appPath || "";
}

for (const input of document.querySelectorAll('input[name="actionType"]')) {
  input.addEventListener("change", refreshPanels);
}

els.chooseApp.addEventListener("click", async () => {
  const appPath = await window.petViewer.chooseApplication();

  if (appPath) {
    els.appPath.value = appPath;
    setActionType("app");
  }
});

els.saveAction.addEventListener("click", async () => {
  await save();
  window.close();
});

els.testAction.addEventListener("click", async () => {
  await save();
  await window.petViewer.runAction();
});

boot();
