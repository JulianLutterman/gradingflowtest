const GEMINI_STREAM_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse';

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

  async function streamGeminiResponse(conversation, apiKey, onStream) {
    const requestBody = {
      contents: conversation.messages.map((message) => ({
        role: message.role,
        parts: message.parts.map((part) => ({ text: part.text })),
      })),
      system_instruction: {
        parts: [{ text: conversation.systemInstruction }],
      },
    };

    const response = await fetch(GEMINI_STREAM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Gemini request failed (${response.status} ${response.statusText}).`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const event of events) {
        const dataPayload = event
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5))
          .join('');

        if (!dataPayload) continue;
        const trimmed = dataPayload.trim();
        if (!trimmed || trimmed === '[DONE]') continue;

        let parsed;
        try {
          parsed = JSON.parse(trimmed);
        } catch (error) {
          console.warn('Unable to parse Gemini stream chunk', error);
          continue;
        }

        const textChunk = (parsed?.candidates?.[0]?.content?.parts || [])
          .map((part) => part?.text || '')
          .join('');

        if (!textChunk) continue;

        fullText += textChunk;
        onStream(fullText);
      }
    }

    if (!fullText) {
      throw new Error('Gemini returned an empty response.');
    }

    return fullText.trim();
  }

  window.followupSupport = {
    hydrate,
  };
})();
