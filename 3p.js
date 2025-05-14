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

// The win patterns (three in a row)
const WIN_PATTERNS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6]             // diagonals
];

// Check if there's a winner (three in a row)
function checkWinner(board) {
  for (const pattern of WIN_PATTERNS) {
    const [a, b, c] = pattern;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  
  return null;
}

// Find a winning move for the given player
function findWinningMove(board, player) {
  // Check each win pattern
  for (const pattern of WIN_PATTERNS) {
    const [a, b, c] = pattern;
    
    // Check if this pattern has two of player's pieces and an empty space
    if (board[a] === player && board[b] === player && board[c] === null) {
      return c;
    }
    if (board[a] === player && board[c] === player && board[b] === null) {
      return b;
    }
    if (board[b] === player && board[c] === player && board[a] === null) {
      return a;
    }
  }
  
  return null;
}

// Start a new game
app.post('/start3', (req, res) => {
  const gameId = uuidv4();
  const { vsComputer, computerDifficulty } = req.body;
  
  games[gameId] = {
    board: Array(9).fill(null),
    currentPlayer: 'X',
    phase: 'placing',
    piecesPlaced: { X: 0, O: 0 },
    selectedPiece: null,
    vsComputer: vsComputer || false,
    computerDifficulty: computerDifficulty || 'medium'
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
  
  game.selectedPiece = parseInt(position);
  
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

// Computer move endpoint
app.post('/computer-move', (req, res) => {
  const { gameId, difficulty } = req.body;
  
  if (!games[gameId]) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  const game = games[gameId];
  
  if (game.currentPlayer !== 'X') {
    return res.status(400).json({ error: 'Not computer\'s turn' });
  }
  
  try {
    if (game.phase === 'placing') {
      // Computer makes a placing move
      makeComputerPlacingMove(game, difficulty);
    } else {
      // Computer makes a moving move
      makeComputerMovingMove(game, difficulty);
    }
    
    // Check for winner after computer's move
    const winner = checkWinner(game.board);
    if (winner) {
      game.winner = winner;
      return res.json({ game, message: `${winner} wins!` });
    }
    
    // Switch to player's turn
    game.currentPlayer = 'O';
    
    res.json({ game });
  } catch (error) {
    res.status(500).json({ error: 'Error making computer move: ' + error.message });
  }
});

// Computer AI logic for placing phase
function makeComputerPlacingMove(game, difficulty) {
  const board = game.board;
  
  // If difficulty is set to hard, try to make a winning move or block player's winning move
  if (difficulty === 'hard') {
    // Check if computer can win in one move
    const winningMove = findWinningMove(board, 'X');
    if (winningMove !== null) {
      board[winningMove] = 'X';
      game.piecesPlaced.X++;
      return;
    }
    
    // Check if player can win in one move and block it
    const blockingMove = findWinningMove(board, 'O');
    if (blockingMove !== null) {
      board[blockingMove] = 'X';
      game.piecesPlaced.X++;
      return;
    }
  }
  
  // Medium and hard: strategic moves
  if (difficulty !== 'easy') {
    // Take center if available as it's connected to all positions
    if (board[4] === null) {
      board[4] = 'X';
      game.piecesPlaced.X++;
      return;
    }
    
    // Take a corner if one is available (better strategic position)
    const corners = [0, 2, 6, 8].filter(pos => board[pos] === null);
    if (corners.length > 0) {
      const randomCorner = corners[Math.floor(Math.random() * corners.length)];
      board[randomCorner] = 'X';
      game.piecesPlaced.X++;
      return;
    }
  }
  
  // Fallback: place randomly (easy difficulty or if no strategic move available)
  const emptyPositions = board.map((val, idx) => val === null ? idx : -1).filter(idx => idx !== -1);
  if (emptyPositions.length > 0) {
    const randomPosition = emptyPositions[Math.floor(Math.random() * emptyPositions.length)];
    board[randomPosition] = 'X';
    game.piecesPlaced.X++;
  }
}

// Computer AI logic for moving phase
function makeComputerMovingMove(game, difficulty) {
  const board = game.board;
  
  // Find all computer pieces on the board
  const computerPieces = board.map((val, idx) => val === 'X' ? idx : -1).filter(idx => idx !== -1);
  
  // Choose the best move based on difficulty
  if (difficulty === 'hard' || difficulty === 'medium') {
    // Try to find a winning move
    for (const piecePos of computerPieces) {
      const validMoves = ADJACENCY[piecePos].filter(pos => board[pos] === null);
      
      for (const movePos of validMoves) {
        // Simulate the move to check if it results in a win
        board[movePos] = 'X';
        board[piecePos] = null;
        
        const isWinningMove = checkWinner(board) === 'X';
        
        // Undo the move
        board[piecePos] = 'X';
        board[movePos] = null;
        
        if (isWinningMove) {
          // Make the winning move
          board[movePos] = 'X';
          board[piecePos] = null;
          return;
        }
      }
    }
    
    // No winning move found
    if (difficulty === 'hard') {
      // Try to block player's potential winning moves (hard difficulty only)
      // This is more complex in the moving phase, as we'd need to simulate 
      // the player's next move after our move
      
      // For now, move to center if possible, as it's strategically valuable
      for (const piecePos of computerPieces) {
        if (ADJACENCY[piecePos].includes(4) && board[4] === null) {
          board[4] = 'X';
          board[piecePos] = null;
          return;
        }
      }
      
      // Or move to a corner if possible
      const corners = [0, 2, 6, 8];
      for (const piecePos of computerPieces) {
        for (const corner of corners) {
          if (ADJACENCY[piecePos].includes(corner) && board[corner] === null) {
            board[corner] = 'X';
            board[piecePos] = null;
            return;
          }
        }
      }
    }
  }
  
  // Fallback: make a random valid move (used for easy difficulty or if no strategic move found)
  // Shuffle the pieces array to add randomness
  for (let i = computerPieces.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [computerPieces[i], computerPieces[j]] = [computerPieces[j], computerPieces[i]];
  }
  
  // Try each piece until a valid move is found
  for (const piecePos of computerPieces) {
    const validMoves = ADJACENCY[piecePos].filter(pos => board[pos] === null);
    
    if (validMoves.length > 0) {
      const randomMovePos = validMoves[Math.floor(Math.random() * validMoves.length)];
      board[randomMovePos] = 'X';
      board[piecePos] = null;
      return;
    }
  }
  
  // If no valid move found, the game is in a stalemate (shouldn't happen in Three Men's Morris)
  throw new Error('No valid move available for computer');
}

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
