const GEMINI_STREAM_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent';

(function () {
  const conversations = new Map();

  function hydrate() {
    document.querySelectorAll('.feedback-followup').forEach(initializeBlock);
  }

  function initializeBlock(block) {
    if (!block || block.dataset.initialized === 'true') return;
    block.dataset.initialized = 'true';

    const answerId = block.dataset.answerId;
    if (!answerId) return;

    const contextText = block.dataset.context ? decodeURIComponent(block.dataset.context) : '';
    const questionLabel = block.dataset.questionLabel ? decodeURIComponent(block.dataset.questionLabel) : '';
    const subLabel = block.dataset.subLabel ? decodeURIComponent(block.dataset.subLabel) : '';

    const contextLabelEl = block.querySelector('.followup-context-label');
    if (contextLabelEl) {
      contextLabelEl.textContent = '';
      if (questionLabel) {
        const strong = document.createElement('strong');
        strong.textContent = questionLabel;
        contextLabelEl.appendChild(strong);
      }
      if (questionLabel && subLabel) {
        contextLabelEl.append(' · ');
      }
      if (subLabel) {
        contextLabelEl.append(subLabel);
      }
    }

    const textarea = block.querySelector('.followup-input');
    const sendBtn = block.querySelector('.followup-send-btn');
    const historyEl = block.querySelector('.followup-history');
    const statusEl = block.querySelector('.followup-status');

    if (!textarea || !sendBtn || !historyEl || !statusEl) return;

    if (!conversations.has(answerId)) {
      conversations.set(answerId, {
        messages: [],
        systemInstruction: buildSystemInstruction(contextText),
      });
    }

    sendBtn.addEventListener('click', () => {
      submitFollowup(answerId, {
        block,
        textarea,
        sendBtn,
        historyEl,
        statusEl,
      });
    });

    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submitFollowup(answerId, {
          block,
          textarea,
          sendBtn,
          historyEl,
          statusEl,
        });
      }
    });
  }

  function buildSystemInstruction(contextText) {
    const baseInstruction = [
      'You are a thoughtful AI teaching assistant who explains grading decisions.',
      'Base every answer strictly on the provided grading context.',
      'If information is missing, clearly say so instead of guessing.',
      'Use numbered or bulleted lists when outlining rubric items or reasoning steps.',
      'Keep the tone encouraging and student-friendly.',
    ].join(' ');

    if (!contextText) {
      return baseInstruction;
    }

    return `${baseInstruction}\n\nGrading context:\n${contextText}`;
  }

  function appendHistoryMessage(historyEl, role, text, { isStreaming = false } = {}) {
    const wrapper = document.createElement('div');
    wrapper.className = `followup-message followup-message-${role}`;
    if (isStreaming) {
      wrapper.classList.add('is-streaming');
    }

    const bubble = document.createElement('div');
    bubble.className = 'followup-bubble';
    bubble.textContent = text;
    wrapper.appendChild(bubble);

    historyEl.appendChild(wrapper);
    historyEl.scrollTop = historyEl.scrollHeight;
    return bubble;
  }

  function setStatus(statusEl, message, { isError = false } = {}) {
    statusEl.textContent = message || '';
    statusEl.classList.toggle('is-error', Boolean(isError));
  }

  async function submitFollowup(answerId, ui) {
    const { block, textarea, sendBtn, historyEl, statusEl } = ui;
    const question = textarea.value.trim();
    if (!question) return;

    setStatus(statusEl, 'Preparing Gemini…');

    let apiKey = '';
    try {
      const loader =
        (typeof globalThis !== 'undefined' && typeof globalThis.ensureGeminiApiKey === 'function')
          ? globalThis.ensureGeminiApiKey
          : null;

      if (loader) {
        apiKey = await loader();
      } else if (typeof GEMINI_API_KEY === 'string') {
        apiKey = GEMINI_API_KEY.trim();
      }
    } catch (error) {
      console.error('Failed to load the Gemini API key.', error);
      setStatus(statusEl, 'Gemini follow-ups are temporarily unavailable.', { isError: true });
      return;
    }

    if (!apiKey) {
      setStatus(statusEl, 'Gemini follow-ups are not configured yet.', { isError: true });
      return;
    }

    const conversation = conversations.get(answerId);
    if (!conversation) return;

    setStatus(statusEl, 'Gemini is thinking…');
    appendHistoryMessage(historyEl, 'user', question);

    textarea.value = '';
    textarea.blur();

    const streamingBubble = appendHistoryMessage(historyEl, 'model', '', { isStreaming: true });
    sendBtn.disabled = true;
    textarea.disabled = true;
    block.classList.add('is-streaming');

    conversation.messages.push({
      role: 'user',
      parts: [{ text: question }],
    });

    try {
      const fullText = await streamGeminiResponse(conversation, apiKey, (partial) => {
        streamingBubble.textContent = partial;
        historyEl.scrollTop = historyEl.scrollHeight;
      });

      streamingBubble.textContent = fullText;
      streamingBubble.parentElement.classList.remove('is-streaming');
      conversation.messages.push({
        role: 'model',
        parts: [{ text: fullText }],
      });
      setStatus(statusEl, 'Response ready.');
    } catch (error) {
      streamingBubble.parentElement.classList.add('is-error');
      streamingBubble.textContent = error.message || 'Unable to generate a response.';
      conversation.messages.pop();
      setStatus(statusEl, 'Gemini could not reply.', { isError: true });
    } finally {
      sendBtn.disabled = false;
      textarea.disabled = false;
      block.classList.remove('is-streaming');
      textarea.focus();
      setTimeout(() => setStatus(statusEl, ''), 4000);
    }
  }

  function buildGeminiStreamUrl(apiKey) {
    const url = new URL(GEMINI_STREAM_BASE_URL);
    url.searchParams.set('alt', 'sse');
    url.searchParams.set('key', apiKey);
    return url.toString();
  }

  async function streamGeminiResponse(conversation, apiKey, onStream) {
    const requestBody = {
      contents: conversation.messages.map((message) => ({
        role: message.role,
        parts: message.parts.map((part) => ({ text: part.text })),
      })),
    };

    if (conversation.systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: conversation.systemInstruction }],
      };
    }

    const response = await fetch(buildGeminiStreamUrl(apiKey), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok || !response.body) {
      let details = '';
      try {
        details = await response.text();
      } catch (readError) {
        console.warn('Unable to read Gemini error payload', readError);
      }
      const suffix = details ? ` – ${details}` : '';
      throw new Error(`Gemini request failed (${response.status} ${response.statusText})${suffix}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    const emitChunk = (chunk) => {
      if (!chunk) return;
      const normalizedChunk = String(chunk);
      const addition = normalizedChunk.startsWith(fullText)
        ? normalizedChunk.slice(fullText.length)
        : normalizedChunk;
      if (!addition) return;
      fullText += addition;
      onStream(fullText);
    };

    const parseEventPayload = (payload) => {
      const trimmed = payload.trim();
      if (!trimmed || trimmed === '[DONE]') {
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch (error) {
        console.warn('Unable to parse Gemini stream chunk', error);
        return;
      }

      const promptFeedback = parsed?.promptFeedback;
      if (promptFeedback?.blockReason) {
        const reason = promptFeedback.blockReason.replace(/_/g, ' ').toLowerCase();
        throw new Error(`Gemini blocked the response (${reason}).`);
      }

      const candidates = parsed?.candidates || [];
      for (const candidate of candidates) {
        if (candidate?.finishReason === 'SAFETY') {
          throw new Error('Gemini blocked the response for safety reasons.');
        }

        const partsSources = [
          candidate?.content?.parts,
          candidate?.delta?.parts,
          candidate?.delta?.content?.parts,
        ];

        for (const parts of partsSources) {
          if (!Array.isArray(parts) || parts.length === 0) continue;
          const textChunk = parts
            .map((part) => (part && typeof part.text === 'string' ? part.text : ''))
            .join('');
          if (textChunk) {
            emitChunk(textChunk);
          }
        }
      }
    };

    const flushBuffer = ({ force = false } = {}) => {
      if (!buffer) return;
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || '';
      for (const event of events) {
        const dataPayload = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('');
        if (!dataPayload) continue;
        parseEventPayload(dataPayload);
      }

      if (force && buffer.trim()) {
        const trailingPayload = buffer
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('');
        if (trailingPayload) {
          parseEventPayload(trailingPayload);
        }
        buffer = '';
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      flushBuffer();
    }

    // Process any trailing data that wasn't followed by a blank line.
    flushBuffer({ force: true });

    if (!fullText) {
      throw new Error('Gemini returned an empty response.');
    }

    return fullText.trim();
  }

  window.followupSupport = {
    hydrate,
  };
})();
