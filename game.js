/**
 * game.js - Wordy! Game Engine
 *
 * Full implementation of Stages 1–9:
 * - Clean 6x5 grid initialisation with Cosy Pop aesthetics
 * - Random target word selection (avoiding previous word on Play Again)
 * - Harmonised physical and on-screen keyboard letter entry & deletion
 * - Completeness check and dictionary validation against VALID_WORDS
 * - Shake animation & accessible toast alerts for invalid submissions
 * - Two-pass green/yellow/grey colour evaluation with repeated letter precision
 * - Permanent tile colour reveals and active row advancement
 * - Stage 6: Real-time on-screen keyboard colour updates (green > yellow > grey)
 * - Stage 7: End-game detection (congratulations on win, reveal secret on loss),
 *            and Play Again reset mechanism
 * - Stage 8: Hint system unlocking after 3 unsuccessful guesses, revealing one
 *            unidentified correct letter in place, permanently locked across remaining rows
 * - Stage 9: Polish, responsive ergonomics, and complete accessibility attributes
 */

/* ── Game Constants ── */
const WORD_LENGTH = 5;
const MAX_GUESSES = 6;
const HINTS_UNLOCK_THRESHOLD = 3;

/* ── Centralised Game State ── */
const gameState = {
  targetWord: '',           // Secret 5-letter target word
  previousWord: '',         // Previous target word to prevent consecutive duplicates
  currentRow: 0,            // Active row index (0 to 5)
  board: [],                // 6x5 matrix of cells: { letter: '', status: '', locked: false }
  letterStatuses: {},       // Map of letter -> 'correct' | 'present' | 'absent'
  gameOver: false,          // True when game concludes (won or lost)
  won: false,               // True when player guesses secret word
  hintUsed: false,          // True once player has activated hint
  unsuccessfulGuesses: 0,   // Count of submitted rows that did not win
  fixedHintPositions: {}    // Map of colIndex -> letter for locked hints
};

/* ── DOM Element Cache ── */
let gridElement = null;
let statusElement = null;
let hintButtonElement = null;
let hintCaptionElement = null;
let messageAreaElement = null;
let messageTextElement = null;
let playAgainBtnElement = null;
let keyboardElement = null;
let toastElement = null;
let toastTimer = null;

/**
 * Initialises a fresh game session.
 * Resets state, selects a random target word, and prepares the visual grid.
 */
function initGame() {
  // 1. Cache key DOM elements
  gridElement = document.getElementById('grid');
  statusElement = document.getElementById('game-status');
  hintButtonElement = document.getElementById('hint-btn');
  hintCaptionElement = document.getElementById('hint-caption');
  messageAreaElement = document.getElementById('message-area');
  messageTextElement = document.getElementById('message-text');
  playAgainBtnElement = document.getElementById('play-again-btn');
  keyboardElement = document.getElementById('keyboard');
  toastElement = document.getElementById('toast');

  // 2. Select a random secret word from ANSWER_WORDS (avoiding immediate repeat)
  if (typeof ANSWER_WORDS !== 'undefined' && ANSWER_WORDS.length > 0) {
    let chosenWord = '';
    let attempts = 0;
    do {
      const randomIndex = Math.floor(Math.random() * ANSWER_WORDS.length);
      chosenWord = ANSWER_WORDS[randomIndex];
      attempts++;
    } while (chosenWord === gameState.previousWord && attempts < 10 && ANSWER_WORDS.length > 1);

    gameState.previousWord = gameState.targetWord;
    gameState.targetWord = chosenWord;
    console.log(`[Game Initialised] Target word selected: "${gameState.targetWord}"`);
  } else {
    console.error('[Game Initialised Error] ANSWER_WORDS is missing or empty.');
    gameState.targetWord = 'crane'; // Fallback
  }

  // 3. Reset state variables
  gameState.currentRow = 0;
  gameState.gameOver = false;
  gameState.won = false;
  gameState.hintUsed = false;
  gameState.unsuccessfulGuesses = 0;
  gameState.fixedHintPositions = {};
  gameState.letterStatuses = {};

  // 4. Initialise 6x5 board data structure
  gameState.board = [];
  for (let r = 0; r < MAX_GUESSES; r++) {
    const row = [];
    for (let c = 0; c < WORD_LENGTH; c++) {
      row.push({
        letter: '',
        status: '',
        locked: false
      });
    }
    gameState.board.push(row);
  }

  // 5. Update visual status indicator
  updateStatusDisplay();

  // 6. Refresh the DOM tiles for all 6 rows
  syncBoardDOM();

  // 7. Reset keyboard key colours
  resetKeyboardDOM();

  // 8. Reset Hint controls
  updateHintUI();

  // 9. Reset Message area and Toast
  if (messageAreaElement) {
    messageAreaElement.classList.add('hidden');
  }
  if (messageTextElement) {
    messageTextElement.textContent = '';
  }
  if (toastElement) {
    toastElement.classList.add('hidden');
  }

  // 10. Attach event listeners (guarded to only attach once)
  setupInputListeners();
}

