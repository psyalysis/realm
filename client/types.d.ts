// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface Position {
    x: number;
    y: number;
}

export interface PlayerState {
    x: number;
    y: number;
    targetX: number;
    targetY: number;
    interpolatedX: number;
    interpolatedY: number;
    health: number;
    maxHealth: number;
    dashCooldownEndTime: number;
    dashEndTime: number;
    dashDirection: string | null;
    manaCooldownEndTime: number;
    isDashing: boolean;
    isCastingMana: boolean;
    manaCastEndTime: number;
    isDead: boolean;
    respawnTime: number;
    color: string | null;
    lastMovementDirection: string | null;
    wobbleStartTime: number | null;
}

export interface GameState {
    player: Position;
    playerTarget: Position;
    playerInterpolated: Position;
    camera: Position;
    cameraTarget: Position;
    cameraInterpolated: Position;
    cameraArrivalTime: number;
    isHitEffectActive: boolean;
    zoom: number;
    movementQueue: string[];
    lastMovementDirection: string | null;
    wobbleStartTime: number | null;
    pressedKeys: Set<string>;
    dashCooldownEndTime: number;
    dashEndTime: number;
    dashDirection: string | null;
    isDashing: boolean;
    health: number;
    maxHealth: number;
    manaCooldownEndTime: number;
    isCastingMana: boolean;
    manaCastEndTime: number;
    isDead: boolean;
    respawnTime: number;
    playerColor: string | null;
}

export type MovementAction = 'MOVE_UP' | 'MOVE_DOWN' | 'MOVE_LEFT' | 'MOVE_RIGHT';
export type MovementDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

