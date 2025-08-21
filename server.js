const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new socketIo.Server(server);

const CORRECT_PASSWORD = "46368";
const COOLDOWN_SECONDS = 60;

const activePlayerNames = new Set();
const socketIdToPlayerName = new Map();
const cooldowns = new Map();
const playerSocketMap = new Map();
const submissionLogs = [];

app.use(express.static(path.join(__dirname, 'public')));

// Route cho trang admin chính (giữ nguyên)
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// --- ĐÃ XÓA: Route cho /admin/log không còn cần thiết ---

const adminIo = io.of('/admin');
adminIo.on('connection', (socket) => {
    console.log('Một admin đã kết nối.');
    socket.emit('currentPlayers', Array.from(activePlayerNames));
    socket.emit('fullLogHistory', submissionLogs);
});

// Kênh giao tiếp của người chơi
io.on('connection', (socket) => {
    socket.on('registerPlayer', (data) => { /* ... không đổi ... */ });
    socket.on('joinGame', (data) => { /* ... không đổi ... */ });

    socket.on('submitPassword', (data) => {
        const now = Date.now();
        const persistentId = playerSocketMap.get(socket.id);
        const playerName = socketIdToPlayerName.get(socket.id);
        if (!persistentId || !playerName) return;

        if (cooldowns.has(persistentId) && now < cooldowns.get(persistentId)) return;
        cooldowns.delete(persistentId);

        const isCorrect = data.passwordAttempt === CORRECT_PASSWORD;

        const logEntry = {
            timestamp: new Date().toLocaleTimeString('vi-VN'),
            playerName: playerName,
            isCorrect: isCorrect
        };
        submissionLogs.push(logEntry);
        adminIo.emit('newLogEntry', logEntry);

        if (isCorrect) {
            io.emit('treasureOpened', { message: `Chúc mừng "${playerName}" đã mở được kho báu!` });
            cooldowns.clear();
            adminIo.emit('correctAttempt', playerName);
        } else {
            const cooldownUntil = now + COOLDOWN_SECONDS * 1000;
            cooldowns.set(persistentId, cooldownUntil);
            socket.emit('wrongPassword', { message: `Mật mã sai! Vui lòng thử lại sau ${COOLDOWN_SECONDS} giây.`, cooldown: COOLDOWN_SECONDS });
            adminIo.emit('wrongAttempt', playerName);
        }
    });

    socket.on('disconnect', () => { /* ... không đổi ... */ });

    // Các hàm cũ để đảm bảo không thiếu
    socket.on('registerPlayer', (data) => { const { persistentId } = data; if (!persistentId) return; playerSocketMap.set(socket.id, persistentId); const now = Date.now(); if (cooldowns.has(persistentId) && now < cooldowns.get(persistentId)) { const timeLeft = Math.ceil((cooldowns.get(persistentId) - now) / 1000); socket.emit('cooldownActive', { message: `Bạn phải đợi ${timeLeft} giây nữa để thử lại.`, cooldown: timeLeft }); } });
    socket.on('joinGame', (data) => { const playerName = data.playerName.trim(); if (activePlayerNames.has(playerName)) { socket.emit('joinError', { message: `Tên tài khoản "${playerName}" đã được sử dụng!` }); } else { activePlayerNames.add(playerName); socketIdToPlayerName.set(socket.id, playerName); console.log(`Người chơi "${playerName}" đã tham gia.`); socket.emit('joinSuccess', { playerName: playerName }); adminIo.emit('playerJoined', playerName); } });
    socket.on('disconnect', () => { const playerName = socketIdToPlayerName.get(socket.id); if (playerName) { activePlayerNames.delete(playerName); socketIdToPlayerName.delete(socket.id); console.log(`Người chơi "${playerName}" đã ngắt kết nối.`); adminIo.emit('playerLeft', playerName); } playerSocketMap.delete(socket.id); });
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
});