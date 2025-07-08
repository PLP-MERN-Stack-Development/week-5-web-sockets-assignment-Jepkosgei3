import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Message from './models/Message.js';
import Room from './models/Room.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

// ✅ Allow specific origins
const allowedOrigins = [
  'https://congenial-goldfish-jp54xrqprpj35rrg-5173.app.github.dev',
  'http://localhost:5173',
];

// ✅ Global CORS middleware with logging
app.use((req, res, next) => {
  const origin = req.headers.origin || 'no-origin';
  console.log(`📥 Checking CORS for ${req.method} ${req.url} from ${origin}`);
  console.log('📋 Request headers:', req.headers);
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    console.log(`📤 CORS headers set for ${origin}`);
  } else {
    console.log(`⚠️ Origin not allowed: ${origin}`);
  }
  next();
});

app.use(express.json());

// ✅ Mongo
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/chatapp')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ✅ Debug incoming requests
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.url} from ${req.get('Origin') || 'no-origin'}`);
  next();
});

// ✅ Route-specific CORS for /rooms
app.options('/rooms', (req, res) => {
  const origin = req.headers.origin || 'no-origin';
  console.log(`📥 OPTIONS preflight for /rooms from ${origin}`);
  console.log('📋 Preflight headers:', req.headers);
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    console.log(`📤 Preflight CORS headers set for ${origin}`);
  } else {
    console.log(`⚠️ Preflight origin not allowed: ${origin}`);
  }
  res.status(200).end();
});

app.get('/rooms', async (req, res) => {
  try {
    const rooms = await Room.find();
    console.log('📤 Sending rooms:', rooms);
    res.json(rooms);
  } catch (err) {
    console.error('❌ Error fetching rooms:', err);
    res.status(500).json({ message: 'Error fetching rooms' });
  }
});

app.post('/rooms', async (req, res) => {
  try {
    console.log('📥 Received POST /rooms with headers:', req.headers);
    console.log('📥 Received POST /rooms body:', req.body);
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Room name is required' });

    let room = await Room.findOne({ name });
    if (room) return res.status(400).json({ message: 'Room already exists' });

    room = new Room({ name });
    await room.save();
    console.log('📤 Room created:', room);
    res.status(201).json(room);
  } catch (err) {
    console.error('❌ Error creating room:', err);
    res.status(500).json({ message: 'Error creating room' });
  }
});

app.delete('/rooms/:name', async (req, res) => {
  try {
    const { name } = req.params;
    if (!name) return res.status(400).json({ message: 'Room name is required' });

    const room = await Room.findOneAndDelete({ name });
    if (!room) return res.status(404).json({ message: 'Room not found' });

    await Message.deleteMany({ room: name });
    console.log('📤 Room deleted:', name);
    res.status(200).json({ message: 'Room deleted successfully' });
  } catch (err) {
    console.error('❌ Error deleting room:', err);
    res.status(500).json({ message: 'Error deleting room' });
  }
});

// ✅ Socket.io
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'DELETE'],
    credentials: true,
  },
});

io.on('connection', (socket) => {
  console.log('🟢 User connected:', socket.id);

  socket.on('joinRoom', async ({ room, username }) => {
    socket.join(room);
    const history = await Message.find({ room }).sort({ timestamp: -1 }).limit(50).lean();
    socket.emit('chatHistory', history.reverse());
  });

  socket.on('chatMessage', async ({ message, room, username }) => {
    const msg = new Message({ message, room, username });
    await msg.save();
    io.to(room).emit('newMessage', {
      message,
      username,
      room,
      timestamp: msg.timestamp,
    });
  });

  socket.on('typing', ({ room, username, isTyping }) => {
    socket.to(room).emit('typingStatus', { username, isTyping });
  });

  socket.on('disconnect', () => {
    console.log('🔴 User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));