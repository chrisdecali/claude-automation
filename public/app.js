document.addEventListener('DOMContentLoaded', () => {
    const sendButton = document.getElementById('send-button');
    const promptInput = document.getElementById('prompt-input');
    const chatWindow = document.getElementById('chat-window');

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);

    let assistantMessageElement = null;

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
        return contentElement;
    }

    socket.onopen = () => {
        console.log('WebSocket connection established.');
        addMessageToChat('Connected to server.', 'System');
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        switch (data.type) {
            case 'status':
                addMessageToChat(data.payload, 'System');
                if (data.payload.includes('started')) {
                    assistantMessageElement = createAssistantMessage();
                } else {
                    assistantMessageElement = null; // Reset after session ends
                }
                break;
            case 'stream':
                if (assistantMessageElement) {
                    assistantMessageElement.textContent += data.payload;
                    chatWindow.scrollTop = chatWindow.scrollHeight;
                }
                break;
            case 'error':
                addMessageToChat(`Error: ${data.payload}`, 'System');
                assistantMessageElement = null;
                break;
        }
    };

    socket.onclose = () => {
        console.log('WebSocket connection closed.');
        addMessageToChat('Connection to server closed.', 'System');
    };

    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        addMessageToChat('WebSocket error. See console for details.', 'System');
    };


    function sendMessage() {
        const prompt = promptInput.value.trim();
        if (prompt && socket.readyState === WebSocket.OPEN) {
            addMessageToChat(prompt, 'You');
            socket.send(JSON.stringify({ type: 'chat', payload: prompt }));
            promptInput.value = '';
        } else {
            addMessageToChat('Cannot send message, WebSocket is not open.', 'System');
        }
    }

    sendButton.addEventListener('click', sendMessage);

    promptInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    console.log('App initialized.');
});

