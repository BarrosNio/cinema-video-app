// Safely initialize socket if the server is running, otherwise mock it for local layout testing
const socket = (typeof io !== 'undefined') ? io() : {
    on: () => {},
    emit: (event, data) => { console.log(`[Offline Socket] Executando ${event}:`, data); }
};

if (typeof io === 'undefined') {
    alert("Modo Offline: O servidor não está rodando. O chat e as sincronizações de vídeo não irão funcionar entre máquinas.");
}

// UI Elements
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const emojiBtn = document.getElementById('emojiBtn');
const emojiPickerContainer = document.getElementById('emojiPickerContainer');
const chatImageInput = document.getElementById('chatImageInput');
const usernameInput = document.getElementById('usernameInput');
const languageSelect = document.getElementById('languageSelect');

// Auto-detect browser language to help the user in the Philippines
const browserLang = navigator.language || navigator.userLanguage;
if (browserLang && !browserLang.toLowerCase().includes('pt')) {
    languageSelect.value = 'en';
}

const winkOverlay = document.getElementById('winkOverlay');
const winkBtns = document.querySelectorAll('.wink-btn');

// Video UI Elements
const loadVideoBtn = document.getElementById('loadVideoBtn');
const youtubeUrlInput = document.getElementById('youtubeUrl');
const localVideoFile = document.getElementById('localVideoFile');
const subtitleFile = document.getElementById('subtitleFile');
const webUrlInput = document.getElementById('webUrl');
const loadWebBtn = document.getElementById('loadWebBtn');
const webIframe = document.getElementById('webIframe');
const videoPlaceholder = document.getElementById('videoPlaceholder');
const html5Player = document.getElementById('html5Player');
const ytPlayerContainer = document.getElementById('player');

// ...
let ytPlayer;
let isYtReady = false;
let isSyncing = false;
let activeMode = null; // 'direct' or 'youtube'

function setDisplayMode(mode) {
    activeMode = mode;
    videoPlaceholder.style.display = 'none';
    
    // Hide the input fields on mobile after loading to save space
    if (window.innerWidth <= 768) {
        document.querySelectorAll('.video-input').forEach(el => el.classList.add('hidden'));
    }

    if (mode === 'youtube') {
        html5Player.style.display = 'none';
        html5Player.pause();
        webIframe.style.display = 'none';
        if (webIframe.src) webIframe.src = '';
        ytPlayerContainer.style.display = 'block';
        ytPlayerContainer.classList.add('active');
    } else if (mode === 'direct' || mode === 'local') {
        if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
            ytPlayer.pauseVideo();
        }
        ytPlayerContainer.classList.remove('active');
        ytPlayerContainer.style.display = 'none';
        webIframe.style.display = 'none';
        if (webIframe.src) webIframe.src = '';
        html5Player.style.display = 'block';
    } else if (mode === 'web') {
        if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
            ytPlayer.pauseVideo();
        }
        ytPlayerContainer.classList.remove('active');
        ytPlayerContainer.style.display = 'none';
        html5Player.style.display = 'none';
        html5Player.pause();
        webIframe.style.display = 'block';
    }
}

html5Player.addEventListener('play', () => {
    if (isSyncing || activeMode !== 'direct') return;
    socket.emit('video-play', html5Player.currentTime);
});

html5Player.addEventListener('pause', () => {
    if (isSyncing || activeMode !== 'direct') return;
    socket.emit('video-pause', html5Player.currentTime);
});

// --- YouTube Player Logic ---
function extractVideoID(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function onYouTubeIframeAPIReady() {
    console.log("YouTube API Ready");
}

function initYtPlayer(videoId) {
    setDisplayMode('youtube');
    if (!ytPlayer) {
        ytPlayer = new YT.Player('player', {
            height: '100%',
            width: '100%',
            videoId: videoId,
            playerVars: { 'playsinline': 1, 'rel': 0 },
            events: {
                'onReady': () => { isYtReady = true; },
                'onStateChange': onYtPlayerStateChange
            }
        });
    } else {
        ytPlayer.loadVideoById(videoId);
    }
}

function onYtPlayerStateChange(event) {
    if (isSyncing || activeMode !== 'youtube') return;
    if (event.data == YT.PlayerState.PLAYING) {
        socket.emit('video-play', ytPlayer.getCurrentTime());
    } else if (event.data == YT.PlayerState.PAUSED) {
        socket.emit('video-pause', ytPlayer.getCurrentTime());
    }
}

loadVideoBtn.addEventListener('click', () => {
    const url = youtubeUrlInput.value;
    const videoId = extractVideoID(url);
    if (videoId) {
        initYtPlayer(videoId);
        socket.emit('video-change', { type: 'youtube', id: videoId });
    } else {
        alert('URL do YouTube inválida!');
    }
});


localVideoFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const url = URL.createObjectURL(file);
    html5Player.src = url;
    setDisplayMode('direct');
    
    socket.emit('video-change', { type: 'local', filename: file.name });
});

subtitleFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        let text = event.target.result;
        
        // Convert SRT to VTT automatically if needed
        if (file.name.toLowerCase().endsWith('.srt') || !text.startsWith('WEBVTT')) {
            text = "WEBVTT\n\n" + text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
        }

        const blob = new Blob([text], { type: 'text/vtt' });
        const url = URL.createObjectURL(blob);
        
        // Remove existing tracks
        while (html5Player.firstChild) {
            html5Player.removeChild(html5Player.firstChild);
        }

        const track = document.createElement('track');
        track.kind = 'captions';
        track.label = 'Legenda';
        track.srclang = 'en';
        track.src = url;
        track.default = true;
        
        html5Player.appendChild(track);
        html5Player.textTracks[0].mode = 'showing';
    };
    reader.readAsText(file);
});

