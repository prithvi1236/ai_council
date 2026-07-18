const questionInput = document.querySelector("#question");
const roundsInput = document.querySelector("#rounds");
const startButton = document.querySelector("#start");
const draftorStatusElement = document.querySelector("#draftor-status");
const reviewerStatusElement = document.querySelector("#reviewer-status");
const verdictElement = document.querySelector("#verdict");
const transcriptElement = document.querySelector("#transcript");

function formatTranscriptLabel(entry) {
  if (entry.round === "verdict") {
    return `${entry.speaker} — Final verdict`;
  }

  return `${entry.speaker} — Round ${entry.round}`;
}

function renderTranscript(transcript) {
  transcriptElement.textContent = "";

  if (!Array.isArray(transcript) || transcript.length === 0) {
    transcriptElement.textContent = "No review history yet.";
    return;
  }

  for (const entry of transcript) {
    const wrapper = document.createElement("article");
    wrapper.className = "transcript-entry";

    const heading = document.createElement("p");
    heading.className = "transcript-heading";
    heading.textContent = formatTranscriptLabel(entry);

    const body = document.createElement("p");
    body.className = "transcript-text";
    body.textContent = entry.text || "";

    wrapper.append(heading, body);
    transcriptElement.append(wrapper);
  }
}

function render(state) {
  const {
    status = "idle",
    error = "",
    verdict = "",
    question = "",
    rounds = 1,
    transcript = [],
    draftorStatus = "Ready.",
    reviewerStatus = "Waiting."
  } = state;

  if (!questionInput.value && question) {
    questionInput.value = question;
  }

  if (document.activeElement !== roundsInput) {
    roundsInput.value = String(rounds);
  }

  startButton.disabled = status === "working";
  roundsInput.disabled = status === "working";
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
  renderTranscript(transcript);
}

async function loadState() {
  const state = await chrome.storage.local.get([
    "status",
    "error",
    "verdict",
    "question",
    "rounds",
    "transcript",
    "draftorStatus",
    "reviewerStatus"
  ]);
  render(state);
}

startButton.addEventListener("click", async () => {
  const question = questionInput.value.trim();
  const rounds = Number.parseInt(roundsInput.value, 10) || 1;

  if (!question) {
    render({
      status: "error",
      error: "Enter a question before starting.",
      draftorStatus: "Enter a question before starting.",
      reviewerStatus: "Waiting."
    });
    return;
  }

  if (rounds < 1) {
    render({
      status: "error",
      error: "Review rounds must be at least 1.",
      draftorStatus: "Review rounds must be at least 1.",
      reviewerStatus: "Waiting."
    });
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: "START_RUN",
    question,
    rounds
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
