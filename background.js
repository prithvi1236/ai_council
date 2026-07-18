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

function buildReviewPrompt(question, draftAnswer) {
  return (
    `Here is a proposed answer to '${question}': ${draftAnswer}. ` +
    "Review this critically — identify weaknesses, gaps, missing considerations, or errors."
  );
}

async function runCouncil(question) {
  const draftorTab = await getDraftorTab();

  if (!draftorTab?.id) {
    await setRunState({
      status: "error",
      error: "Could not find an open Draftor tab at chat.openai.com.",
      draftorStatus: "Draftor tab not found.",
      reviewerStatus: "Waiting.",
      verdict: ""
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
      verdict: ""
    });
    return;
  }

  await setRunState({
    status: "working",
    error: "",
    verdict: "",
    question,
    draftorStatus: "Draftor is answering...",
    reviewerStatus: "Waiting..."
  });

  let draftAnswer = "";

  try {
    const draftResponse = await sendTabMessage(
      draftorTab,
      DRAFTOR_URL_PATTERN,
      "content-chatgpt.js",
      { type: "DRAFT_QUESTION", question },
      "Draftor"
    );

    if (!draftResponse?.ok) {
      throw new Error(draftResponse?.error || "Draftor did not return an answer.");
    }

    draftAnswer = draftResponse.text;

    await setRunState({
      draftorStatus: "Draft complete.",
      reviewerStatus: "Reviewer checking the draft..."
    });

    const reviewResponse = await sendTabMessage(
      reviewerTab,
      REVIEWER_URL_PATTERN,
      "content-gemini.js",
      {
        type: "REVIEW_DRAFT",
        prompt: buildReviewPrompt(question, draftAnswer)
      },
      "Reviewer"
    );

    if (!reviewResponse?.ok) {
      throw new Error(reviewResponse?.error || "Reviewer did not return a critique.");
    }

    await setRunState({
      status: "complete",
      error: "",
      draftorStatus: "Draft complete.",
      reviewerStatus: "Review complete.",
      verdict: reviewResponse.text
    });
  } catch (error) {
    const failedStep = draftAnswer ? "Reviewer" : "Draftor";

    await setRunState({
      status: "error",
      error: `${failedStep}: ${error.message}`,
      draftorStatus: draftAnswer ? "Draft complete." : "Draftor failed.",
      reviewerStatus: draftAnswer ? "Reviewer failed." : "Waiting.",
      verdict: ""
    });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "START_RUN") {
    return;
  }

  (async () => {
    const question = message.question?.trim();

    if (!question) {
      sendResponse({ ok: false, error: "Enter a question before starting." });
      return;
    }

    const { status } = await chrome.storage.local.get("status");
    if (status === "working") {
      sendResponse({ ok: false, error: "Council is already running." });
      return;
    }

    await runCouncil(question);
    sendResponse({ ok: true });
  })();

  return true;
});