subtitleFile.addEventListener('change', (e) => {
    // ... logic remains
});

// Event listener for Web Iframe
loadWebBtn.addEventListener('click', () => {
    let url = webUrlInput.value.trim();
    if (!url) return;
    
    if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
    }
    
    webIframe.src = url;
    setDisplayMode('web');
    socket.emit('video-change', { type: 'web', url: url });
});

// --- Socket Sync Events ---
socket.on('video-change', (data) => {
    if (data.type === 'youtube') {
        initYtPlayer(data.id);
    } else if (data.type === 'local') {
        alert('O outro usuário selecionou o arquivo: ' + data.filename + '\nPor favor, clique em "Carregar Arquivo" e selecione o mesmo arquivo de vídeo no seu aparelho para sincronizar as telas.');
    } else if (data.type === 'web') {
        webIframe.src = data.url;
        setDisplayMode('web');
    }
});


socket.on('video-play', (time) => {
    isSyncing = true;
    if (activeMode === 'youtube' && isYtReady && ytPlayer) {
        ytPlayer.seekTo(time);
        ytPlayer.playVideo();
    } else if (activeMode === 'direct') {
        html5Player.currentTime = time;
        html5Player.play();
    }
    setTimeout(() => { isSyncing = false; }, 500);
});

socket.on('video-pause', (time) => {
    isSyncing = true;
    if (activeMode === 'youtube' && isYtReady && ytPlayer) {
        ytPlayer.seekTo(time);
        ytPlayer.pauseVideo();
    } else if (activeMode === 'direct') {
        html5Player.currentTime = time;
        html5Player.pause();
    }
    setTimeout(() => { isSyncing = false; }, 500);
});


// --- Chat Logic ---
function appendMessage(data) {
    const { username, original, translated, sourceLang } = data;
    const isMe = username === usernameInput.value;
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', isMe ? 'me' : 'other');

    const myLang = languageSelect.value;
    let displayText = original;
    let fallbackText = translated;
    
    if (!isMe && sourceLang !== myLang) {
        displayText = translated;
        fallbackText = original;
    } else if (isMe) {
        displayText = original;
    }

    let html = `<span class="user">${username}</span><div>${displayText}</div>`;
    
    if (!isMe && sourceLang !== myLang) {
        html += `<div class="translated">${fallbackText} (Original)</div>`;
    }

    msgDiv.innerHTML = html;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    const msgData = {
        text: text,
        userLang: languageSelect.value,
        username: usernameInput.value || 'Guest'
    };

    socket.emit('chat-message', msgData);
    chatInput.value = '';
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Emoji Picker Logic
emojiBtn.addEventListener('click', () => {
    const isHidden = emojiPickerContainer.style.display === 'none';
    emojiPickerContainer.style.display = isHidden ? 'block' : 'none';
});

document.querySelector('emoji-picker').addEventListener('emoji-click', event => {
    chatInput.value += event.detail.unicode;
    chatInput.focus();
});

document.addEventListener('click', (e) => {
    if (!emojiBtn.contains(e.target) && !emojiPickerContainer.contains(e.target)) {
        emojiPickerContainer.style.display = 'none';
    }
});

socket.on('chat-message', (data) => {
    appendMessage(data);
});

chatImageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(event) {
        socket.emit('chat-image', {
            username: usernameInput.value || 'Guest',
            imgDataUrl: event.target.result
        });
    };
    reader.readAsDataURL(file);
    // clear input
    e.target.value = '';
});

socket.on('chat-image', (data) => {
    const { username, imgDataUrl } = data;
    const isMe = username === usernameInput.value;
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', isMe ? 'me' : 'other');

    msgDiv.innerHTML = `<span class="user">${username}</span><img src="${imgDataUrl}" style="max-width: 100%; border-radius: 8px; margin-top: 4px; border: 1px solid rgba(255,255,255,0.1);">`;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// --- Winks Logic ---
const winksMap = { 'laugh': '🤣', 'heart': '💖', 'knock': '🔔' };
const synth = window.speechSynthesis;

function triggerWink(winkId) {
    const icon = winksMap[winkId];
    if (icon) {
        winkOverlay.innerHTML = `<div class="wink-anim">${icon}</div>`;
        winkOverlay.style.pointerEvents = 'auto';
        setTimeout(() => winkOverlay.style.pointerEvents = 'none', 3000);
        
        if (winkId === 'knock') {
            document.body.classList.add('shake');
            setTimeout(() => document.body.classList.remove('shake'), 500);
            
            let u = new SpeechSynthesisUtterance("Chamando atenção!");
            u.lang = "pt-BR";
            synth.speak(u);
        } else if (winkId === 'laugh') {
            let u = new SpeechSynthesisUtterance("Hahaha!");
            u.pitch = 1.5;
            synth.speak(u);
        } else if (winkId === 'heart') {
            let u = new SpeechSynthesisUtterance("Muááah!");
            u.lang = "pt-BR";
            synth.speak(u);
        }
    }
}

winkBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        socket.emit('send-wink', btn.getAttribute('data-wink'));
    });
});

socket.on('receive-wink', (winkId) => triggerWink(winkId));
