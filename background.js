const DRAFTOR_URL_PATTERN = /^https:\/\/(chat\.openai\.com|chatgpt\.com)\//;
const REVIEWER_URL_PATTERN = /^https:\/\/gemini\.google\.com\//;

async function setRunState(updates) {
  await chrome.storage.local.set(updates);
}

async function getDraftorTab() {
  const tabs = await chrome.tabs.query({});
  return tabs.find((tab) => DRAFTOR_URL_PATTERN.test(tab.url || ""));
}

async function getReviewerTab() {
  const tabs = await chrome.tabs.query({});
  return tabs.find((tab) => REVIEWER_URL_PATTERN.test(tab.url || ""));
}

async function sendTabMessage(tab, urlPattern, scriptFile, message, roleName) {
  if (!tab?.id) {
    throw new Error(`Could not find an open ${roleName} tab.`);
  }

  if (!urlPattern.test(tab.url || "")) {
    throw new Error(
      `${roleName} tab URL does not match the expected domain — try reloading it.`
    );
  }

  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (firstError) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [scriptFile]
      });
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (secondError) {
      throw new Error(`Could not reach ${roleName} tab — try reloading it.`);
    }
  }
}

function normalizeRounds(rounds) {
  const parsed = Number.parseInt(String(rounds), 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

const CHANGES_SUFFIX =
  " At the end, output exactly one line: CHANGES: N — where N is the number of substantive changes/issues (ignore style nitpicks, count only issues with claims, conclusions, or reasoning).";

function buildReviewPrompt(question, draftAnswer) {
  return (
    `Here is a proposed answer to '${question}': ${draftAnswer}. ` +
    "Review this critically — identify weaknesses, gaps, missing considerations, or errors." +
    CHANGES_SUFFIX
  );
}

function buildRefinePrompt(previousReview) {
  return `Refine your answer based on this review: ${previousReview}.${CHANGES_SUFFIX}`;
}

function buildVerdictPrompt(question) {
  return (
    `Given the full review process above for the question '${question}', ` +
    "give a single final verdict: your best, most refined answer to the original question, clearly stated."
  );
}

function parseChangesClaimed(text, speaker) {
  const match = text.match(/CHANGES:\s*(\d+)/i);

  if (!match) {
    console.warn(`Council: CHANGES line not found in ${speaker} response`);
    return { text: text.trim(), changesClaimed: 0 };
  }

  const changesClaimed = Number.parseInt(match[1], 10);
  const cleaned = text.replace(/[\n\r\s]*CHANGES:\s*\d+\s*$/i, "").trim();

  return {
    text: cleaned,
    changesClaimed: Number.isFinite(changesClaimed) ? changesClaimed : 0
  };
}

async function askDraftor(draftorTab, question) {
  const response = await sendTabMessage(
    draftorTab,
    DRAFTOR_URL_PATTERN,
    "content-chatgpt.js",
    { type: "DRAFT_QUESTION", question },
    "Draftor"
  );

  if (!response?.ok) {
    throw new Error(response?.error || "Draftor did not return an answer.");
  }

  return response.text;
}

async function sendReviewerPrompt(reviewerTab, prompt) {
  const response = await sendTabMessage(
    reviewerTab,
    REVIEWER_URL_PATTERN,
    "content-gemini.js",
    { type: "REVIEW_DRAFT", prompt },
    "Reviewer"
  );

  if (!response?.ok) {
    throw new Error(response?.error || "Reviewer did not return a response.");
  }

  return response.text;
}

async function askReviewer(reviewerTab, question, draftAnswer) {
  return sendReviewerPrompt(reviewerTab, buildReviewPrompt(question, draftAnswer));
}

async function runCouncil(question, roundsInput) {
  const rounds = normalizeRounds(roundsInput);
  const draftorTab = await getDraftorTab();

  if (!draftorTab?.id) {
    await setRunState({
      status: "error",
      error: "Could not find an open Draftor tab at chat.openai.com.",
      draftorStatus: "Draftor tab not found.",
      reviewerStatus: "Waiting.",
      verdict: "",
      transcript: []
    });
    return;
  }

  const reviewerTab = await getReviewerTab();

  if (!reviewerTab?.id) {
    await setRunState({
      status: "error",
      error: "Could not find an open Reviewer tab at gemini.google.com.",
      draftorStatus: "Ready.",
      reviewerStatus: "Reviewer tab not found.",
      verdict: "",
      transcript: []
    });
    return;
  }

  await setRunState({
    status: "working",
    error: "",
    verdict: "",
    question,
    rounds,
    transcript: [],
    draftorStatus: `Draftor is answering (round 1/${rounds})...`,
    reviewerStatus: "Waiting..."
  });

  const transcript = [];
  let lastReview = "";
  let lastDraft = "";
  let failedStep = "Draftor";

  try {
    for (let round = 1; round <= rounds; round += 1) {
      failedStep = "Draftor";

      await setRunState({
        draftorStatus:
          round === 1
            ? `Draftor is answering (round ${round}/${rounds})...`
            : `Draftor is refining (round ${round}/${rounds})...`,
        reviewerStatus: round === 1 ? "Waiting..." : "Waiting for revision..."
      });

      const draftPrompt =
        round === 1 ? question : buildRefinePrompt(lastReview);

      lastDraft = await askDraftor(draftorTab, draftPrompt);

      if (round === 1) {
        transcript.push({
          speaker: "Draftor",
          text: lastDraft,
          round,
          changesClaimed: 0
        });
      } else {
        const parsedDraft = parseChangesClaimed(lastDraft, "Draftor");
        lastDraft = parsedDraft.text;
        transcript.push({
          speaker: "Draftor",
          text: parsedDraft.text,
          round,
          changesClaimed: parsedDraft.changesClaimed
        });
      }

      await setRunState({ transcript: [...transcript] });

      failedStep = "Reviewer";

      await setRunState({
        draftorStatus: `Round ${round} draft complete.`,
        reviewerStatus: `Reviewer checking round ${round}/${rounds}...`
      });

      lastReview = await askReviewer(reviewerTab, question, lastDraft);
      const parsedReview = parseChangesClaimed(lastReview, "Reviewer");
      lastReview = parsedReview.text;
      transcript.push({
        speaker: "Reviewer",
        text: parsedReview.text,
        round,
        changesClaimed: parsedReview.changesClaimed
      });
      await setRunState({ transcript: [...transcript] });
    }

    failedStep = "Reviewer";

    await setRunState({
      draftorStatus: "Review rounds complete.",
      reviewerStatus: "Reviewer is writing final verdict..."
    });

    const verdictText = await sendReviewerPrompt(
      reviewerTab,
      buildVerdictPrompt(question)
    );
    transcript.push({
      speaker: "Reviewer",
      text: verdictText,
      round: "verdict",
      changesClaimed: 0
    });

    await setRunState({
      status: "complete",
      error: "",
      draftorStatus: "Review rounds complete.",
      reviewerStatus: "Final verdict complete.",
      verdict: verdictText,
      transcript: [...transcript]
    });
  } catch (error) {
    await setRunState({
      status: "error",
      error: `${failedStep}: ${error.message}`,
      draftorStatus: failedStep === "Draftor" ? "Draftor failed." : "Review rounds complete.",
      reviewerStatus: failedStep === "Reviewer" ? "Reviewer failed." : "Waiting.",
      verdict: "",
      transcript: [...transcript]
    });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "START_RUN") {
    return;
  }

  (async () => {
    const question = message.question?.trim();
    const rounds = normalizeRounds(message.rounds);

    if (!question) {
      sendResponse({ ok: false, error: "Enter a question before starting." });
      return;
    }

    const { status } = await chrome.storage.local.get("status");
    if (status === "working") {
      sendResponse({ ok: false, error: "Council is already running." });
      return;
    }

    await runCouncil(question, rounds);
    sendResponse({ ok: true });
  })();

  return true;
});
