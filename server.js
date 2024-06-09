const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { Chess } = require('chess.js');

const app = express();
app.use(cors({
  origin: 'http://localhost:3000'
}));

const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

let games = {};

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('createGame', () => {
    try {
      const gameId = uuidv4();
      games[gameId] = {
        game: new Chess(),
        players: [socket.id],
      };
      socket.join(gameId);
      socket.emit('gameCreated', { gameId, color: 'w' });
      console.log(`Game created with ID: ${gameId}`);
    } catch (error) {
      console.error('Error creating game:', error);
      socket.emit('error', 'Error creating game.');
    }
  });

  socket.on('joinGame', (gameId) => {
    try {
      const game = games[gameId];
      if (game) {
        if (!game.players.includes(socket.id)) {
          if (game.players.length < 2) {
            game.players.push(socket.id);
            socket.join(gameId);
            const color = game.players[0] === socket.id ? 'w' : 'b';
            socket.emit('gameJoined', { gameId, color, fen: game.game.fen() });
            console.log(`Client ${socket.id} joined game ${gameId} as ${color}`);
            if (game.players.length === 2) {
              io.to(gameId).emit('startGame', { fen: game.game.fen() });
            }
          } else {
            console.warn(`Game ${gameId} is full.`);
            socket.emit('error', 'Game is full.');
          }
        } else {
          console.warn(`Client ${socket.id} is already part of game ${gameId}.`);
          socket.emit('error', 'You are already part of this game.');
        }
      } else {
        console.warn(`Game ${gameId} does not exist.`);
        socket.emit('error', 'Game does not exist.');
      }
    } catch (error) {
      console.error('Error joining game:', error);
      socket.emit('error', 'Error joining game.');
    }
  });

  socket.on('makeMove', ({ gameId, move }) => {
    try {
      const game = games[gameId];
      if (game) {
        const result = game.game.move(move);
        if (result) {
          io.to(gameId).emit('moveMade', { fen: game.game.fen(), move });
          console.log(`Move made in game ${gameId}: ${move}`);
        } else {
          console.warn(`Invalid move in game ${gameId}`);
          socket.emit('invalidMove', game.game.fen());
        }
      } else {
        console.warn(`Game ${gameId} does not exist.`);
        socket.emit('error', 'Game does not exist.');
      }
    } catch (error) {
      console.error('Error making move:', error);
      socket.emit('error', 'Error making move.');
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    for (const gameId in games) {
      const game = games[gameId];
      game.players = game.players.filter(player => player !== socket.id);
      if (game.players.length === 0) {
        delete games[gameId];
        console.log(`Game ${gameId} deleted due to no players.`);
      }
    }
  });
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
