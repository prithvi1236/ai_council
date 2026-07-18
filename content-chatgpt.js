function countAssistantMessages() {
  return document.querySelectorAll('[data-message-author-role="assistant"]').length;
}

function getPromptInput() {
  const input = document.querySelector("#prompt-textarea");

  if (!(input instanceof HTMLElement) || input.contentEditable !== "true") {
    throw new Error("Couldn't find ChatGPT's input box (#prompt-textarea).");
  }

  return input;
}

function waitForSendButton(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const button = document.querySelector("#composer-submit-button");

      if (button instanceof HTMLButtonElement && !button.disabled) {
        resolve(button);
        return;
      }

      if (Date.now() - start > timeoutMs) {
        reject(new Error("Couldn't find an enabled ChatGPT send button (#composer-submit-button)."));
        return;
      }

      setTimeout(check, 100);
    };

    check();
  });
}

async function injectPrompt(text) {
  const input = getPromptInput();
  const paragraph = input.querySelector("p");

  if (!(paragraph instanceof HTMLParagraphElement)) {
    throw new Error("Couldn't find ChatGPT's editable paragraph (#prompt-textarea > p).");
  }

  input.focus();
  paragraph.textContent = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  const sendButton = await waitForSendButton();
  sendButton.click();
}

function waitForNewMessage(beforeCount, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      try {
        const messages = document.querySelectorAll(
          '[data-message-author-role="assistant"]'
        );

        if (messages.length > beforeCount) {
          resolve(messages[messages.length - 1]);
          return;
        }

        if (Date.now() - start > timeoutMs) {
          reject(new Error("Timeout waiting for a new Draftor message to appear."));
          return;
        }

        setTimeout(check, 300);
      } catch (error) {
        reject(new Error(`Couldn't inspect Draftor messages: ${error.message}`));
      }
    };

    check();
  });
}

function waitForResponseComplete(
  targetElement,
  { stableMs = 2000, timeoutMs = 60000 } = {}
) {
  return new Promise((resolve, reject) => {
    let debounceTimer = null;
    const finish = () => {
      observer.disconnect();
      clearTimeout(timeoutTimer);
      resolve(targetElement.textContent.trim());
    };
    const timeoutTimer = setTimeout(() => {
      observer.disconnect();
      clearTimeout(debounceTimer);
      reject(new Error("Timeout waiting for Draftor's response to stabilize."));
    }, timeoutMs);
    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(finish, stableMs);
    });

    observer.observe(targetElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
    debounceTimer = setTimeout(finish, stableMs);
  });
}

async function askDraftor(question) {
  try {
    const beforeCount = countAssistantMessages();
    await injectPrompt(question);
    const newMessage = await waitForNewMessage(beforeCount);
    const text = await waitForResponseComplete(newMessage);

    if (!text) {
      throw new Error("Draftor returned an empty response.");
    }

    return text;
  } catch (error) {
    throw new Error(error.message || "Could not get a response from Draftor.");
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "DRAFT_QUESTION") {
    return;
  }

  (async () => {
    try {
      const text = await askDraftor(message.question);
      sendResponse({ ok: true, text });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
  })();

  return true;
});
