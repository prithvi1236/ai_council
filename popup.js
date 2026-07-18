const questionInput = document.querySelector("#question");
const startButton = document.querySelector("#start");
const statusElement = document.querySelector("#status");
const verdictElement = document.querySelector("#verdict");

function render(state) {
  const { status = "idle", error = "", verdict = "", question = "" } = state;

  if (!questionInput.value && question) {
    questionInput.value = question;
  }

  startButton.disabled = status === "working";
  statusElement.classList.toggle("error", status === "error");

  if (status === "working") {
    statusElement.textContent = "Draftor is answering...";
  } else if (status === "error") {
    statusElement.textContent = error;
  } else if (status === "complete") {
    statusElement.textContent = "Draftor answer received.";
  } else {
    statusElement.textContent = "Ready.";
  }

  verdictElement.textContent = verdict || "No verdict yet.";
}

async function loadState() {
  const state = await chrome.storage.local.get(["status", "error", "verdict", "question"]);
  render(state);
}

startButton.addEventListener("click", async () => {
  const question = questionInput.value.trim();

  if (!question) {
    render({ status: "error", error: "Enter a question before starting." });
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: "START_DRAFT",
    question
  });

  if (!response?.ok) {
    render({ status: "error", error: response?.error || "Could not start Draftor." });
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  loadState();
});

loadState();
