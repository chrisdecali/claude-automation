document.addEventListener('DOMContentLoaded', () => {
    const sendButton = document.getElementById('send-button');
    const promptInput = document.getElementById('prompt-input');
    const chatWindow = document.getElementById('chat-window');
    const sessionToggle = document.getElementById('session-toggle');
    const sessionDot = document.getElementById('session-dot');
    const sessionLabel = document.getElementById('session-label');

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);

    let assistantMessageElement = null;
    let assistantRawText = '';
    let sessionActive = false;
    let workingIndicator = null;
    let timerInterval = null;
    let timerStart = null;

    function setSessionActive(active) {
        sessionActive = active;
        if (active) {
            sessionDot.className = 'inline-block w-2.5 h-2.5 rounded-full bg-green-500';
            sessionLabel.textContent = 'Session active';
            sessionToggle.textContent = 'End Session';
            sessionToggle.className = 'bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-1.5 px-3 rounded-lg';
            promptInput.disabled = false;
            sendButton.disabled = false;
            promptInput.placeholder = 'Enter your prompt...';
            promptInput.focus();
        } else {
            sessionDot.className = 'inline-block w-2.5 h-2.5 rounded-full bg-gray-500';
            sessionLabel.textContent = 'No session';
            sessionToggle.textContent = 'Start Session';
            sessionToggle.className = 'bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-1.5 px-3 rounded-lg';
            promptInput.disabled = true;
            sendButton.disabled = true;
            promptInput.placeholder = 'Start a session to chat...';
        }
    }

    function showWorkingIndicator(text) {
        if (workingIndicator) {
            const statusEl = workingIndicator.querySelector('.status-text');
            if (statusEl) statusEl.textContent = text;
            return;
        }

        timerStart = Date.now();
        workingIndicator = document.createElement('div');
        workingIndicator.className = 'working-indicator mb-3 p-3 rounded-lg bg-gray-700/50 border border-gray-600';
        workingIndicator.innerHTML = `
            <div class="flex items-center gap-2">
                <div class="working-dots flex gap-0.5">
                    <span class="dot w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                    <span class="dot w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                    <span class="dot w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                </div>
                <span class="status-text text-sm text-blue-300">${text}</span>
                <span class="timer text-xs text-gray-500 ml-auto">0s</span>
            </div>
        `;
        chatWindow.appendChild(workingIndicator);
        chatWindow.scrollTop = chatWindow.scrollHeight;

        timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - timerStart) / 1000);
            const timerEl = workingIndicator?.querySelector('.timer');
            if (timerEl) timerEl.textContent = `${elapsed}s`;
        }, 1000);
    }

    function hideWorkingIndicator() {
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        if (workingIndicator) { workingIndicator.remove(); workingIndicator = null; }
    }

    function addMessageToChat(message, sender) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('mb-2', 'whitespace-pre-wrap');

        if (sender) {
            const senderElement = document.createElement('strong');
            senderElement.textContent = `${sender}: `;
            messageElement.appendChild(senderElement);
        }

        const contentElement = document.createElement('span');
        contentElement.textContent = message;
        messageElement.appendChild(contentElement);

        chatWindow.appendChild(messageElement);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        return messageElement;
    }

    function createAssistantMessage() {
        const wrapper = document.createElement('div');
        wrapper.classList.add('mb-3', 'assistant-message');

        const senderElement = document.createElement('div');
        senderElement.classList.add('font-semibold', 'text-blue-300', 'mb-1');
        senderElement.textContent = 'Claude';
        wrapper.appendChild(senderElement);

        const contentElement = document.createElement('div');
        contentElement.classList.add('whitespace-pre-wrap', 'leading-relaxed');
        wrapper.appendChild(contentElement);

        chatWindow.appendChild(wrapper);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        return contentElement;
    }

    function renderMarkdown(element, text) {
        if (typeof marked !== 'undefined') {
            try {
                element.classList.remove('whitespace-pre-wrap');
                element.classList.add('prose', 'prose-invert', 'prose-sm', 'max-w-none');
                element.innerHTML = marked.parse(text);
                return;
            } catch (e) {
                // fall through to plain text
            }
        }
        element.textContent = text;
    }

    socket.onopen = () => {
        console.log('WebSocket connection established.');
        addMessageToChat('Connected to server. Click "Start Session" or type /start to begin.', 'System');
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        switch (data.type) {
            case 'status':
                addMessageToChat(data.payload, 'System');
                break;
            case 'session-started':
                setSessionActive(true);
                addMessageToChat(data.payload, 'System');
                break;
            case 'session-closed':
                setSessionActive(false);
                hideWorkingIndicator();
                addMessageToChat(data.payload, 'System');
                assistantMessageElement = null;
                assistantRawText = '';
                break;
            case 'progress':
                showWorkingIndicator(data.payload);
                break;
            case 'stream-start':
                // Update indicator but keep it visible until first content arrives
                showWorkingIndicator('Claude is responding...');
                assistantMessageElement = createAssistantMessage();
                assistantRawText = '';
                break;
            case 'stream':
                if (assistantMessageElement) {
                    // Hide working indicator on first actual content
                    if (assistantRawText === '') {
                        hideWorkingIndicator();
                    }
                    assistantRawText += data.payload;
                    assistantMessageElement.textContent = assistantRawText;
                    chatWindow.scrollTop = chatWindow.scrollHeight;
                }
                break;
            case 'stream-end':
                // Render final output as markdown
                if (assistantMessageElement && assistantRawText) {
                    renderMarkdown(assistantMessageElement, assistantRawText);
                }
                hideWorkingIndicator();
                assistantMessageElement = null;
                assistantRawText = '';
                sendButton.disabled = false;
                promptInput.disabled = false;
                promptInput.focus();
                break;
            case 'error':
                hideWorkingIndicator();
                addMessageToChat(`Error: ${data.payload}`, 'System');
                assistantMessageElement = null;
                assistantRawText = '';
                sendButton.disabled = false;
                promptInput.disabled = false;
                break;
        }
    };

    socket.onclose = () => {
        console.log('WebSocket connection closed.');
        hideWorkingIndicator();
        addMessageToChat('Connection to server closed.', 'System');
        setSessionActive(false);
    };

    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        addMessageToChat('WebSocket error. See console for details.', 'System');
    };

    function sendMessage() {
        const prompt = promptInput.value.trim();
        if (!prompt) return;

        if (socket.readyState !== WebSocket.OPEN) {
            addMessageToChat('Cannot send message, WebSocket is not open.', 'System');
            return;
        }

        // Handle commands
        if (prompt === '/start') {
            socket.send(JSON.stringify({ type: 'start' }));
            promptInput.value = '';
            return;
        }
        if (prompt === '/close') {
            socket.send(JSON.stringify({ type: 'close-session' }));
            promptInput.value = '';
            return;
        }

        addMessageToChat(prompt, 'You');
        socket.send(JSON.stringify({ type: 'chat', payload: prompt }));
        promptInput.value = '';

        // Show working indicator and disable input
        sendButton.disabled = true;
        promptInput.disabled = true;
        showWorkingIndicator('Claude is thinking...');
    }

    sessionToggle.addEventListener('click', () => {
        if (socket.readyState !== WebSocket.OPEN) return;
        if (sessionActive) {
            socket.send(JSON.stringify({ type: 'close-session' }));
        } else {
            socket.send(JSON.stringify({ type: 'start' }));
        }
    });

    sendButton.addEventListener('click', sendMessage);

    promptInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    console.log('App initialized.');
});
