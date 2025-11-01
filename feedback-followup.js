// feedback-followup.js
// Handles Gemini-powered follow-up questions for grading feedback with live streaming responses.

(function () {
  const state = {
    contexts: new Map(),
    history: new Map(),
    activeControllers: new Map(),
    initialized: false,
  };

  const MAX_HISTORY_ENTRIES = 10;

  function ensureElements(answerId) {
    const container = document.querySelector(`.feedback-followup[data-answer-id="${answerId}"]`);
    if (!container) return {};

    const input = container.querySelector('.followup-input');
    const button = container.querySelector('.followup-send-btn');
    const spinner = container.querySelector('.followup-spinner');
    const thread = container.querySelector('.followup-thread');
    const status = container.querySelector('.followup-status');

    return { container, input, button, spinner, thread, status };
  }

  function setLoading(answerId, isLoading) {
    const { button, spinner, container, input } = ensureElements(answerId);
    if (button) {
      button.disabled = isLoading;
    }
    if (input) {
      input.readOnly = !!isLoading;
    }
    if (container) {
      container.classList.toggle('is-loading', !!isLoading);
    }
    if (spinner) {
      spinner.classList.toggle('hidden', !isLoading);
    }
  }

  function renderStatus(answerId, message, type = 'info') {
    const { status } = ensureElements(answerId);
    if (!status) return;
    status.textContent = message || '';
    status.dataset.statusType = type;
    status.classList.toggle('hidden', !message);
  }

  function appendMessage(answerId, role, text, { isStreaming = false } = {}) {
    const { thread } = ensureElements(answerId);
    if (!thread) return null;

    const messageEl = document.createElement('div');
    messageEl.className = `followup-message ${role === 'user' ? 'is-user' : 'is-model'}`;
    if (isStreaming) {
      messageEl.classList.add('is-streaming');
    }
    messageEl.textContent = text || '';
    thread.appendChild(messageEl);
    thread.scrollTop = thread.scrollHeight;
    return messageEl;
  }

  function updateStreamingMessage(messageEl, text) {
    if (!messageEl) return;
    messageEl.textContent = text;
  }

  async function buildSupabaseHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (typeof SUPABASE_ANON_KEY === 'string' && SUPABASE_ANON_KEY) {
      headers.apikey = SUPABASE_ANON_KEY;
    }

    let accessToken = null;
    try {
      if (window.sb && typeof window.sb.auth?.getSession === 'function') {
        const { data, error } = await window.sb.auth.getSession();
        if (!error) {
          accessToken = data?.session?.access_token || null;
        }
      }
    } catch (err) {
      console.warn('Failed to load Supabase session for follow-up request', err);
    }

    const token = accessToken || (typeof SUPABASE_ANON_KEY === 'string' ? SUPABASE_ANON_KEY : '');
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }

  async function streamFollowUp(answerId, prompt, historyBeforePrompt) {
    if (typeof FOLLOWUP_FEEDBACK_URL === 'undefined' || !FOLLOWUP_FEEDBACK_URL) {
      throw new Error('Follow-up service URL is not configured.');
    }

    const context = state.contexts.get(answerId);
    if (!context) {
      throw new Error('Unable to locate grading context for this answer.');
    }

    const history = Array.isArray(historyBeforePrompt) ? historyBeforePrompt : [];
    const trimmedHistory = history.slice(Math.max(0, history.length - MAX_HISTORY_ENTRIES));
    const payload = {
      prompt,
      context,
      history: trimmedHistory,
    };

    const controller = new AbortController();
    state.activeControllers.set(answerId, controller);

    try {
      const headers = await buildSupabaseHeaders();
      const response = await fetch(FOLLOWUP_FEEDBACK_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const errorText = await response.text();
        throw new Error(errorText || 'Follow-up request failed.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let aggregated = '';

      const streamMessage = appendMessage(answerId, 'model', '', { isStreaming: true });

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: !done });
          aggregated += chunk;
          updateStreamingMessage(streamMessage, aggregated);
        }
      }

      if (aggregated.trim()) {
        const historyArr = state.history.get(answerId) ?? [];
        historyArr.push({ role: 'model', text: aggregated.trim() });
        state.history.set(answerId, historyArr);
      }

      return aggregated.trim();
    } finally {
      state.activeControllers.delete(answerId);
    }
  }

  async function handleFollowUpSubmit(answerId) {
    const { input, container } = ensureElements(answerId);
    if (!input || !container) return;

    if (container.classList.contains('is-loading') || state.activeControllers.has(answerId)) {
      renderStatus(answerId, 'Please wait for the current response to finish.', 'warning');
      return;
    }

    const prompt = input.value.trim();
    if (!prompt) {
      renderStatus(answerId, 'Enter a question to start a follow-up.', 'warning');
      return;
    }

    renderStatus(answerId, '', 'info');

    const historyArr = state.history.get(answerId) ?? [];
    const historyBeforePrompt = historyArr.slice();
    historyArr.push({ role: 'user', text: prompt });
    state.history.set(answerId, historyArr);

    appendMessage(answerId, 'user', prompt);
    input.value = '';

    setLoading(answerId, true);

    try {
      await streamFollowUp(answerId, prompt, historyBeforePrompt);
      renderStatus(answerId, 'Gemini 2.5 Pro response complete.', 'success');
    } catch (error) {
      console.error('Follow-up request failed', error);
      renderStatus(answerId, 'Follow-up failed: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
      const historyForAnswer = state.history.get(answerId) ?? [];
      historyForAnswer.pop();
      state.history.set(answerId, historyForAnswer);
    } finally {
      setLoading(answerId, false);
    }
  }

  function handleSendButton(event) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('.followup-send-btn');
    if (!button) return;
    const answerId = button.getAttribute('data-answer-id');
    if (!answerId) return;
    event.preventDefault();
    handleFollowUpSubmit(answerId);
  }

  function handleInputKey(event) {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) return;
    if (!target.classList.contains('followup-input')) return;
    const answerId = target.getAttribute('data-answer-id');
    if (!answerId) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleFollowUpSubmit(answerId);
    }
  }

  function initializeListeners() {
    if (state.initialized) return;
    state.initialized = true;
    document.addEventListener('click', handleSendButton);
    document.addEventListener('keydown', handleInputKey);
  }

  function registerFeedbackFollowUp(answerId, context) {
    if (!answerId || !context) return;
    state.contexts.set(String(answerId), context);
  }

  function syncActiveAnswerIds(answerIds) {
    const activeSet = new Set((answerIds || []).map((id) => String(id)));
    for (const key of state.contexts.keys()) {
      if (!activeSet.has(key)) {
        state.contexts.delete(key);
        state.history.delete(key);
        const controller = state.activeControllers.get(key);
        if (controller) {
          controller.abort();
          state.activeControllers.delete(key);
        }
      }
    }
  }

  window.registerFeedbackFollowUp = registerFeedbackFollowUp;
  window.syncFeedbackFollowUpContexts = syncActiveAnswerIds;
  window.initializeFeedbackFollowUpUI = initializeListeners;
})();
