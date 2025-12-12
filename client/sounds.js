// ============================================================================
// SOUND EFFECTS
// ============================================================================

// Preload sound files
const damageSounds = [];
const killSounds = [];

// Load damage sounds (dmg1.wav to dmg5.wav)
for (let i = 1; i <= 5; i++) {
    const audio = new Audio(`assets/dmg${i}.wav`);
    audio.volume = 0.5;
    damageSounds.push(audio);
}

// Load kill sounds (hit1.wav to hit5.wav)
for (let i = 1; i <= 5; i++) {
    const audio = new Audio(`assets/hit${i}.wav`);
    audio.volume = 0.5;
    killSounds.push(audio);
}

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

