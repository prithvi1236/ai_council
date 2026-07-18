const questionInput = document.querySelector("#question");
const startButton = document.querySelector("#start");
const draftorStatusElement = document.querySelector("#draftor-status");
const reviewerStatusElement = document.querySelector("#reviewer-status");
const verdictElement = document.querySelector("#verdict");

function render(state) {
  const {
    status = "idle",
    error = "",
    verdict = "",
    question = "",
    draftorStatus = "Ready.",
    reviewerStatus = "Waiting."
  } = state;

  if (!questionInput.value && question) {
    questionInput.value = question;
  }

  startButton.disabled = status === "working";
  draftorStatusElement.classList.toggle("error", status === "error" && draftorStatus.includes("failed"));
  reviewerStatusElement.classList.toggle("error", status === "error" && reviewerStatus.includes("failed"));

  if (status === "error" && error) {
    if (error.startsWith("Draftor:")) {
      draftorStatusElement.textContent = error;
      reviewerStatusElement.textContent = reviewerStatus;
    } else if (error.startsWith("Reviewer:")) {
      draftorStatusElement.textContent = draftorStatus;
      reviewerStatusElement.textContent = error;
    } else {
      draftorStatusElement.textContent = error;
      reviewerStatusElement.textContent = reviewerStatus;
    }
  } else {
    draftorStatusElement.textContent = draftorStatus;
    reviewerStatusElement.textContent = reviewerStatus;
  }

  verdictElement.textContent = verdict || "No verdict yet.";
}

async function loadState() {
  const state = await chrome.storage.local.get([
    "status",
    "error",
    "verdict",
    "question",
    "draftorStatus",
    "reviewerStatus"
  ]);
  render(state);
}

startButton.addEventListener("click", async () => {
  const question = questionInput.value.trim();

  if (!question) {
    render({
      status: "error",
      error: "Enter a question before starting.",
      draftorStatus: "Enter a question before starting.",
      reviewerStatus: "Waiting."
    });
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: "START_RUN",
    question
  });

  if (!response?.ok) {
    render({
      status: "error",
      error: response?.error || "Could not start Council.",
      draftorStatus: response?.error || "Could not start Council.",
      reviewerStatus: "Waiting."
    });
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  loadState();
});

loadState();
