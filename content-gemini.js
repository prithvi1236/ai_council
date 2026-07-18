const SEND_BUTTON_SELECTORS = [
  'button[aria-label="Send message"]',
  'button[aria-label*="Send"]',
  'button[aria-label*="send"]',
  'button[data-test-id="send-button"]',
  'button.send-button',
  'button[data-tooltip*="Send"]',
  '[data-send-button]'
];

function getConversationRoot() {
  return (
    document.querySelector("#chat-history") ||
    document.querySelector("infinite-scroller") ||
    document.querySelector("main") ||
    document.querySelector("chat-app") ||
    document.body
  );
}

function getComposerRoot() {
  return (
    document.querySelector("input-area") ||
    document.querySelector("rich-textarea")?.closest("form") ||
    document.querySelector(".input-area") ||
    document.querySelector("footer") ||
    document.body
  );
}

function getModelResponses() {
  return Array.from(getConversationRoot().querySelectorAll("model-response"));
}

function countModelResponses() {
  return getModelResponses().length;
}

function findProseInResponse(responseElement) {
  if (!(responseElement instanceof HTMLElement)) {
    return null;
  }

  return (
    responseElement.querySelector(
      "message-content.model-response-text div.markdown.markdown-main-panel"
    ) ||
    responseElement.querySelector("message-content .markdown") ||
    responseElement.querySelector("div.markdown.markdown-main-panel") ||
    responseElement.querySelector("div.markdown") ||
    responseElement.querySelector(".model-response-text .markdown") ||
    responseElement.querySelector("message-content.model-response-text")
  );
}

function extractProseText(element) {
  if (!(element instanceof HTMLElement)) {
    return "";
  }

  const text = (element.innerText || element.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/^Gemini said\s*/i, "")
    .trim();

  return text;
}

function isMeaningfulResponse(text) {
  if (!text) {
    return false;
  }

  return text.replace(/^Gemini said\s*/i, "").trim().length > 0;
}

function getLatestResponseText(beforeCount) {
  const responses = getModelResponses();

  if (responses.length <= beforeCount) {
    return "";
  }

  const prose = findProseInResponse(responses[responses.length - 1]);

  if (!(prose instanceof HTMLElement)) {
    return "";
  }

  return extractProseText(prose);
}

function isComposerGenerating() {
  const composer = getComposerRoot();
  const stopButton =
    composer.querySelector('button[aria-label="Stop response"]') ||
    composer.querySelector('button[aria-label*="Stop generating"]') ||
    composer.querySelector('button[aria-label*="Stop response"]') ||
    composer.querySelector('[data-test-id="stop-button"]');

  return stopButton instanceof HTMLButtonElement && stopButton.offsetParent !== null;
}

function isResponseStreaming(responseElement) {
  if (!(responseElement instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    responseElement.querySelector(
      '.streaming-animation, .result-streaming, .thinking-animation, [data-streaming="true"]'
    )
  );
}

function isGeminiStreaming(beforeCount) {
  if (isComposerGenerating()) {
    return true;
  }

  const responses = getModelResponses();

  if (responses.length <= beforeCount) {
    return false;
  }

  return isResponseStreaming(responses[responses.length - 1]);
}

function getPromptInput() {
  const input =
    document.querySelector('rich-textarea [contenteditable="true"]') ||
    document.querySelector("div.ql-editor[contenteditable='true']") ||
    document.querySelector('div[contenteditable="true"][role="textbox"]');

  if (!(input instanceof HTMLElement) || input.contentEditable !== "true") {
    throw new Error(
      "Couldn't find Gemini's input box (rich-textarea [contenteditable] / div.ql-editor)."
    );
  }

  return input;
}

function getInputText(input) {
  return (input.innerText || input.textContent || "").trim();
}

function findSendButton() {
  const scopes = [getComposerRoot(), document.body];

  for (const scope of scopes) {
    for (const selector of SEND_BUTTON_SELECTORS) {
      for (const candidate of scope.querySelectorAll(selector)) {
        if (
          candidate instanceof HTMLButtonElement &&
          !candidate.disabled &&
          candidate.offsetParent !== null
        ) {
          return candidate;
        }
      }
    }
  }

  return null;
}

function waitForGeminiIdle(timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const check = () => {
      if (!isComposerGenerating()) {
        resolve();
        return;
      }

      if (Date.now() - start > timeoutMs) {
        reject(new Error("Timeout waiting for Reviewer to finish its current response."));
        return;
      }

      setTimeout(check, 300);
    };

    check();
  });
}

