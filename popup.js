const questionInput = document.querySelector("#question");
const roundsInput = document.querySelector("#rounds");
const maxWordsInput = document.querySelector("#max-words");
const startButton = document.querySelector("#start");
const draftorStatusElement = document.querySelector("#draftor-status");
const reviewerStatusElement = document.querySelector("#reviewer-status");
const verdictHeadingElement = document.querySelector("#verdict-heading");
const verdictElement = document.querySelector("#verdict");
const draftorScoreElement = document.querySelector("#draftor-score");
const reviewerScoreElement = document.querySelector("#reviewer-score");
const resultsSection = document.querySelector("#results");
const scoreboardSection = document.querySelector("#scoreboard");
const setupErrorElement = document.querySelector("#setup-error");
const transcriptElement = document.querySelector("#transcript");

function shouldShowResults(status, transcript) {
  if (status === "working" || status === "complete") {
    return true;
  }

  if (Array.isArray(transcript) && transcript.length > 0) {
    return true;
  }

  return status === "error" && Array.isArray(transcript) && transcript.length > 0;
}

function showSetupError(message) {
  if (!message) {
    setupErrorElement.hidden = true;
    setupErrorElement.textContent = "";
    return;
  }

  setupErrorElement.hidden = false;
  setupErrorElement.textContent = message;
}

function shouldShowScoreboard(status, transcript) {
  if (status === "working" || status === "complete") {
    return true;
  }

  return Array.isArray(transcript) && transcript.some((entry) => entry.round !== "verdict");
}

function computeScoreboard(transcript) {
  return (transcript || []).reduce(
    (totals, entry) => {
      if (entry.round === "verdict") {
        return totals;
      }

      if (entry.speaker === "Draftor") {
        totals.draftor += entry.changesClaimed || 0;
      } else if (entry.speaker === "Reviewer") {
        totals.reviewer += entry.changesClaimed || 0;
      }

      return totals;
    },
    { draftor: 0, reviewer: 0 }
  );
}

function renderScoreboard(transcript) {
  const totals = computeScoreboard(transcript);
  draftorScoreElement.textContent = String(totals.draftor);
  reviewerScoreElement.textContent = String(totals.reviewer);
}

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

function renderVerdict(verdict, verdictWordCount, maxWords, status) {
  if (status === "complete" && verdict) {
    verdictHeadingElement.textContent = `Verdict (${verdictWordCount}/${maxWords} words)`;
    verdictElement.textContent = verdict;
    return;
  }

  verdictHeadingElement.textContent = "Verdict";
  verdictElement.textContent = verdict || "No verdict yet.";
}

function render(state) {
  const {
    status = "idle",
    error = "",
    verdict = "",
    question = "",
    rounds = 1,
    maxWords = 100,
    verdictWordCount = 0,
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

  if (document.activeElement !== maxWordsInput) {
    maxWordsInput.value = String(maxWords);
  }

  startButton.disabled = status === "working";
  roundsInput.disabled = status === "working";
  maxWordsInput.disabled = status === "working";
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

  renderVerdict(verdict, verdictWordCount, maxWords, status);
  const showResults = shouldShowResults(status, transcript);
  resultsSection.hidden = !showResults;
  scoreboardSection.hidden = !shouldShowScoreboard(status, transcript);

  if (status === "error" && error && !showResults) {
    showSetupError(error);
  } else {
    showSetupError("");
  }

  renderScoreboard(transcript);
  renderTranscript(transcript);
}

async function loadState() {
  const state = await chrome.storage.local.get([
    "status",
    "error",
    "verdict",
    "verdictWordCount",
    "maxWords",
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
  const maxWords = Number.parseInt(maxWordsInput.value, 10) || 100;

  if (!question) {
    showSetupError("Enter a question before starting.");
    return;
  }

  if (rounds < 1) {
    showSetupError("Review rounds must be at least 1.");
    return;
  }

  if (maxWords < 1) {
    showSetupError("Max verdict words must be at least 1.");
    return;
  }

  showSetupError("");

  const response = await chrome.runtime.sendMessage({
    type: "START_RUN",
    question,
    rounds,
    maxWords
  });

  if (!response?.ok) {
    showSetupError(response?.error || "Could not start AI Council.");
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  loadState();
});

loadState();
