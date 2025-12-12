// ============================================================================
// SOUND EFFECTS
// ============================================================================

// Preload sound files
const damageSounds = [];
const killSounds = [];
const injurySounds = [];
let moveSound = null;
let dashSound = null;
let killSuccessSound = null;
let manaSound = null;

// Load damage sounds (hit1.wav to hit5.wav)
for (let i = 1; i <= 5; i++) {
    const audio = new Audio(`assets/hit${i}.wav`);
    audio.volume = 0.5;
    damageSounds.push(audio);
}

// Load kill sounds (kill1.wav to kill5.wav)
for (let i = 1; i <= 5; i++) {
    const audio = new Audio(`assets/kill${i}.wav`);
    audio.volume = 0.5;
    killSounds.push(audio);
}

// Load injury sounds (injure1.wav to injure5.wav)
for (let i = 1; i <= 5; i++) {
    const audio = new Audio(`assets/injure${i}.wav`);
    audio.volume = 0.5;
    injurySounds.push(audio);
}

// Load move sound
moveSound = new Audio('assets/move.mp3');
moveSound.volume = 0.5;

// Load dash sound
dashSound = new Audio('assets/dash.mp3');
dashSound.volume = 0.5;

// Load kill success sound
killSuccessSound = new Audio('assets/killSuccess.mp3');
killSuccessSound.volume = 0.5;

// Load mana sound
manaSound = new Audio('assets/mana.mp3');
manaSound.volume = 0.5;

// Play a random damage sound
export function playDamageSound() {
    if (damageSounds.length === 0) return;
    const randomIndex = Math.floor(Math.random() * damageSounds.length);
    const sound = damageSounds[randomIndex].cloneNode();
    sound.volume = 0.5;
    sound.play().catch(err => console.warn('Failed to play damage sound:', err));
}

// Play a random kill sound
export function playKillSound() {
    if (killSounds.length === 0) return;
    const randomIndex = Math.floor(Math.random() * killSounds.length);
    const sound = killSounds[randomIndex].cloneNode();
    sound.volume = 0.5;
    sound.play().catch(err => console.warn('Failed to play kill sound:', err));
}

// Play move sound
export function playMoveSound(volume = 0.5) {
    if (!moveSound) return;
    const sound = moveSound.cloneNode();
    sound.volume = Math.max(0, Math.min(1, volume));
    sound.play().catch(err => console.warn('Failed to play move sound:', err));
}

// Play dash sound
export function playDashSound(volume = 0.5) {
    if (!dashSound) return;
    const sound = dashSound.cloneNode();
    sound.volume = Math.max(0, Math.min(1, volume));
    sound.play().catch(err => console.warn('Failed to play dash sound:', err));
}

// Play a random injury sound
export function playInjurySound() {
    if (injurySounds.length === 0) return;
    const randomIndex = Math.floor(Math.random() * injurySounds.length);
    const sound = injurySounds[randomIndex].cloneNode();
    sound.volume = 0.5;
    sound.play().catch(err => console.warn('Failed to play injury sound:', err));
}

// Play kill success sound
export function playKillSuccessSound() {
    if (!killSuccessSound) return;
    const sound = killSuccessSound.cloneNode();
    sound.volume = 0.5;
    sound.play().catch(err => console.warn('Failed to play kill success sound:', err));
}

// Play mana sound
export function playManaSound(volume = 0.5) {
    if (!manaSound) return;
    const sound = manaSound.cloneNode();
    sound.volume = Math.max(0, Math.min(1, volume));
    sound.play().catch(err => console.warn('Failed to play mana sound:', err));
}

