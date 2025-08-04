const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new socketIo.Server(server);

const CORRECT_PASSWORD = "46368";
const COOLDOWN_SECONDS = 60;

// THAY ĐỔI: Chuyển sang dùng persistentId làm key
const cooldowns = new Map(); // Map<persistentId, cooldownEndTime>

// THAY ĐỔI MỚI: Map để liên kết socket.id tạm thời với persistentId
const playerSocketMap = new Map(); // Map<socket.id, persistentId>

app.use(express.static(__dirname + '/public'));

io.on('connection', (socket) => {
    console.log('Một người chơi mới đã kết nối:', socket.id);

    // THAY ĐỔI MỚI: Lắng nghe sự kiện đăng ký từ client
    socket.on('registerPlayer', (data) => {
        const { persistentId } = data;
        if (!persistentId) return;

        console.log(`Socket ${socket.id} được định danh là ${persistentId}`);
        playerSocketMap.set(socket.id, persistentId);

        // Kiểm tra ngay xem người chơi này có đang bị cooldown từ lần trước không
        const now = Date.now();
        if (cooldowns.has(persistentId) && now < cooldowns.get(persistentId)) {
            const timeLeft = Math.ceil((cooldowns.get(persistentId) - now) / 1000);
            socket.emit('cooldownActive', {
                message: `Bạn phải đợi ${timeLeft} giây nữa để thử lại.`,
                cooldown: timeLeft
            });
        }
    });

    socket.on('submitPassword', (data) => {
        const { playerName, passwordAttempt } = data;
        const now = Date.now();

        // THAY ĐỔI: Lấy persistentId từ map thay vì dùng socket.id
        const persistentId = playerSocketMap.get(socket.id);
        if (!persistentId) {
            // Trường hợp client chưa kịp đăng ký
            return; 
        }

        // Kiểm tra cooldown dựa trên persistentId
        if (cooldowns.has(persistentId) && now < cooldowns.get(persistentId)) {
            // Không cần gửi lại, vì đã gửi lúc registerPlayer hoặc lúc submit sai
            return;
        }
        cooldowns.delete(persistentId); // Xóa cooldown cũ nếu có

        if (passwordAttempt === CORRECT_PASSWORD) {
            io.emit('treasureOpened', {
                message: `Chúc mừng "${playerName}" đã mở được kho báu!`
            });
            // Xóa hết cooldown của mọi người khi kho báu đã mở
            cooldowns.clear();
        } else {
            const cooldownUntil = now + COOLDOWN_SECONDS * 1000;
            // Đặt cooldown dựa trên persistentId
            cooldowns.set(persistentId, cooldownUntil);

            console.log(`Người chơi ${persistentId} nhập sai và bị cooldown.`);
            socket.emit('wrongPassword', {
                message: `Mật khẩu sai! Vui lòng thử lại sau ${COOLDOWN_SECONDS} giây.`,
                cooldown: COOLDOWN_SECONDS
            });
        }
    });

    socket.on('disconnect', () => {
        // THAY ĐỔI: Xóa khỏi map khi ngắt kết nối, nhưng giữ lại cooldown
        console.log(`Người chơi ${playerSocketMap.get(socket.id)} đã ngắt kết nối.`);
        playerSocketMap.delete(socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
});