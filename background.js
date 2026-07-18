const DRAFTOR_URL_PATTERN = /^https:\/\/(chat\.openai\.com|chatgpt\.com)\//;

async function setRunState(updates) {
  await chrome.storage.local.set(updates);
}

async function getDraftorTab() {
  const tabs = await chrome.tabs.query({});
  return tabs.find((tab) => DRAFTOR_URL_PATTERN.test(tab.url || ""));
}

async function runDraft(question) {
  const draftorTab = await getDraftorTab();

  if (!draftorTab?.id) {
    await setRunState({
      status: "error",
      error: "Could not find an open Draftor tab at chat.openai.com.",
      verdict: ""
    });
    return;
  }

  await setRunState({
    status: "working",
    error: "",
    verdict: "",
    question
  });

  try {
    const response = await chrome.tabs.sendMessage(draftorTab.id, {
      type: "DRAFT_QUESTION",
      question
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Draftor did not return an answer.");
    }

    await setRunState({
      status: "complete",
      error: "",
      verdict: response.text
    });
  } catch (error) {
    await setRunState({
      status: "error",
      error: error.message || "Could not reach the Draftor tab.",
      verdict: ""
    });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "START_DRAFT") {
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
      sendResponse({ ok: false, error: "Draftor is already working." });
      return;
    }

    await runDraft(question);
    sendResponse({ ok: true });
  })();

  return true;
});
