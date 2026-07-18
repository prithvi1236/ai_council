const PROSE_BLOCK_SELECTORS = [
  "message-content .markdown",
  "message-content",
  ".model-response-text",
  ".response-content"
];

function getConversationRoot() {
  return (
    document.querySelector("main") ||
    document.querySelector("chat-app") ||
    document.body
  );
}

function getAssistantProseBlocks() {
  const root = getConversationRoot();
  const matches = [];

  for (const response of root.querySelectorAll("model-response")) {
    for (const selector of PROSE_BLOCK_SELECTORS) {
      for (const block of response.querySelectorAll(selector)) {
        if (block instanceof HTMLElement) {
          matches.push(block);
        }
      }
    }
  }

  const uniqueBlocks = [];
  const seen = new Set();

  for (const block of matches) {
    const isNested = matches.some(
      (other) => other !== block && other.contains(block)
    );

    if (isNested || seen.has(block)) {
      continue;
    }

    seen.add(block);
    uniqueBlocks.push(block);
  }

  return uniqueBlocks.sort((left, right) => {
    if (left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING) {
      return -1;
    }

    if (left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_PRECEDING) {
      return 1;
    }

    return 0;
  });
}

function countAssistantProseBlocks() {
  return getAssistantProseBlocks().length;
}

function extractProseText(element) {
  if (!(element instanceof HTMLElement)) {
    return "";
  }

  return (element.innerText || element.textContent || "").trim();
}

function getLatestResponseText(beforeCount) {
  const blocks = getAssistantProseBlocks();

  if (blocks.length <= beforeCount) {
    return "";
  }

  return extractProseText(blocks[blocks.length - 1]);
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

function waitForSendButton(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const button =
        document.querySelector('button[aria-label="Send message"]') ||
        document.querySelector('button[aria-label*="Send"]') ||
        document.querySelector("button.send-button");

      if (button instanceof HTMLButtonElement && !button.disabled) {
        resolve(button);
        return;
      }

      if (Date.now() - start > timeoutMs) {
        reject(
          new Error(
            "Couldn't find an enabled Gemini send button (button[aria-label='Send message'])."
          )
        );
        return;
      }

      setTimeout(check, 100);
    };

    check();
  });
}

async function injectPrompt(text) {
  const input = getPromptInput();

  input.focus();
  input.textContent = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  const sendButton = await waitForSendButton();
  sendButton.click();
}

function waitForResponseComplete(
  beforeCount,
  { stableMs = 2000, timeoutMs = 60000 } = {}
) {
  return new Promise((resolve, reject) => {
    const root = getConversationRoot();
    let debounceTimer = null;

    const finish = () => {
      const latestText = getLatestResponseText(beforeCount);

      if (!latestText) {
        debounceTimer = setTimeout(finish, stableMs);
        return;
      }

      observer.disconnect();
      clearTimeout(timeoutTimer);
      resolve(latestText);
    };

    const timeoutTimer = setTimeout(() => {
      observer.disconnect();
      clearTimeout(debounceTimer);
      const latestText = getLatestResponseText(beforeCount);

      if (latestText) {
        resolve(latestText);
        return;
      }

      reject(new Error("Timeout waiting for Reviewer's response to stabilize."));
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(finish, stableMs);
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true
    });
    debounceTimer = setTimeout(finish, stableMs);
  });
}

async function askReviewer(prompt) {
  try {
    const beforeCount = countAssistantProseBlocks();
    await injectPrompt(prompt);
    const text = await waitForResponseComplete(beforeCount);

    if (!text) {
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
