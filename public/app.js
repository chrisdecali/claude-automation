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
    let thinkingElement = null;
    let sessionActive = false;
    let waitingForResponse = false;

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
        const messageElement = document.createElement('div');
        messageElement.classList.add('mb-2', 'whitespace-pre-wrap');

        const senderElement = document.createElement('strong');
        senderElement.textContent = 'Claude: ';
        messageElement.appendChild(senderElement);

        const contentElement = document.createElement('span');
        messageElement.appendChild(contentElement);

        chatWindow.appendChild(messageElement);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        return contentElement;
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
                addMessageToChat(data.payload, 'System');
                assistantMessageElement = null;
                break;
            case 'stream-start':
                // Remove thinking indicator
                if (thinkingElement) {
                    thinkingElement.remove();
                    thinkingElement = null;
                }
                assistantMessageElement = createAssistantMessage();
                waitingForResponse = false;
                break;
            case 'stream':
                if (assistantMessageElement) {
                    // Remove thinking indicator on first chunk if still present
                    if (thinkingElement) {
                        thinkingElement.remove();
                        thinkingElement = null;
                    }
                    assistantMessageElement.textContent += data.payload;
                    chatWindow.scrollTop = chatWindow.scrollHeight;
                }
                break;
            case 'stream-end':
                assistantMessageElement = null;
                sendButton.disabled = false;
                promptInput.disabled = false;
                promptInput.focus();
                break;
            case 'error':
                if (thinkingElement) {
                    thinkingElement.remove();
                    thinkingElement = null;
                }
                addMessageToChat(`Error: ${data.payload}`, 'System');
                assistantMessageElement = null;
                waitingForResponse = false;
                sendButton.disabled = false;
                promptInput.disabled = false;
                break;
        }
    };

    socket.onclose = () => {
        console.log('WebSocket connection closed.');
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

        // Show thinking indicator and disable input
        waitingForResponse = true;
        sendButton.disabled = true;
        promptInput.disabled = true;
        thinkingElement = document.createElement('div');
        thinkingElement.classList.add('mb-2', 'text-gray-400', 'italic');
        thinkingElement.textContent = 'Claude is thinking...';
        thinkingElement.style.animation = 'pulse 1.5s ease-in-out infinite';
        chatWindow.appendChild(thinkingElement);
        chatWindow.scrollTop = chatWindow.scrollHeight;
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