/**
 * Updates the guess counter in the status pill.
 */
function updateStatusDisplay() {
  if (statusElement) {
    if (gameState.gameOver) {
      statusElement.textContent = gameState.won ? '🎉 Winner!' : 'Game Over';
    } else {
      statusElement.textContent = `✏️ Guess ${gameState.currentRow + 1} of ${MAX_GUESSES}`;
    }
  }
}

/**
 * Synchronises visual grid tiles with the internal gameState.board.
 * Applies proper CSS classes (.active, .filled, .correct, .present, .absent, .locked).
 */
function syncBoardDOM() {
  if (!gridElement) return;

  const rows = gridElement.querySelectorAll('.grid-row');
  for (let r = 0; r < rows.length; r++) {
    const rowEl = rows[r];
    const tiles = rowEl.querySelectorAll('.tile');
    const isCurrentRow = r === gameState.currentRow;

    for (let c = 0; c < tiles.length; c++) {
      const tile = tiles[c];
      const cellData = gameState.board[r][c];

      // Reset tile class list preserving base 'tile'
      tile.className = 'tile';

      // Mark tiles in the current active row
      if (isCurrentRow && !gameState.gameOver) {
        tile.classList.add('active');
      }

      // Evaluated status (completed row)
      if (cellData.status) {
        tile.classList.add(cellData.status);
      }

      // Locked hint tile
      if (cellData.locked) {
        tile.classList.add('locked');
      }

      // Display letter
      if (cellData.letter) {
        tile.textContent = cellData.letter.toUpperCase();
        if (!cellData.status && !cellData.locked) {
          tile.classList.add('filled');
        }
        tile.setAttribute('aria-label', cellData.letter.toUpperCase());
      } else {
        tile.textContent = '';
        tile.setAttribute('aria-label', 'empty');
      }
    }
  }
}

/**
 * Resets all on-screen keyboard keys to default styling.
 */
function resetKeyboardDOM() {
  if (!keyboardElement) return;
  const keys = keyboardElement.querySelectorAll('.key');
  keys.forEach(k => {
    k.classList.remove('correct', 'present', 'absent');
  });
}

/**
 * Updates on-screen keyboard colours following the status priority rule:
 * green (correct) > yellow (present) > grey (absent).
 * Keys are never downgraded to a lower priority.
 *
 * @param {string} guess - The 5-letter submitted guess
 * @param {string[]} results - Array of 5 status strings ('correct', 'present', 'absent')
 */
function updateKeyboardColours(guess, results) {
  if (!keyboardElement) return;

  const priority = { correct: 3, present: 2, absent: 1, none: 0 };

  for (let i = 0; i < WORD_LENGTH; i++) {
    const letter = guess[i].toLowerCase();
    const newStatus = results[i];
    const currentStatus = gameState.letterStatuses[letter] || 'none';

    // Upgrade status if new status has higher priority
    if (priority[newStatus] > priority[currentStatus]) {
      gameState.letterStatuses[letter] = newStatus;
    }
  }

  // Reflect updated statuses on on-screen keyboard buttons
  const keys = keyboardElement.querySelectorAll('.key[data-key]');
  keys.forEach(btn => {
    const keyAttr = btn.getAttribute('data-key');
    if (!keyAttr || keyAttr.length !== 1) return; // Ignore Enter & Backspace
    const letter = keyAttr.toLowerCase();
    const status = gameState.letterStatuses[letter];

    if (status) {
      btn.classList.remove('correct', 'present', 'absent');
      btn.classList.add(status);
    }
  });
}

