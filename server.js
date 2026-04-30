const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { translate } = require('@vitalets/google-translate-api');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Translate message utility
async function translateMessage(text, sourceLang) {
    try {
        const targetLang = sourceLang === 'pt' ? 'tl' : 'pt'; // pt -> tagalog, or anything else -> pt
        const res = await translate(text, { to: targetLang });
        return { original: text, translated: res.text };
    } catch (err) {
        console.error('Translation error:', err);
        return { original: text, translated: text }; // fallback
    }
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Join default room for simplicity
    socket.join('watch-party');

    // Video Syncing
    socket.on('video-play', (time) => {
        socket.to('watch-party').emit('video-play', time);
    });

    socket.on('video-pause', (time) => {
        socket.to('watch-party').emit('video-pause', time);
    });

    socket.on('video-seek', (time) => {
        socket.to('watch-party').emit('video-seek', time);
    });

    socket.on('video-change', (videoId) => {
        socket.to('watch-party').emit('video-change', videoId);
    });

    // Chat
    socket.on('chat-message', async (data) => {
        // data: { text: "hello", userLang: "pt", username: "User1" }
        const { text, userLang, username } = data;
        const result = await translateMessage(text, userLang);
        
        io.to('watch-party').emit('chat-message', {
            username,
            original: result.original,
            translated: result.translated,
            sourceLang: userLang,
            timestamp: new Date().toISOString()
        });
    });

    // Chat Image Upload
    socket.on('chat-image', (data) => {
        io.to('watch-party').emit('chat-image', {
            username: data.username,
            imgDataUrl: data.imgDataUrl,
            timestamp: new Date().toISOString()
        });
    });

    // Winks (MSN style large visual/audio emojis)
    socket.on('send-wink', (winkId) => {
        io.to('watch-party').emit('receive-wink', winkId);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
