document.addEventListener('DOMContentLoaded', () => {
    const sendButton = document.getElementById('send-button');
    const promptInput = document.getElementById('prompt-input');
    const chatWindow = document.getElementById('chat-window');

    function addMessageToChat(message, sender = 'User') {
        const messageElement = document.createElement('div');
        messageElement.classList.add('mb-2');
        
        const senderElement = document.createElement('strong');
        senderElement.textContent = `${sender}: `;
        
        const contentElement = document.createElement('span');
        contentElement.textContent = message;

        messageElement.appendChild(senderElement);
        messageElement.appendChild(contentElement);
        chatWindow.appendChild(messageElement);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    sendButton.addEventListener('click', () => {
        const prompt = promptInput.value.trim();
        if (prompt) {
            addMessageToChat(prompt, 'You');
            promptInput.value = '';
            // WebSocket logic to send prompt will be added here
        }
    });

    promptInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            sendButton.click();
        }
    });

    console.log('App initialized.');
});