/**
 * Central input handler for physical and on-screen keyboard inputs.
 * @param {string} key - Key name ('a'-'z', 'Backspace', 'Enter')
 */
function handleInput(key) {
  if (gameState.gameOver) return;

  if (key === 'Backspace') {
    removeLetter();
  } else if (key === 'Enter') {
    submitGuess();
  } else if (/^[a-zA-Z]$/.test(key)) {
    addLetter(key.toLowerCase());
  }
}

/**
 * Adds a letter to the next available unlocked position in the active row.
 * Preserves pre-filled locked hint cells.
 * @param {string} letter - Single lowercase letter character
 */
function addLetter(letter) {
  if (gameState.gameOver) return;

  const row = gameState.board[gameState.currentRow];
  if (!row) return;

  // Find first empty, unlocked cell in the active row
  let targetCol = -1;
  for (let c = 0; c < WORD_LENGTH; c++) {
    if (!row[c].locked && !row[c].letter) {
      targetCol = c;
      break;
    }
  }

  if (targetCol === -1) return; // Row full

  row[targetCol].letter = letter;

  // Direct DOM update for immediate feedback
  const rows = gridElement.querySelectorAll('.grid-row');
  const targetRowEl = rows[gameState.currentRow];
  if (targetRowEl) {
    const tiles = targetRowEl.querySelectorAll('.tile');
    const tile = tiles[targetCol];
    if (tile) {
      tile.textContent = letter.toUpperCase();
      tile.classList.add('filled');
      tile.setAttribute('aria-label', letter.toUpperCase());
    }
  }
}

/**
 * Removes the most recently entered unlocked letter from the active row.
 * Preserves locked hint letters so they cannot be deleted.
 */
function removeLetter() {
  if (gameState.gameOver) return;

  const row = gameState.board[gameState.currentRow];
  if (!row) return;

  // Search from right to left for latest unlocked letter
  let targetCol = -1;
  for (let c = WORD_LENGTH - 1; c >= 0; c--) {
    if (!row[c].locked && row[c].letter) {
      targetCol = c;
      break;
    }
  }

  if (targetCol === -1) return; // Nothing removable

  row[targetCol].letter = '';

  // Direct DOM update
  const rows = gridElement.querySelectorAll('.grid-row');
  const targetRowEl = rows[gameState.currentRow];
  if (targetRowEl) {
    const tiles = targetRowEl.querySelectorAll('.tile');
    const tile = tiles[targetCol];
    if (tile) {
      tile.textContent = '';
      tile.classList.remove('filled');
      tile.setAttribute('aria-label', 'empty');
    }
  }
}

/**
 * Evaluates a 5-letter guess against the secret target word using a two-pass algorithm.
 *
 * Pass 1: Identifies exact matches ('correct' / green).
 * Pass 2: Identifies partial matches ('present' / yellow) and absences ('absent' / grey).
 *
 * @param {string} guess - 5-letter guess string
 * @param {string} target - 5-letter secret target word
 * @returns {string[]} Array of 5 status strings: 'correct' | 'present' | 'absent'
 */
function evaluateGuess(guess, target) {
  const g = guess.toLowerCase();
  const t = target.toLowerCase();
  const results = new Array(WORD_LENGTH).fill('absent');
  const targetMatched = new Array(WORD_LENGTH).fill(false);

  // Pass 1: Exact matches (Green)
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (g[i] === t[i]) {
      results[i] = 'correct';
      targetMatched[i] = true;
    }
  }

  // Pass 2: Present in wrong position (Yellow) or Absent (Grey)
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (results[i] === 'correct') continue;

    let foundMatch = false;
    for (let j = 0; j < WORD_LENGTH; j++) {
      if (!targetMatched[j] && g[i] === t[j]) {
        targetMatched[j] = true;
        foundMatch = true;
        break;
      }
    }
    results[i] = foundMatch ? 'present' : 'absent';
  }

  return results;
}

/**
 * Submits the current active row for evaluation.
 */