function waitForSendButton(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const check = () => {
      const button = findSendButton();

      if (button) {
        resolve(button);
        return;
      }

      if (Date.now() - start > timeoutMs) {
        reject(
          new Error(
            "Couldn't find an enabled Gemini send button — try reloading the Reviewer tab."
          )
        );
        return;
      }

      setTimeout(check, 150);
    };

    check();
  });
}

function waitForInputPopulated(input, minLength, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const check = () => {
      if (getInputText(input).length >= minLength) {
        resolve();
        return;
      }

      if (Date.now() - start > timeoutMs) {
        reject(new Error("Couldn't populate Gemini's input with the review prompt."));
        return;
      }

      setTimeout(check, 100);
    };

    check();
  });
}

function setInputText(input, text) {
  input.focus();

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(input);
  selection?.removeAllRanges();
  selection?.addRange(range);

  const inserted = document.execCommand("insertText", false, text);

  if (!inserted || getInputText(input).length < Math.min(text.trim().length, 20)) {
    input.textContent = text;
  }

  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function injectPrompt(text) {
  await waitForGeminiIdle();

  const input = getPromptInput();
  setInputText(input, text);

  const expectedLength = Math.min(text.trim().length, 40);
  await waitForInputPopulated(input, expectedLength > 0 ? expectedLength : 1);
  await new Promise((resolve) => setTimeout(resolve, 400));

  const sendButton = await waitForSendButton();
  sendButton.click();
}

function waitForResponseComplete(
  beforeCount,
  { stableMs = 3500, timeoutMs = 120000 } = {}
) {
  return new Promise((resolve, reject) => {
    const root = getConversationRoot();
    let debounceTimer = null;
    let lastSeenText = "";
    let lastChangeAt = Date.now();

    const finish = () => {
      const latestText = getLatestResponseText(beforeCount);

      if (!isMeaningfulResponse(latestText)) {
        debounceTimer = setTimeout(finish, 400);
        return;
      }

      if (latestText !== lastSeenText) {
        lastSeenText = latestText;
        lastChangeAt = Date.now();
        debounceTimer = setTimeout(finish, 400);
        return;
      }

      const stableFor = Date.now() - lastChangeAt;

      if (stableFor >= stableMs) {
        observer.disconnect();
        clearTimeout(timeoutTimer);
        resolve(latestText);
        return;
      }

      if (isGeminiStreaming(beforeCount)) {
        debounceTimer = setTimeout(finish, 400);
        return;
      }

      debounceTimer = setTimeout(finish, stableMs - stableFor + 100);
    };

    const timeoutTimer = setTimeout(() => {
      observer.disconnect();
      clearTimeout(debounceTimer);
      const latestText = getLatestResponseText(beforeCount);

      if (isMeaningfulResponse(latestText)) {
        resolve(latestText);
        return;
      }

      if (isGeminiStreaming(beforeCount)) {
        reject(new Error("Timeout waiting for Reviewer's response to finish streaming."));
        return;
      }

      reject(new Error("Timeout waiting for Reviewer's response to stabilize."));
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(finish, 400);
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true
    });
    debounceTimer = setTimeout(finish, 400);
  });
}

async function askReviewer(prompt) {
  try {
    const beforeCount = countModelResponses();
    await injectPrompt(prompt);
    const text = await waitForResponseComplete(beforeCount);

    if (!isMeaningfulResponse(text)) {
      throw new Error("Reviewer returned an empty response.");
    }

    return text;
  } catch (error) {
    throw new Error(error.message || "Could not get a response from Reviewer.");
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "REVIEW_DRAFT") {
    return;
  }

  (async () => {
    try {
      const text = await askReviewer(message.prompt);
      sendResponse({ ok: true, text });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
  })();

  return true;
});
