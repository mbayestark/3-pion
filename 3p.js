const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory game storage
const games = {};

// Define board positions and adjacency
const ADJACENCY = {
  '0': [1, 3, 4],
  '1': [0, 2, 4],
  '2': [1, 4, 5],
  '3': [0, 4, 6],
  '4': [0, 1, 2, 3, 5, 6, 7, 8],
  '5': [2, 4, 8],
  '6': [3, 4, 7],
  '7': [4, 6, 8],
  '8': [4, 5, 7]
};

// Check if there's a winner (three in a row)
function checkWinner(board) {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
    [0, 4, 8], [2, 4, 6]             // diagonals
  ];

  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  
  return null;
}

// Start a new game
app.post('/start3', (req, res) => {
  const gameId = uuidv4();
  games[gameId] = {
    board: Array(9).fill(null),
    currentPlayer: 'X',
    phase: 'placing',
    piecesPlaced: { X: 0, O: 0 },
    selectedPiece: null
  };
  
  res.json({ gameId, game: games[gameId] });
});

// Get game state
app.get('/game/:id', (req, res) => {
  const gameId = req.params.id;
  if (!games[gameId]) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  res.json({ game: games[gameId] });
});

// Place a piece (during placing phase)
app.post('/place', (req, res) => {
  const { gameId, position } = req.body;
  
  if (!games[gameId]) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  const game = games[gameId];
  
  if (game.phase !== 'placing') {
    return res.status(400).json({ error: 'Game is not in placing phase' });
  }
  
  if (game.board[position] !== null) {
    return res.status(400).json({ error: 'Position already occupied' });
  }
  
  // Place the piece
  game.board[position] = game.currentPlayer;
  game.piecesPlaced[game.currentPlayer]++;
  
  // Check for winner after placement
  const winner = checkWinner(game.board);
  if (winner) {
    game.winner = winner;
    res.json({ game, message: `${winner} wins!` });
    return;
  }
  
  // Check if all pieces have been placed
  if (game.piecesPlaced.X === 3 && game.piecesPlaced.O === 3) {
    game.phase = 'moving';
  }
  
  // Switch player
  game.currentPlayer = game.currentPlayer === 'X' ? 'O' : 'X';
  
  res.json({ game });
});

// Select a piece to move (first part of moving phase)
app.post('/select', (req, res) => {
  const { gameId, position } = req.body;
  
  if (!games[gameId]) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  const game = games[gameId];
  
  if (game.phase !== 'moving') {
    return res.status(400).json({ error: 'Game is not in moving phase' });
  }
  
  if (game.board[position] !== game.currentPlayer) {
    return res.status(400).json({ error: 'Not your piece' });
  }
  
  // Get valid moves for the selected piece
  const validMoves = ADJACENCY[position].filter(pos => game.board[pos] === null);
  
  if (validMoves.length === 0) {
    return res.status(400).json({ error: 'This piece has no valid moves' });
  }
  
  game.selectedPiece = position;
  
  res.json({ game, validMoves });
});

// Move a piece (second part of moving phase)
app.post('/move3', (req, res) => {
  const { gameId, fromPosition, toPosition } = req.body;
  
  if (!games[gameId]) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  const game = games[gameId];
  
  if (game.phase !== 'moving') {
    return res.status(400).json({ error: 'Game is not in moving phase' });
  }
  
  if (game.board[fromPosition] !== game.currentPlayer) {
    return res.status(400).json({ error: 'Not your piece' });
  }
  
  if (game.board[toPosition] !== null) {
    return res.status(400).json({ error: 'Destination position is occupied' });
  }
  
  // Check if the move is valid (adjacent)
  if (!ADJACENCY[fromPosition].includes(Number(toPosition))) {
    return res.status(400).json({ error: 'Invalid move. Positions must be adjacent' });
  }
  
  // Move the piece
  game.board[toPosition] = game.currentPlayer;
  game.board[fromPosition] = null;
  game.selectedPiece = null;
  
  // Check for winner after movement
  const winner = checkWinner(game.board);
  if (winner) {
    game.winner = winner;
    res.json({ game, message: `${winner} wins!` });
    return;
  }
  
  // Switch player
  game.currentPlayer = game.currentPlayer === 'X' ? 'O' : 'X';
  
  res.json({ game });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