function submitGuess() {
  if (gameState.gameOver) return;

  const row = gameState.board[gameState.currentRow];
  if (!row) return;

  // 1. Check that all 5 tiles contain letters
  const letters = row.map(cell => cell.letter);
  const isComplete = letters.every(l => l && l.length === 1);

  if (!isComplete) {
    showToast('Not enough letters!');
    shakeRow(gameState.currentRow);
    return;
  }

  const guess = letters.join('').toLowerCase();

  // 2. Validate against VALID_WORDS dictionary
  const isValidWord = typeof VALID_WORDS !== 'undefined' && VALID_WORDS.includes(guess);

  if (!isValidWord) {
    showToast('Not in word list!');
    shakeRow(gameState.currentRow);
    return;
  }

  // 3. Evaluate guess
  const results = evaluateGuess(guess, gameState.targetWord);

  // 4. Update board state with evaluated results
  for (let c = 0; c < WORD_LENGTH; c++) {
    row[c].status = results[c];
  }

  // 5. Update DOM tiles for current row
  const rows = gridElement.querySelectorAll('.grid-row');
  const currentRowEl = rows[gameState.currentRow];
  if (currentRowEl) {
    const tiles = currentRowEl.querySelectorAll('.tile');
    for (let c = 0; c < WORD_LENGTH; c++) {
      const tile = tiles[c];
      const status = results[c];
      const letter = row[c].letter.toUpperCase();

      tile.classList.remove('active', 'filled');
      tile.classList.add(status);

      const statusDesc = status === 'correct' ? 'correct' : (status === 'present' ? 'in wrong position' : 'not in word');
      tile.setAttribute('aria-label', `${letter}, ${statusDesc}`);
    }
  }

  // 6. Update on-screen keyboard colours (Stage 6)
  updateKeyboardColours(guess, results);

  // 7. Check for win
  const isWin = results.every(s => s === 'correct');

  if (isWin) {
    gameState.won = true;
    gameState.gameOver = true;
    updateStatusDisplay();
    endGame(true);
    return;
  }

  // 8. Advance on unsuccessful guess
  gameState.unsuccessfulGuesses++;
  gameState.currentRow++;

  // Update hint availability UI (Stage 8)
  updateHintUI();

  // 9. Check if attempts are exhausted (Loss)
  if (gameState.currentRow >= MAX_GUESSES) {
    gameState.gameOver = true;
    updateStatusDisplay();
    endGame(false);
    return;
  }

  // Update status pill for next attempt
  updateStatusDisplay();

  // 10. Activate next row and pre-populate any locked hint letters
  const nextRow = gameState.board[gameState.currentRow];
  for (const colStr in gameState.fixedHintPositions) {
    const colIndex = parseInt(colStr, 10);
    const hintChar = gameState.fixedHintPositions[colIndex];
    nextRow[colIndex].letter = hintChar;
    nextRow[colIndex].locked = true;
  }

  // Refresh DOM to show active row styling & locked hints
  syncBoardDOM();
}

/**
 * Handles end-of-game messaging and reveals the Play Again button (Stage 7).
 * @param {boolean} won - True if the player won, false if attempts ran out
 */
function endGame(won) {
  if (!messageAreaElement || !messageTextElement) return;

  if (won) {
    const attempts = gameState.currentRow + 1;
    const attemptText = attempts === 1 ? '1 guess' : `${attempts} guesses`;
    messageTextElement.textContent = `🎉 Splendid! You solved it in ${attemptText}!`;
  } else {
    messageTextElement.textContent = `Nice try! The secret word was ${gameState.targetWord.toUpperCase()}.`;
  }

  messageAreaElement.classList.remove('hidden');

  // Disable hint button on game over
  if (hintButtonElement) {
    hintButtonElement.disabled = true;
  }
}

/**
 * Updates the Hint button state and caption based on game progress (Stage 8).
 */
function updateHintUI() {
  if (!hintButtonElement || !hintCaptionElement) return;

  if (gameState.hintUsed) {
    hintButtonElement.disabled = true;
    hintButtonElement.classList.add('used');
    hintCaptionElement.textContent = '💡 Hint already used this game';
  } else if (gameState.unsuccessfulGuesses >= HINTS_UNLOCK_THRESHOLD && !gameState.gameOver) {
    hintButtonElement.disabled = false;
    hintButtonElement.classList.remove('disabled');
    hintCaptionElement.textContent = '✨ Ready! Reveal one correct letter';
  } else {
    hintButtonElement.disabled = true;
    const remaining = HINTS_UNLOCK_THRESHOLD - gameState.unsuccessfulGuesses;
    hintCaptionElement.textContent = `Available after ${remaining} more guess${remaining === 1 ? '' : 'es'}`;
  }
}

/**
 * Reveals one correctly positioned letter that the player has not yet identified (Stage 8).
 * Ensures the hint does not consume an attempt or auto-submit the row.
 * The revealed letter is permanently locked in that position for all remaining rows.
 */
function useHint() {
  if (gameState.gameOver || gameState.hintUsed || gameState.unsuccessfulGuesses < HINTS_UNLOCK_THRESHOLD) {
    return;
  }

  const target = gameState.targetWord;

  // Identify all positions already correctly identified by the player
  const identifiedPositions = new Set();

  // Check previous submitted rows for any greens
  for (let r = 0; r < gameState.currentRow; r++) {
    for (let c = 0; c < WORD_LENGTH; c++) {
      if (gameState.board[r][c].status === 'correct') {
        identifiedPositions.add(c);
      }
    }
  }

  // Also include any previously fixed hint positions
  for (const col in gameState.fixedHintPositions) {
    identifiedPositions.add(parseInt(col, 10));
  }

  // Find candidate positions that have NOT been identified yet
  const availablePositions = [];
  for (let c = 0; c < WORD_LENGTH; c++) {
    if (!identifiedPositions.has(c)) {
      availablePositions.push(c);
    }
  }

  // If player already found all 5 positions in previous rows (rare edge case), fallback to any position
  const chosenCol = availablePositions.length > 0
    ? availablePositions[Math.floor(Math.random() * availablePositions.length)]
    : 0;

  const hintLetter = target[chosenCol];

  // Mark hint as used
  gameState.hintUsed = true;
  gameState.fixedHintPositions[chosenCol] = hintLetter;

  // Lock into current row
  const currentRow = gameState.board[gameState.currentRow];
  currentRow[chosenCol].letter = hintLetter;
  currentRow[chosenCol].locked = true;

  // Update UI
  syncBoardDOM();
  updateHintUI();
  showToast(`Hint: Letter "${hintLetter.toUpperCase()}" placed!`);
}

/**
 * Triggers a brief horizontal shake animation on the specified row.
 * @param {number} rowIndex - Index of row to shake (0 to 5)
 */
function shakeRow(rowIndex) {
  if (!gridElement) return;
  const rows = gridElement.querySelectorAll('.grid-row');
  const rowEl = rows[rowIndex];
  if (!rowEl) return;

  rowEl.classList.remove('shake');
  void rowEl.offsetWidth; // Force DOM reflow
  rowEl.classList.add('shake');

  setTimeout(() => {
    rowEl.classList.remove('shake');
  }, 500);
}

/**
 * Displays a friendly toast notification to the player.
 * @param {string} message - Message text to display
 */
function showToast(message) {
  if (!toastElement) return;

  toastElement.textContent = message;
  toastElement.classList.remove('hidden');

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    toastElement.classList.add('hidden');
  }, 1800);
}

/**
 * Sets up global event listeners for physical and on-screen keyboard inputs.
 * Uses a guard flag to ensure listeners are only bound once.
 */
let listenersBound = false;
function setupInputListeners() {
  if (listenersBound) return;
  listenersBound = true;

  // 1. Physical Keyboard Listener
  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key;
    if (key === 'Backspace' || key === 'Enter' || /^[a-zA-Z]$/.test(key)) {
      handleInput(key);
    }
  });

  // 2. On-Screen Keyboard Listener (Mouse & Touch)
  if (keyboardElement) {
    keyboardElement.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-key]');
      if (!button) return;

      const key = button.getAttribute('data-key');
      if (key) {
        handleInput(key);
        button.blur();
      }
    });
  }

  // 3. Hint Button Listener
  if (hintButtonElement) {
    hintButtonElement.addEventListener('click', () => {
      useHint();
      hintButtonElement.blur();
    });
  }

  // 4. Play Again Button Listener
  if (playAgainBtnElement) {
    playAgainBtnElement.addEventListener('click', () => {
      initGame();
      playAgainBtnElement.blur();
    });
  }
}

// Initialise the game once the DOM is fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGame);
} else {
  initGame();
}
