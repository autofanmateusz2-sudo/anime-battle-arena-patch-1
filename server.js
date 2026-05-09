// =============================================================================
// ANIME BATTLE ARENA 3D - AUTHORITATIVE GAME SERVER
// =============================================================================
// Stack: Node.js + Express + Socket.io
// Tick rate: 30 Hz
// Architecture: Authoritative server, client prediction, server reconciliation
// =============================================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingInterval: 10000,
    pingTimeout: 5000,
    maxHttpBufferSize: 1e6
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// =============================================================================
// SERVER CONFIGURATION
// =============================================================================
const CONFIG = {
    PORT: process.env.PORT || 3000,
    TICK_RATE: 30,
    TICK_INTERVAL: 1000 / 30,
    MAX_PLAYERS_PER_ROOM: 8,
    MAX_ROOMS: 50,
    ROOM_TIMEOUT_MS: 30 * 60 * 1000,
    ARENA_SIZE: 80,
    ARENA_HEIGHT: 40,
    GRAVITY: -28,
    JUMP_VELOCITY: 12,
    DOUBLE_JUMP_VELOCITY: 10,
    DASH_SPEED: 35,
    DASH_DURATION: 0.18,
    DASH_COOLDOWN: 1.2,
    DASH_CHARGES_MAX: 3,
    DASH_RECHARGE_TIME: 3.5,
    BASE_MOVE_SPEED: 9,
    AIR_CONTROL: 0.6,
    FRICTION: 12,
    HITSTUN_BASE: 0.25,
    BLOCK_DAMAGE_REDUCTION: 0.7,
    PARRY_WINDOW: 0.18,
    PARRY_REWARD_TIME: 1.0,
    COMBO_DECAY_TIME: 2.0,
    COMBO_DAMAGE_SCALING: [1.0, 0.95, 0.85, 0.7, 0.55, 0.4, 0.3, 0.2],
    ULT_GAUGE_MAX: 100,
    ULT_GAUGE_PER_DAMAGE_DEALT: 0.25,
    ULT_GAUGE_PER_DAMAGE_TAKEN: 0.4,
    RESPAWN_TIME: 4.0,
    MATCH_DURATION: 300,
    SCORE_LIMIT_FFA: 20,
    SCORE_LIMIT_TDM: 30,
    LOCKON_RANGE: 35,
    LOCKON_ANGLE: Math.PI / 3,
    MIN_Y_DEATH: -25,
    MAX_NAME_LENGTH: 16,
    MAX_CHAT_LENGTH: 120,
    CHAT_COOLDOWN_MS: 800,
    INPUT_QUEUE_MAX: 16
};

// =============================================================================
// STATUS EFFECTS DEFINITIONS
// =============================================================================
const STATUS_EFFECTS = {
    BURN: {
        id: 'burn',
        name: 'Burn',
        duration: 4.0,
        tickRate: 0.5,
        damagePerTick: 3,
        color: 0xff5522,
        canStack: true,
        maxStacks: 5,
        slowMultiplier: 1.0
    },
    FREEZE: {
        id: 'freeze',
        name: 'Freeze',
        duration: 1.5,
        tickRate: 1.0,
        damagePerTick: 0,
        color: 0x88ddff,
        canStack: false,
        slowMultiplier: 0.3,
        preventActions: true
    },
    SHOCK: {
        id: 'shock',
        name: 'Shock',
        duration: 2.0,
        tickRate: 0.4,
        damagePerTick: 2,
        color: 0xffff44,
        canStack: false,
        slowMultiplier: 0.7,
        chainRange: 6,
        chainDamage: 5
    },
    POISON: {
        id: 'poison',
        name: 'Poison',
        duration: 6.0,
        tickRate: 0.6,
        damagePerTick: 2,
        color: 0xaa44ff,
        canStack: true,
        maxStacks: 3,
        slowMultiplier: 0.9
    },
    BLEED: {
        id: 'bleed',
        name: 'Bleed',
        duration: 5.0,
        tickRate: 0.5,
        damagePerTick: 2.5,
        color: 0xaa0000,
        canStack: true,
        maxStacks: 4,
        slowMultiplier: 1.0,
        amplifyOnMove: true
    },
    STUN: {
        id: 'stun',
        name: 'Stun',
        duration: 1.0,
        tickRate: 1.0,
        damagePerTick: 0,
        color: 0xffffff,
        canStack: false,
        slowMultiplier: 0.0,
        preventActions: true
    },
    SLOW: {
        id: 'slow',
        name: 'Slow',
        duration: 3.0,
        tickRate: 1.0,
        damagePerTick: 0,
        color: 0x4488ff,
        canStack: false,
        slowMultiplier: 0.5
    },
    BUFF_ATK: {
        id: 'buff_atk',
        name: 'Attack Up',
        duration: 8.0,
        tickRate: 1.0,
        damagePerTick: 0,
        color: 0xff8800,
        canStack: false,
        damageMultiplier: 1.4
    },
    BUFF_DEF: {
        id: 'buff_def',
        name: 'Defense Up',
        duration: 8.0,
        tickRate: 1.0,
        damagePerTick: 0,
        color: 0x44ff44,
        canStack: false,
        damageReduction: 0.4
    },
    BUFF_SPEED: {
        id: 'buff_speed',
        name: 'Haste',
        duration: 6.0,
        tickRate: 1.0,
        damagePerTick: 0,
        color: 0x44ffff,
        canStack: false,
        slowMultiplier: 1.5
    },
    INVULN: {
        id: 'invuln',
        name: 'Invulnerable',
        duration: 1.0,
        tickRate: 1.0,
        damagePerTick: 0,
        color: 0xffffff,
        canStack: false,
        invulnerable: true
    },
    REGEN: {
        id: 'regen',
        name: 'Regeneration',
        duration: 5.0,
        tickRate: 0.5,
        damagePerTick: -4,
        color: 0x88ff88,
        canStack: false
    }
};

// =============================================================================
// CHARACTER ROSTER - 12 ANIME CHARACTERS
// Each: stats, 4 abilities (Q/E/R/F), passive, ultimate
// =============================================================================
const CHARACTERS = {
    rengoku: {
        id: 'rengoku',
        name: 'Kyojuro Rengoku',
        title: 'Flame Hashira',
        anime: 'Demon Slayer',
        role: 'Bruiser',
        difficulty: 3,
        color: 0xff4400,
        secondaryColor: 0xffaa00,
        auraColor: 0xff6622,
        modelType: 'samurai',
        weapon: 'katana',
        stats: {
            maxHp: 110,
            maxMp: 100,
            mpRegen: 8,
            moveSpeed: 9.5,
            attackSpeed: 1.1,
            damage: 1.0,
            defense: 1.0,
            jumpHeight: 1.0
        },
        passive: {
            name: 'Flame Breathing',
            description: 'Basic attacks apply 1 stack of Burn. Below 30% HP, gain Attack Up.'
        },
        abilities: {
            light: {
                name: 'Flame Slash',
                damage: 8,
                range: 3.5,
                cooldown: 0.4,
                manaCost: 0,
                statusApply: ['BURN'],
                animType: 'slash_horizontal'
            },
            heavy: {
                name: 'Rising Inferno',
                damage: 16,
                range: 4.0,
                cooldown: 0.9,
                manaCost: 0,
                statusApply: ['BURN'],
                launches: true,
                animType: 'slash_uppercut'
            },
            q: {
                name: 'First Form: Unknowing Fire',
                damage: 22,
                range: 6,
                cooldown: 5,
                manaCost: 20,
                dashAttack: true,
                dashDistance: 8,
                statusApply: ['BURN'],
                animType: 'dash_slash'
            },
            e: {
                name: 'Fifth Form: Flame Tiger',
                damage: 28,
                range: 12,
                cooldown: 8,
                manaCost: 30,
                projectile: true,
                projectileSpeed: 25,
                statusApply: ['BURN'],
                animType: 'projectile_beast'
            },
            r: {
                name: 'Flame Aura',
                damage: 0,
                cooldown: 14,
                manaCost: 25,
                buff: 'BUFF_ATK',
                buffDuration: 6,
                animType: 'self_buff'
            },
            f: {
                name: 'Ninth Form: Rengoku',
                damage: 70,
                range: 14,
                cooldown: 30,
                manaCost: 0,
                ultGaugeCost: 100,
                ultimate: true,
                aoeAttack: true,
                aoeRadius: 8,
                statusApply: ['BURN', 'BURN', 'BURN'],
                cinematicTime: 1.8,
                animType: 'ultimate_inferno'
            }
        }
    },
    
    hitsugaya: {
        id: 'hitsugaya',
        name: 'Toshiro Hitsugaya',
        title: 'Ice Dragon Captain',
        anime: 'Bleach',
        role: 'Controller',
        difficulty: 4,
        color: 0x88ddff,
        secondaryColor: 0xffffff,
        auraColor: 0xaaeeff,
        modelType: 'shinigami',
        weapon: 'katana',
        stats: {
            maxHp: 95,
            maxMp: 130,
            mpRegen: 12,
            moveSpeed: 10,
            attackSpeed: 1.2,
            damage: 0.95,
            defense: 0.9,
            jumpHeight: 1.1
        },
        passive: {
            name: 'Hyorinmaru',
            description: 'Critical strikes (10% chance) apply Freeze. Ice trail slows enemies.'
        },
        abilities: {
            light: {
                name: 'Ice Slash',
                damage: 7,
                range: 3.2,
                cooldown: 0.35,
                manaCost: 0,
                critChance: 0.1,
                statusApplyOnCrit: ['FREEZE'],
                animType: 'slash_horizontal'
            },
            heavy: {
                name: 'Frost Cleave',
                damage: 14,
                range: 3.8,
                cooldown: 0.85,
                manaCost: 0,
                statusApply: ['SLOW'],
                animType: 'slash_overhead'
            },
            q: {
                name: 'Ryusenka',
                damage: 18,
                range: 5,
                cooldown: 6,
                manaCost: 25,
                statusApply: ['FREEZE'],
                animType: 'thrust_ice'
            },
            e: {
                name: 'Sennen Hyoro',
                damage: 12,
                range: 14,
                cooldown: 9,
                manaCost: 35,
                projectile: true,
                projectileSpeed: 18,
                pillarAoe: true,
                pillarRadius: 3,
                statusApply: ['FREEZE'],
                animType: 'ice_pillars'
            },
            r: {
                name: 'Frozen Sky',
                damage: 0,
                cooldown: 16,
                manaCost: 30,
                aoeRadius: 7,
                statusApply: ['SLOW'],
                groundEffect: true,
                groundEffectDuration: 5,
                animType: 'ground_aoe'
            },
            f: {
                name: 'Bankai: Daiguren Hyorinmaru',
                damage: 65,
                range: 18,
                cooldown: 35,
                manaCost: 0,
                ultGaugeCost: 100,
                ultimate: true,
                aoeAttack: true,
                aoeRadius: 10,
                statusApply: ['FREEZE', 'FREEZE'],
                cinematicTime: 2.0,
                animType: 'ultimate_dragon_ice'
            }
        }
    },
    
    minato: {
        id: 'minato',
        name: 'Minato Namikaze',
        title: 'Yellow Flash',
        anime: 'Naruto',
        role: 'Assassin',
        difficulty: 5,
        color: 0xffdd44,
        secondaryColor: 0x4488ff,
        auraColor: 0xffee88,
        modelType: 'ninja',
        weapon: 'kunai',
        stats: {
            maxHp: 90,
            maxMp: 110,
            mpRegen: 10,
            moveSpeed: 11,
            attackSpeed: 1.3,
            damage: 1.05,
            defense: 0.85,
            jumpHeight: 1.15
        },
        passive: {
            name: 'Hiraishin Marker',
            description: 'Basic hits place a marker. Teleport to marker with E. Markers last 8s.'
        },
        abilities: {
            light: {
                name: 'Kunai Strike',
                damage: 6,
                range: 2.8,
                cooldown: 0.3,
                manaCost: 0,
                placesMarker: true,
                animType: 'slash_quick'
            },
            heavy: {
                name: 'Triple Kunai',
                damage: 12,
                range: 10,
                cooldown: 0.8,
                manaCost: 0,
                projectile: true,
                projectileSpeed: 30,
                projectileCount: 3,
                projectileSpread: 0.2,
                placesMarker: true,
                animType: 'throw_kunai'
            },
            q: {
                name: 'Flying Raijin Slash',
                damage: 24,
                range: 999,
                cooldown: 7,
                manaCost: 25,
                teleportToMarker: true,
                followUpAttack: true,
                animType: 'teleport_slash'
            },
            e: {
                name: 'Marker Kunai',
                damage: 5,
                range: 20,
                cooldown: 4,
                manaCost: 15,
                projectile: true,
                projectileSpeed: 35,
                placesGroundMarker: true,
                animType: 'throw_marker'
            },
            r: {
                name: 'Rasengan',
                damage: 32,
                range: 3,
                cooldown: 10,
                manaCost: 40,
                knockback: 12,
                animType: 'rasengan'
            },
            f: {
                name: 'Flying Thunder God Lv.2',
                damage: 50,
                range: 30,
                cooldown: 40,
                manaCost: 0,
                ultGaugeCost: 100,
                ultimate: true,
                multiTeleport: true,
                teleportHits: 5,
                damagePerHit: 10,
                cinematicTime: 2.5,
                animType: 'ultimate_flash'
            }
        }
    },
    
    goku: {
        id: 'goku',
        name: 'Son Goku',
        title: 'Saiyan Warrior',
        anime: 'Dragon Ball Z',
        role: 'All-Rounder',
        difficulty: 2,
        color: 0xff8800,
        secondaryColor: 0x2244aa,
        auraColor: 0xffff44,
        modelType: 'martial_artist',
        weapon: 'fists',
        stats: {
            maxHp: 115,
            maxMp: 120,
            mpRegen: 9,
            moveSpeed: 9.5,
            attackSpeed: 1.15,
            damage: 1.05,
            defense: 1.0,
            jumpHeight: 1.3
        },
        passive: {
            name: 'Saiyan Pride',
            description: 'Below 25% HP, transform into Super Saiyan: +30% damage, +20% speed, golden aura.'
        },
        abilities: {
            light: {
                name: 'Lightning Punch',
                damage: 6,
                range: 2.5,
                cooldown: 0.25,
                manaCost: 0,
                animType: 'punch_jab'
            },
            heavy: {
                name: 'Dragon Kick',
                damage: 14,
                range: 3.0,
                cooldown: 0.7,
                manaCost: 0,
                knockback: 8,
                launches: true,
                animType: 'kick_spinning'
            },
            q: {
                name: 'Ki Blast Barrage',
                damage: 4,
                range: 14,
                cooldown: 5,
                manaCost: 25,
                projectile: true,
                projectileSpeed: 28,
                projectileCount: 8,
                projectileInterval: 0.1,
                animType: 'ki_barrage'
            },
            e: {
                name: 'Instant Transmission',
                damage: 0,
                range: 15,
                cooldown: 8,
                manaCost: 20,
                blink: true,
                animType: 'teleport_short'
            },
            r: {
                name: 'Kaioken',
                damage: 0,
                cooldown: 18,
                manaCost: 35,
                buff: 'BUFF_SPEED',
                buffDuration: 5,
                buffStacks: ['BUFF_ATK'],
                hpCost: 10,
                animType: 'self_buff_red'
            },
            f: {
                name: 'Kamehameha',
                damage: 80,
                range: 30,
                cooldown: 35,
                manaCost: 0,
                ultGaugeCost: 100,
                ultimate: true,
                beam: true,
                beamWidth: 3,
                chargeTime: 0.8,
                cinematicTime: 2.2,
                animType: 'ultimate_beam'
            }
        }
    },
    
    ichigo: {
        id: 'ichigo',
        name: 'Ichigo Kurosaki',
        title: 'Hollow Substitute',
        anime: 'Bleach',
        role: 'Bruiser',
        difficulty: 3,
        color: 0x222222,
        secondaryColor: 0xff0000,
        auraColor: 0x000000,
        modelType: 'shinigami',
        weapon: 'greatsword',
        stats: {
            maxHp: 120,
            maxMp: 100,
            mpRegen: 7,
            moveSpeed: 9,
            attackSpeed: 1.0,
            damage: 1.1,
            defense: 1.05,
            jumpHeight: 1.0
        },
        passive: {
            name: 'Hollow Mask',
            description: 'Below 40% HP, mask activates: +25% damage, +15% lifesteal for 8s. 30s cooldown.'
        },
        abilities: {
            light: {
                name: 'Zangetsu Slash',
                damage: 9,
                range: 4.0,
                cooldown: 0.45,
                manaCost: 0,
                animType: 'slash_heavy'
            },
            heavy: {
                name: 'Cleaver Slam',
                damage: 18,
                range: 4.5,
                cooldown: 1.0,
                manaCost: 0,
                aoeAttack: true,
                aoeRadius: 3,
                animType: 'slash_slam'
            },
            q: {
                name: 'Getsuga Tensho',
                damage: 26,
                range: 18,
                cooldown: 6,
                manaCost: 30,
                projectile: true,
                projectileSpeed: 22,
                projectileWidth: 4,
                animType: 'crescent_wave'
            },
            e: {
                name: 'Shunpo',
                damage: 0,
                range: 12,
                cooldown: 5,
                manaCost: 15,
                blink: true,
                animType: 'flash_step'
            },
            r: {
                name: 'Hollow Roar',
                damage: 12,
                range: 8,
                cooldown: 12,
                manaCost: 25,
                aoeAttack: true,
                aoeRadius: 6,
                statusApply: ['STUN'],
                animType: 'shockwave'
            },
            f: {
                name: 'Final Getsuga Tensho',
                damage: 90,
                range: 25,
                cooldown: 40,
                manaCost: 0,
                ultGaugeCost: 100,
                ultimate: true,
                beam: true,
                beamWidth: 5,
                cinematicTime: 2.5,
                animType: 'ultimate_black_wave'
            }
        }
    },
    
    naruto: {
        id: 'naruto',
        name: 'Naruto Uzumaki',
        title: 'Nine-Tails Jinchuriki',
        anime: 'Naruto',
        role: 'Bruiser',
        difficulty: 2,
        color: 0xff8800,
        secondaryColor: 0xffdd44,
        auraColor: 0xff5500,
        modelType: 'ninja',
        weapon: 'fists',
        stats: {
            maxHp: 125,
            maxMp: 110,
            mpRegen: 11,
            moveSpeed: 9.5,
            attackSpeed: 1.1,
            damage: 1.0,
            defense: 1.0,
            jumpHeight: 1.1
        },
        passive: {
            name: 'Kurama Chakra',
            description: 'Regenerates 2 HP/s. Damage taken charges ult 50% faster.'
        },
        abilities: {
            light: {
                name: 'Shadow Strike',
                damage: 7,
                range: 2.8,
                cooldown: 0.35,
                manaCost: 0,
                animType: 'punch_jab'
            },
            heavy: {
                name: 'Clone Combo',
                damage: 16,
                range: 3.5,
                cooldown: 0.9,
                manaCost: 0,
                multiHit: 3,
                animType: 'multi_punch'
            },
            q: {
                name: 'Rasengan',
                damage: 28,
                range: 3,
                cooldown: 6,
                manaCost: 30,
                knockback: 10,
                animType: 'rasengan'
            },
            e: {
                name: 'Shadow Clone Jutsu',
                damage: 8,
                range: 5,
                cooldown: 9,
                manaCost: 35,
                summonsClones: 2,
                cloneDuration: 6,
                animType: 'clone_summon'
            },
            r: {
                name: 'Sage Mode',
                damage: 0,
                cooldown: 20,
                manaCost: 40,
                buff: 'BUFF_ATK',
                buffStacks: ['BUFF_DEF'],
                buffDuration: 8,
                animType: 'self_buff_orange'
            },
            f: {
                name: 'Tailed Beast Bomb',
                damage: 75,
                range: 22,
                cooldown: 35,
                manaCost: 0,
                ultGaugeCost: 100,
                ultimate: true,
                projectile: true,
                projectileSpeed: 18,
                aoeOnImpact: true,
                aoeRadius: 9,
                cinematicTime: 2.3,
                animType: 'ultimate_bijudama'
            }
        }
    },
    
    nezuko: {
        id: 'nezuko',
        name: 'Nezuko Kamado',
        title: 'Demon Sister',
        anime: 'Demon Slayer',
        role: 'Skirmisher',
        difficulty: 3,
        color: 0xff66aa,
        secondaryColor: 0x333333,
        auraColor: 0xff3366,
        modelType: 'demon',
        weapon: 'claws',
        stats: {
            maxHp: 100,
            maxMp: 100,
            mpRegen: 9,
            moveSpeed: 10.5,
            attackSpeed: 1.25,
            damage: 1.0,
            defense: 0.95,
            jumpHeight: 1.2
        },
        passive: {
            name: 'Demon Regeneration',
            description: 'Regenerates 3 HP/s when out of combat (no damage for 4s).'
        },
        abilities: {
            light: {
                name: 'Bamboo Kick',
                damage: 7,
                range: 2.8,
                cooldown: 0.3,
                manaCost: 0,
                animType: 'kick_quick'
            },
            heavy: {
                name: 'Claw Slash',
                damage: 14,
                range: 3.2,
                cooldown: 0.75,
                manaCost: 0,
                statusApply: ['BLEED'],
                animType: 'slash_claw'
            },
            q: {
                name: 'Blood Demon Art: Explosive Blood',
                damage: 22,
                range: 8,
                cooldown: 7,
                manaCost: 30,
                projectile: true,
                projectileSpeed: 20,
                aoeOnImpact: true,
                aoeRadius: 4,
                statusApply: ['BURN'],
                animType: 'blood_burst'
            },
            e: {
                name: 'Demon Leap',
                damage: 12,
                range: 12,
                cooldown: 5,
                manaCost: 15,
                leap: true,
                leapHeight: 14,
                animType: 'jump_attack'
            },
            r: {
                name: 'Berserker Mode',
                damage: 0,
                cooldown: 18,
                manaCost: 35,
                buff: 'BUFF_SPEED',
                buffStacks: ['BUFF_ATK', 'REGEN'],
                buffDuration: 6,
                animType: 'self_buff_pink'
            },
            f: {
                name: 'Crimson Bamboo Inferno',
                damage: 65,
                range: 16,
                cooldown: 32,
                manaCost: 0,
                ultGaugeCost: 100,
                ultimate: true,
                aoeAttack: true,
                aoeRadius: 8,
                statusApply: ['BURN', 'BURN', 'BLEED'],
                cinematicTime: 2.0,
                animType: 'ultimate_blood_flame'
            }
        }
    },
    
    killua: {
        id: 'killua',
        name: 'Killua Zoldyck',
        title: 'Lightning Assassin',
        anime: 'Hunter x Hunter',
        role: 'Assassin',
        difficulty: 5,
        color: 0xffffff,
        secondaryColor: 0xffff44,
        auraColor: 0xaaccff,
        modelType: 'assassin',
        weapon: 'claws',
        stats: {
            maxHp: 85,
            maxMp: 120,
            mpRegen: 12,
            moveSpeed: 11.5,
            attackSpeed: 1.4,
            damage: 1.1,
            defense: 0.8,
            jumpHeight: 1.2
        },
        passive: {
            name: 'Godspeed',
            description: 'Every 3rd basic attack is automatic Crit (+50% damage, applies Shock).'
        },
        abilities: {
            light: {
                name: 'Claw Strike',
                damage: 5,
                range: 2.5,
                cooldown: 0.22,
                manaCost: 0,
                animType: 'slash_quick'
            },
            heavy: {
                name: 'Lightning Palm',
                damage: 13,
                range: 3.0,
                cooldown: 0.7,
                manaCost: 0,
                statusApply: ['SHOCK'],
                animType: 'palm_strike'
            },
            q: {
                name: 'Thunderbolt',
                damage: 24,
                range: 14,
                cooldown: 5,
                manaCost: 25,
                projectile: true,
                projectileSpeed: 40,
                statusApply: ['SHOCK'],
                chains: true,
                chainCount: 2,
                animType: 'lightning_bolt'
            },
            e: {
                name: 'Whirlwind Dash',
                damage: 0,
                range: 18,
                cooldown: 4,
                manaCost: 15,
                blink: true,
                grantsInvuln: 0.3,
                animType: 'dash_lightning'
            },
            r: {
                name: 'Speed of Lightning',
                damage: 0,
                cooldown: 16,
                manaCost: 30,
                buff: 'BUFF_SPEED',
                buffStacks: ['BUFF_ATK'],
                buffDuration: 5,
                animType: 'self_buff_white'
            },
            f: {
                name: 'God Speed: Whirlwind',
                damage: 60,
                range: 12,
                cooldown: 38,
                manaCost: 0,
                ultGaugeCost: 100,
                ultimate: true,
                aoeAttack: true,
                aoeRadius: 7,
                multiHit: 8,
                statusApply: ['SHOCK', 'SHOCK'],
                cinematicTime: 1.8,
                animType: 'ultimate_lightning_storm'
            }
        }
    },
    
    allmight: {
        id: 'allmight',
        name: 'All Might',
        title: 'Symbol of Peace',
        anime: 'My Hero Academia',
        role: 'Tank',
        difficulty: 1,
        color: 0xffdd00,
        secondaryColor: 0xff0000,
        auraColor: 0xffee44,
        modelType: 'hero',
        weapon: 'fists',
        stats: {
            maxHp: 145,
            maxMp: 80,
            mpRegen: 6,
            moveSpeed: 8.5,
            attackSpeed: 0.9,
            damage: 1.15,
            defense: 1.2,
            jumpHeight: 1.4
        },
        passive: {
            name: 'One For All',
            description: 'Takes 20% reduced damage. Heals 5 HP per ability used.'
        },
        abilities: {
            light: {
                name: 'Hero Punch',
                damage: 10,
                range: 3.0,
                cooldown: 0.5,
                manaCost: 0,
                knockback: 4,
                animType: 'punch_heavy'
            },
            heavy: {
                name: 'Texas Smash',
                damage: 22,
                range: 5,
                cooldown: 1.2,
                manaCost: 0,
                aoeAttack: true,
                aoeRadius: 4,
                knockback: 12,
                animType: 'punch_shockwave'
            },
            q: {
                name: 'Detroit Smash',
                damage: 30,
                range: 4,
                cooldown: 7,
                manaCost: 30,
                aoeAttack: true,
                aoeRadius: 6,
                knockback: 15,
                statusApply: ['STUN'],
                animType: 'ground_pound'
            },
            e: {
                name: 'Carolina Smash',
                damage: 18,
                range: 14,
                cooldown: 6,
                manaCost: 25,
                dashAttack: true,
                dashDistance: 12,
                animType: 'dash_punch'
            },
            r: {
                name: 'Plus Ultra!',
                damage: 0,
                cooldown: 20,
                manaCost: 40,
                buff: 'BUFF_ATK',
                buffStacks: ['BUFF_DEF'],
                buffDuration: 8,
                animType: 'self_buff_yellow'
            },
            f: {
                name: 'United States of Smash',
                damage: 95,
                range: 18,
                cooldown: 45,
                manaCost: 0,
                ultGaugeCost: 100,
                ultimate: true,
                aoeAttack: true,
                aoeRadius: 11,
                knockback: 25,
                statusApply: ['STUN'],
                cinematicTime: 2.8,
                animType: 'ultimate_super_smash'
            }
        }
    },
    
    megumin: {
        id: 'megumin',
        name: 'Megumin',
        title: 'Crimson Demon Archmage',
        anime: 'Konosuba',
        role: 'Mage',
        difficulty: 4,
        color: 0xaa0000,
        secondaryColor: 0x000000,
        auraColor: 0xff2222,
        modelType: 'mage',
        weapon: 'staff',
        stats: {
            maxHp: 75,
            maxMp: 150,
            mpRegen: 14,
            moveSpeed: 8.5,
            attackSpeed: 0.85,
            damage: 0.9,
            defense: 0.8,
            jumpHeight: 0.9
        },
        passive: {
            name: 'Explosion Mastery',
            description: 'After casting Ultimate, faints for 5s but enters Overcharge: +200% MP regen.'
        },
        abilities: {
            light: {
                name: 'Staff Strike',
                damage: 5,
                range: 3.0,
                cooldown: 0.5,
                manaCost: 0,
                animType: 'staff_swing'
            },
            heavy: {
                name: 'Magic Bolt',
                damage: 11,
                range: 14,
                cooldown: 0.9,
                manaCost: 5,
                projectile: true,
                projectileSpeed: 28,
                animType: 'projectile_magic'
            },
            q: {
                name: 'Fireball',
                damage: 20,
                range: 16,
                cooldown: 4,
                manaCost: 25,
                projectile: true,
                projectileSpeed: 22,
                aoeOnImpact: true,
                aoeRadius: 4,
                statusApply: ['BURN'],
                animType: 'projectile_fireball'
            },
            e: {
                name: 'Lightning Storm',
                damage: 8,
                range: 14,
                cooldown: 7,
                manaCost: 30,
                aoeAttack: true,
                aoeRadius: 5,
                multiHit: 4,
                statusApply: ['SHOCK'],
                groundTarget: true,
                animType: 'lightning_aoe'
            },
            r: {
                name: 'Magic Barrier',
                damage: 0,
                cooldown: 14,
                manaCost: 30,
                buff: 'BUFF_DEF',
                buffStacks: ['INVULN'],
                buffDuration: 1.5,
                animType: 'shield_self'
            },
            f: {
                name: 'EXPLOSION!!!',
                damage: 120,
                range: 25,
                cooldown: 50,
                manaCost: 0,
                ultGaugeCost: 100,
                ultimate: true,
                aoeAttack: true,
                aoeRadius: 14,
                groundTarget: true,
                chargeTime: 1.5,
                selfStun: 5.0,
                cinematicTime: 3.0,
                animType: 'ultimate_explosion'
            }
        }
    },
    
    alucard: {
        id: 'alucard',
        name: 'Alucard',
        title: 'No Life King',
        anime: 'Hellsing',
        role: 'Bruiser',
        difficulty: 4,
        color: 0x880000,
        secondaryColor: 0x000000,
        auraColor: 0xff0044,
        modelType: 'vampire',
        weapon: 'pistols',
        stats: {
            maxHp: 130,
            maxMp: 110,
            mpRegen: 8,
            moveSpeed: 9.5,
            attackSpeed: 1.2,
            damage: 1.1,
            defense: 1.0,
            jumpHeight: 1.1
        },
        passive: {
            name: 'Vampiric Lifesteal',
            description: 'Heals for 25% of damage dealt by basic attacks.'
        },
        abilities: {
            light: {
                name: 'Jackal Shot',
                damage: 7,
                range: 16,
                cooldown: 0.35,
                manaCost: 0,
                projectile: true,
                projectileSpeed: 50,
                animType: 'shoot_pistol'
            },
            heavy: {
                name: 'Twin Pistols',
                damage: 14,
                range: 16,
                cooldown: 0.85,
                manaCost: 0,
                projectile: true,
                projectileSpeed: 50,
                projectileCount: 2,
                animType: 'shoot_dual'
            },
            q: {
                name: 'Shadow Bats',
                damage: 18,
                range: 12,
                cooldown: 6,
                manaCost: 25,
                aoeAttack: true,
                aoeRadius: 5,
                statusApply: ['BLEED'],
                lifestealAmplified: 0.5,
                animType: 'bat_swarm'
            },
            e: {
                name: 'Mist Form',
                damage: 0,
                range: 15,
                cooldown: 8,
                manaCost: 20,
                blink: true,
                grantsInvuln: 0.5,
                animType: 'shadow_dash'
            },
            r: {
                name: 'Releasing Control Art Restriction',
                damage: 0,
                cooldown: 22,
                manaCost: 40,
                buff: 'BUFF_ATK',
                buffStacks: ['BUFF_SPEED'],
                buffDuration: 7,
                animType: 'self_buff_dark'
            },
            f: {
                name: 'Level Zero: Hellhound',
                damage: 85,
                range: 20,
                cooldown: 38,
                manaCost: 0,
                ultGaugeCost: 100,
                ultimate: true,
                aoeAttack: true,
                aoeRadius: 9,
                statusApply: ['BLEED', 'BLEED', 'BLEED'],
                lifestealAmplified: 1.0,
                cinematicTime: 2.5,
                animType: 'ultimate_hellhound'
            }
        }
    },
    
    mitsuri: {
        id: 'mitsuri',
        name: 'Mitsuri Kanroji',
        title: 'Love Hashira',
        anime: 'Demon Slayer',
        role: 'Skirmisher',
        difficulty: 4,
        color: 0xff88cc,
        secondaryColor: 0x44dd44,
        auraColor: 0xffaadd,
        modelType: 'samurai',
        weapon: 'whip_sword',
        stats: {
            maxHp: 95,
            maxMp: 100,
            mpRegen: 10,
            moveSpeed: 11,
            attackSpeed: 1.35,
            damage: 1.0,
            defense: 0.9,
            jumpHeight: 1.25
        },
        passive: {
            name: 'Heart of Love',
            description: 'Each hit on same target stacks +5% damage (max 5 stacks, 4s duration).'
        },
        abilities: {
            light: {
                name: 'Whip Lash',
                damage: 6,
                range: 5.5,
                cooldown: 0.28,
                manaCost: 0,
                animType: 'whip_quick'
            },
            heavy: {
                name: 'Coiling Strike',
                damage: 12,
                range: 6,
                cooldown: 0.7,
                manaCost: 0,
                multiHit: 2,
                animType: 'whip_combo'
            },
            q: {
                name: 'First Form: Initial Love',
                damage: 22,
                range: 8,
                cooldown: 5,
                manaCost: 25,
                aoeAttack: true,
                aoeRadius: 5,
                animType: 'whip_spin'
            },
            e: {
                name: 'Fifth Form: Wavering Love',
                damage: 16,
                range: 12,
                cooldown: 7,
                manaCost: 30,
                dashAttack: true,
                dashDistance: 10,
                multiHit: 3,
                animType: 'whip_dance'
            },
            r: {
                name: 'Heart Aura',
                damage: 0,
                cooldown: 16,
                manaCost: 30,
                buff: 'BUFF_SPEED',
                buffStacks: ['REGEN'],
                buffDuration: 6,
                animType: 'self_buff_pink'
            },
            f: {
                name: 'Sixth Form: Catlove Shower',
                damage: 70,
                range: 15,
                cooldown: 32,
                manaCost: 0,
                ultGaugeCost: 100,
                ultimate: true,
                aoeAttack: true,
                aoeRadius: 8,
                multiHit: 6,
                cinematicTime: 2.0,
                animType: 'ultimate_love_storm'
            }
        }
    }
};

const CHARACTER_LIST = Object.keys(CHARACTERS);

// =============================================================================
// MAP/ARENA DEFINITIONS
// =============================================================================
const MAPS = {
    tokyo_night: {
        id: 'tokyo_night',
        name: 'Tokyo Rooftops',
        size: 80,
        spawnPoints: [
            { x: -25, y: 2, z: -25 },
            { x: 25, y: 2, z: 25 },
            { x: -25, y: 2, z: 25 },
            { x: 25, y: 2, z: -25 },
            { x: 0, y: 2, z: -30 },
            { x: 0, y: 2, z: 30 },
            { x: -30, y: 2, z: 0 },
            { x: 30, y: 2, z: 0 }
        ],
        platforms: [
            { x: 0, y: 6, z: 0, w: 12, h: 1, d: 12 },
            { x: -18, y: 4, z: 0, w: 8, h: 1, d: 8 },
            { x: 18, y: 4, z: 0, w: 8, h: 1, d: 8 },
            { x: 0, y: 4, z: -18, w: 8, h: 1, d: 8 },
            { x: 0, y: 4, z: 18, w: 8, h: 1, d: 8 },
            { x: -12, y: 10, z: -12, w: 5, h: 1, d: 5 },
            { x: 12, y: 10, z: 12, w: 5, h: 1, d: 5 }
        ],
        ambientLight: 0x223355,
        directionalLight: 0x5577aa,
        fogColor: 0x110022,
        fogDensity: 0.012
    },
    temple: {
        id: 'temple',
        name: 'Sacred Temple',
        size: 80,
        spawnPoints: [
            { x: -28, y: 2, z: -28 },
            { x: 28, y: 2, z: 28 },
            { x: -28, y: 2, z: 28 },
            { x: 28, y: 2, z: -28 },
            { x: 0, y: 2, z: -32 },
            { x: 0, y: 2, z: 32 },
            { x: -32, y: 2, z: 0 },
            { x: 32, y: 2, z: 0 }
        ],
        platforms: [
            { x: 0, y: 5, z: 0, w: 16, h: 1, d: 16 },
            { x: -22, y: 3, z: -22, w: 6, h: 1, d: 6 },
            { x: 22, y: 3, z: 22, w: 6, h: 1, d: 6 },
            { x: -22, y: 3, z: 22, w: 6, h: 1, d: 6 },
            { x: 22, y: 3, z: -22, w: 6, h: 1, d: 6 }
        ],
        ambientLight: 0x664433,
        directionalLight: 0xffaa66,
        fogColor: 0x442211,
        fogDensity: 0.008
    },
    space_dojo: {
        id: 'space_dojo',
        name: 'Cosmic Dojo',
        size: 80,
        spawnPoints: [
            { x: -25, y: 2, z: -25 },
            { x: 25, y: 2, z: 25 },
            { x: -25, y: 2, z: 25 },
            { x: 25, y: 2, z: -25 },
            { x: 0, y: 2, z: -30 },
            { x: 0, y: 2, z: 30 },
            { x: -30, y: 2, z: 0 },
            { x: 30, y: 2, z: 0 }
        ],
        platforms: [
            { x: 0, y: 8, z: 0, w: 10, h: 1, d: 10 },
            { x: -15, y: 5, z: -15, w: 6, h: 1, d: 6 },
            { x: 15, y: 5, z: 15, w: 6, h: 1, d: 6 },
            { x: -15, y: 5, z: 15, w: 6, h: 1, d: 6 },
            { x: 15, y: 5, z: -15, w: 6, h: 1, d: 6 },
            { x: 0, y: 12, z: 0, w: 4, h: 1, d: 4 }
        ],
        ambientLight: 0x222244,
        directionalLight: 0xaaaaff,
        fogColor: 0x000011,
        fogDensity: 0.005
    }
};

const MAP_LIST = Object.keys(MAPS);

// =============================================================================
// GAME MODES
// =============================================================================
const GAME_MODES = {
    ffa: {
        id: 'ffa',
        name: 'Free For All',
        minPlayers: 2,
        maxPlayers: 8,
        teamBased: false,
        scoreLimit: 20,
        timeLimit: 300
    },
    duel: {
        id: 'duel',
        name: '1v1 Duel',
        minPlayers: 2,
        maxPlayers: 2,
        teamBased: false,
        scoreLimit: 5,
        timeLimit: 180
    },
    tdm: {
        id: 'tdm',
        name: 'Team Deathmatch 3v3',
        minPlayers: 4,
        maxPlayers: 6,
        teamBased: true,
        teams: 2,
        scoreLimit: 30,
        timeLimit: 360
    }
};

console.log('[SERVER] Configuration loaded');
console.log(`[SERVER] ${Object.keys(CHARACTERS).length} characters loaded`);
console.log(`[SERVER] ${Object.keys(MAPS).length} maps loaded`);
console.log(`[SERVER] ${Object.keys(GAME_MODES).length} game modes loaded`);

// === CONTINUED IN PART 2 ===
// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function randRange(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(randRange(min, max + 1)); }
function dist3(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
function dist2(a, b) {
    const dx = a.x - b.x, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
}
function distSq3(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return dx * dx + dy * dy + dz * dz;
}
function normalize3(v) {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (len < 1e-6) return { x: 0, y: 0, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
}
function vecAdd(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function vecSub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function vecScale(v, s) { return { x: v.x * s, y: v.y * s, z: v.z * s }; }
function vecLen(v) { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }
function angleBetween(a, b) {
    const da = normalize3(a), db = normalize3(b);
    return Math.acos(clamp(da.x * db.x + da.y * db.y + da.z * db.z, -1, 1));
}
function genId(prefix = 'id') {
    return prefix + '_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}
function sanitizeName(name) {
    if (typeof name !== 'string') return 'Player';
    name = name.trim().replace(/[^a-zA-Z0-9_\-\s]/g, '').substring(0, CONFIG.MAX_NAME_LENGTH);
    return name.length > 0 ? name : 'Player';
}
function sanitizeChat(msg) {
    if (typeof msg !== 'string') return '';
    return msg.trim().substring(0, CONFIG.MAX_CHAT_LENGTH);
}
function nowMs() { return Date.now(); }
function nowSec() { return Date.now() / 1000; }

// AABB intersection
function aabbIntersect(a, b) {
    return Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
           Math.abs(a.y - b.y) < (a.h + b.h) / 2 &&
           Math.abs(a.z - b.z) < (a.d + b.d) / 2;
}

// Sphere-AABB
function sphereAabbIntersect(sphere, aabb) {
    const cx = clamp(sphere.x, aabb.x - aabb.w / 2, aabb.x + aabb.w / 2);
    const cy = clamp(sphere.y, aabb.y - aabb.h / 2, aabb.y + aabb.h / 2);
    const cz = clamp(sphere.z, aabb.z - aabb.d / 2, aabb.z + aabb.d / 2);
    const dx = sphere.x - cx, dy = sphere.y - cy, dz = sphere.z - cz;
    return (dx * dx + dy * dy + dz * dz) < (sphere.r * sphere.r);
}

// =============================================================================
// PROJECTILE CLASS
// =============================================================================
class Projectile {
    constructor(opts) {
        this.id = genId('proj');
        this.ownerId = opts.ownerId;
        this.team = opts.team || null;
        this.position = { ...opts.position };
        this.velocity = { ...opts.velocity };
        this.damage = opts.damage || 10;
        this.radius = opts.radius || 0.4;
        this.width = opts.width || this.radius * 2;
        this.lifetime = opts.lifetime || 3.0;
        this.elapsed = 0;
        this.gravity = opts.gravity || 0;
        this.statusApply = opts.statusApply || [];
        this.aoeOnImpact = opts.aoeOnImpact || false;
        this.aoeRadius = opts.aoeRadius || 0;
        this.pillarAoe = opts.pillarAoe || false;
        this.pillarRadius = opts.pillarRadius || 0;
        this.chains = opts.chains || false;
        this.chainCount = opts.chainCount || 0;
        this.chainsHit = new Set();
        this.beam = opts.beam || false;
        this.beamWidth = opts.beamWidth || 1;
        this.beamLength = opts.beamLength || 0;
        this.knockback = opts.knockback || 0;
        this.visualType = opts.visualType || 'default';
        this.color = opts.color || 0xffffff;
        this.dead = false;
        this.hitTargets = new Set();
        this.piercing = opts.piercing || false;
        this.placesMarker = opts.placesMarker || false;
        this.placesGroundMarker = opts.placesGroundMarker || false;
    }

    update(dt, room) {
        this.elapsed += dt;
        if (this.elapsed >= this.lifetime) { this.dead = true; return; }
        this.velocity.y += this.gravity * dt;
        this.position.x += this.velocity.x * dt;
        this.position.y += this.velocity.y * dt;
        this.position.z += this.velocity.z * dt;

        const halfArena = CONFIG.ARENA_SIZE / 2 + 5;
        if (Math.abs(this.position.x) > halfArena ||
            Math.abs(this.position.z) > halfArena ||
            this.position.y < -10 || this.position.y > 60) {
            this.dead = true;
            return;
        }

        for (const plat of room.map.platforms) {
            const aabb = { x: plat.x, y: plat.y, z: plat.z, w: plat.w, h: plat.h, d: plat.d };
            if (sphereAabbIntersect({ ...this.position, r: this.radius }, aabb)) {
                this.onImpact(room, null);
                return;
            }
        }

        for (const [pid, p] of room.players) {
            if (p.dead || pid === this.ownerId) continue;
            if (this.team && p.team === this.team) continue;
            if (this.hitTargets.has(pid)) continue;
            const d = dist3(this.position, p.position);
            if (d < this.radius + p.hitboxRadius) {
                this.hitTargets.add(pid);
                this.onImpact(room, p);
                if (!this.piercing) return;
            }
        }
    }

    onImpact(room, target) {
        const owner = room.players.get(this.ownerId);
        if (this.aoeOnImpact && this.aoeRadius > 0) {
            for (const [pid, p] of room.players) {
                if (p.dead || pid === this.ownerId) continue;
                if (this.team && p.team === this.team) continue;
                const d = dist3(this.position, p.position);
                if (d < this.aoeRadius + p.hitboxRadius) {
                    const fall = 1 - (d / (this.aoeRadius + p.hitboxRadius)) * 0.4;
                    p.takeDamage(this.damage * fall, owner, room, {
                        knockback: this.knockback,
                        source: 'projectile_aoe',
                        statusApply: this.statusApply
                    });
                }
            }
            room.broadcastEffect('explosion', { position: this.position, radius: this.aoeRadius, color: this.color });
        } else if (target) {
            target.takeDamage(this.damage, owner, room, {
                knockback: this.knockback,
                knockbackDir: normalize3(this.velocity),
                source: 'projectile',
                statusApply: this.statusApply
            });
            if (this.placesMarker && owner) owner.placeMarker(target.position, target.id);
        }
        if (this.pillarAoe && this.pillarRadius > 0) {
            const groundPos = { x: this.position.x, y: 0, z: this.position.z };
            for (const [pid, p] of room.players) {
                if (p.dead || pid === this.ownerId) continue;
                if (this.team && p.team === this.team) continue;
                const d = dist2(groundPos, p.position);
                if (d < this.pillarRadius + p.hitboxRadius) {
                    p.takeDamage(this.damage * 0.6, owner, room, { source: 'pillar', statusApply: this.statusApply });
                }
            }
            room.broadcastEffect('ice_pillar', { position: groundPos, radius: this.pillarRadius });
        }
        if (this.chains && this.chainCount > 0 && target) {
            this.chainCount--;
            this.chainsHit.add(target.id);
            let nearest = null, nearestDist = 8;
            for (const [pid, p] of room.players) {
                if (p.dead || this.chainsHit.has(pid) || pid === this.ownerId) continue;
                if (this.team && p.team === this.team) continue;
                const d = dist3(target.position, p.position);
                if (d < nearestDist) { nearestDist = d; nearest = p; }
            }
            if (nearest) {
                room.broadcastEffect('chain_lightning', { from: target.position, to: nearest.position, color: this.color });
                nearest.takeDamage(this.damage * 0.7, owner, room, { source: 'chain', statusApply: this.statusApply });
            }
        }
        if (this.placesGroundMarker && owner) owner.placeMarker(this.position, null);
        this.dead = true;
    }

    serialize() {
        return {
            id: this.id, ownerId: this.ownerId, position: this.position,
            velocity: this.velocity, visualType: this.visualType,
            color: this.color, radius: this.radius, beam: this.beam,
            beamWidth: this.beamWidth
        };
    }
}

// =============================================================================
// PLAYER CLASS
// =============================================================================
class Player {
    constructor(socketId, name, characterId) {
        this.id = socketId;
        this.socketId = socketId;
        this.name = sanitizeName(name);
        this.characterId = CHARACTERS[characterId] ? characterId : 'goku';
        this.character = CHARACTERS[this.characterId];
        this.team = null;
        this.position = { x: 0, y: 2, z: 0 };
        this.velocity = { x: 0, y: 0, z: 0 };
        this.rotation = 0;
        this.cameraYaw = 0;
        this.cameraPitch = 0;
        this.hitboxRadius = 0.7;
        this.hitboxHeight = 1.8;
        this.maxHp = this.character.stats.maxHp;
        this.hp = this.maxHp;
        this.maxMp = this.character.stats.maxMp;
        this.mp = this.maxMp;
        this.ultGauge = 0;
        this.dead = false;
        this.respawnTimer = 0;
        this.score = 0;
        this.kills = 0;
        this.deaths = 0;
        this.assists = 0;
        this.damageDealt = 0;
        this.damageTaken = 0;
        this.cooldowns = { light: 0, heavy: 0, q: 0, e: 0, r: 0, f: 0 };
        this.statusEffects = new Map();
        this.dashCharges = CONFIG.DASH_CHARGES_MAX;
        this.dashRechargeTimer = 0;
        this.isDashing = false;
        this.dashTimer = 0;
        this.dashDir = { x: 0, y: 0, z: 0 };
        this.onGround = false;
        this.canDoubleJump = true;
        this.isBlocking = false;
        this.parryTimer = 0;
        this.hitstunTimer = 0;
        this.invulnTimer = 0;
        this.actionLockTimer = 0;
        this.castingAbility = null;
        this.castTimer = 0;
        this.comboCount = 0;
        this.comboTimer = 0;
        this.comboTarget = null;
        this.lastDamageTime = 0;
        this.markers = [];
        this.clones = [];
        this.lockOnTarget = null;
        this.outOfCombatTimer = 0;
        this.transformedSuper = false;
        this.transformCooldown = 0;
        this.maskActive = false;
        this.maskCooldown = 0;
        this.lastAttackOnTarget = null;
        this.heartStacks = 0;
        this.heartStackTimer = 0;
        this.consecutiveHits = 0;
        this.lastInputSeq = 0;
        this.lastChatMs = 0;
        this.connected = true;
        this.ping = 0;
        this.spawnInvuln = 2.0;
    }

    reset(spawnPoint) {
        this.position = { ...spawnPoint };
        this.velocity = { x: 0, y: 0, z: 0 };
        this.hp = this.maxHp;
        this.mp = this.maxMp;
        this.dead = false;
        this.respawnTimer = 0;
        for (const k in this.cooldowns) this.cooldowns[k] = 0;
        this.statusEffects.clear();
        this.dashCharges = CONFIG.DASH_CHARGES_MAX;
        this.isDashing = false;
        this.dashTimer = 0;
        this.hitstunTimer = 0;
        this.invulnTimer = 0;
        this.actionLockTimer = 0;
        this.castingAbility = null;
        this.castTimer = 0;
        this.comboCount = 0;
        this.markers = [];
        this.clones = [];
        this.transformedSuper = false;
        this.maskActive = false;
        this.spawnInvuln = 2.0;
    }

    applyStatus(effectId, source) {
        const def = STATUS_EFFECTS[effectId];
        if (!def) return;
        if (this.hasStatus('INVULN')) return;
        const existing = this.statusEffects.get(effectId);
        if (existing && def.canStack) {
            existing.stacks = Math.min((existing.stacks || 1) + 1, def.maxStacks || 99);
            existing.duration = def.duration;
            existing.elapsed = 0;
        } else if (existing) {
            existing.duration = def.duration;
            existing.elapsed = 0;
        } else {
            this.statusEffects.set(effectId, {
                id: effectId, def: def, duration: def.duration,
                elapsed: 0, tickTimer: 0, stacks: 1, source: source ? source.id : null
            });
        }
    }

    hasStatus(effectId) { return this.statusEffects.has(effectId); }

    removeStatus(effectId) { this.statusEffects.delete(effectId); }

    isDisabled() {
        for (const [, e] of this.statusEffects) {
            if (e.def.preventActions) return true;
        }
        return this.hitstunTimer > 0 || this.dead;
    }

    getMoveSpeedMultiplier() {
        let m = 1;
        for (const [, e] of this.statusEffects) {
            if (e.def.slowMultiplier !== undefined) m *= e.def.slowMultiplier;
        }
        if (this.transformedSuper) m *= 1.2;
        return m;
    }

    getDamageMultiplier() {
        let m = 1;
        for (const [, e] of this.statusEffects) {
            if (e.def.damageMultiplier) m *= e.def.damageMultiplier;
        }
        if (this.transformedSuper) m *= 1.3;
        if (this.maskActive) m *= 1.25;
        if (this.characterId === 'rengoku' && this.hp < this.maxHp * 0.3) m *= 1.3;
        if (this.characterId === 'mitsuri' && this.heartStacks > 0) m *= (1 + this.heartStacks * 0.05);
        return m * this.character.stats.damage;
    }

    getDamageReduction() {
        let r = 0;
        for (const [, e] of this.statusEffects) {
            if (e.def.damageReduction) r = Math.max(r, e.def.damageReduction);
        }
        if (this.characterId === 'allmight') r = Math.max(r, 0.2);
        return r;
    }

    takeDamage(amount, attacker, room, opts = {}) {
        if (this.dead || this.spawnInvuln > 0) return 0;
        if (this.invulnTimer > 0) return 0;
        for (const [, e] of this.statusEffects) {
            if (e.def.invulnerable) return 0;
        }
        if (this.parryTimer > 0 && attacker) {
            this.parryTimer = 0;
            this.applyStatus('BUFF_ATK', this);
            attacker.hitstunTimer = CONFIG.PARRY_REWARD_TIME;
            attacker.actionLockTimer = CONFIG.PARRY_REWARD_TIME;
            room.broadcastEffect('parry', { position: this.position });
            return 0;
        }
        let final = amount;
        if (this.isBlocking && opts.source !== 'dot') {
            final *= (1 - CONFIG.BLOCK_DAMAGE_REDUCTION);
            room.broadcastEffect('block', { position: this.position });
        }
        final *= (1 - this.getDamageReduction());
        if (attacker && attacker.comboCount > 0 && opts.source !== 'dot') {
            const idx = Math.min(attacker.comboCount, CONFIG.COMBO_DAMAGE_SCALING.length - 1);
            final *= CONFIG.COMBO_DAMAGE_SCALING[idx];
        }
        final = Math.max(1, Math.round(final));
        this.hp -= final;
        this.damageTaken += final;
        this.lastDamageTime = nowSec();
        this.outOfCombatTimer = 0;
        this.ultGauge = Math.min(CONFIG.ULT_GAUGE_MAX, this.ultGauge + final * CONFIG.ULT_GAUGE_PER_DAMAGE_TAKEN);
        if (this.characterId === 'naruto') {
            this.ultGauge = Math.min(CONFIG.ULT_GAUGE_MAX, this.ultGauge + final * CONFIG.ULT_GAUGE_PER_DAMAGE_TAKEN * 0.5);
        }
        if (opts.statusApply && Array.isArray(opts.statusApply)) {
            for (const s of opts.statusApply) this.applyStatus(s, attacker);
        }
        if (opts.knockback && opts.knockback > 0) {
            const dir = opts.knockbackDir || (attacker ? normalize3(vecSub(this.position, attacker.position)) : { x: 0, y: 0, z: 0 });
            this.velocity.x += dir.x * opts.knockback;
            this.velocity.y += Math.max(dir.y * opts.knockback, opts.launches ? 8 : 2);
            this.velocity.z += dir.z * opts.knockback;
            this.hitstunTimer = CONFIG.HITSTUN_BASE + opts.knockback * 0.02;
        } else if (opts.source !== 'dot') {
            this.hitstunTimer = CONFIG.HITSTUN_BASE * 0.5;
        }
        if (attacker && attacker !== this) {
            attacker.damageDealt += final;
            attacker.ultGauge = Math.min(CONFIG.ULT_GAUGE_MAX, attacker.ultGauge + final * CONFIG.ULT_GAUGE_PER_DAMAGE_DEALT);
            if (attacker.comboTarget === this.id || !attacker.comboTarget) {
                attacker.comboCount++;
                attacker.comboTimer = CONFIG.COMBO_DECAY_TIME;
                attacker.comboTarget = this.id;
            } else {
                attacker.comboCount = 1;
                attacker.comboTimer = CONFIG.COMBO_DECAY_TIME;
                attacker.comboTarget = this.id;
            }
            if (attacker.characterId === 'mitsuri') {
                if (attacker.lastAttackOnTarget === this.id) {
                    attacker.heartStacks = Math.min(5, attacker.heartStacks + 1);
                } else {
                    attacker.heartStacks = 1;
                }
                attacker.lastAttackOnTarget = this.id;
                attacker.heartStackTimer = 4.0;
            }
            if (opts.lifesteal || attacker.characterId === 'alucard') {
                const heal = final * (opts.lifestealAmplified || 0.25);
                attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
            }
            if (attacker.characterId === 'ichigo' && attacker.maskActive) {
                attacker.hp = Math.min(attacker.maxHp, attacker.hp + final * 0.15);
            }
        }
        room.broadcastEffect('hit', { position: this.position, damage: final, critical: opts.critical });
        if (this.hp <= 0) this.die(attacker, room);
        return final;
    }

    die(killer, room) {
        if (this.dead) return;
        this.dead = true;
        this.deaths++;
        this.respawnTimer = CONFIG.RESPAWN_TIME;
        this.statusEffects.clear();
        this.comboCount = 0;
        this.castingAbility = null;
        this.transformedSuper = false;
        this.maskActive = false;
        if (killer && killer !== this) {
            killer.kills++;
            killer.score++;
            killer.ultGauge = Math.min(CONFIG.ULT_GAUGE_MAX, killer.ultGauge + 15);
        }
        room.broadcastEffect('death', { position: this.position, killer: killer ? killer.name : null, victim: this.name });
        room.io.to(room.id).emit('killfeed', {
            killer: killer ? { name: killer.name, character: killer.characterId } : null,
            victim: { name: this.name, character: this.characterId },
            ability: this.lastDamageSource || 'attack'
        });
    }

    placeMarker(pos, targetId) {
        this.markers.push({ position: { ...pos }, targetId, time: 8.0 });
        if (this.markers.length > 5) this.markers.shift();
    }

    canUseAbility(slot) {
        if (this.isDisabled()) return false;
        if (this.castingAbility) return false;
        if (this.actionLockTimer > 0) return false;
        const ab = this.character.abilities[slot];
        if (!ab) return false;
        if (this.cooldowns[slot] > 0) return false;
        if (ab.manaCost && this.mp < ab.manaCost) return false;
        if (ab.ultGaugeCost && this.ultGauge < ab.ultGaugeCost) return false;
        return true;
    }

    useAbility(slot, room, target) {
        if (!this.canUseAbility(slot)) return false;
        const ab = this.character.abilities[slot];
        this.cooldowns[slot] = ab.cooldown / (this.transformedSuper ? 1.2 : 1);
        if (ab.manaCost) this.mp -= ab.manaCost;
        if (ab.ultGaugeCost) this.ultGauge = 0;
        if (ab.hpCost) this.hp = Math.max(1, this.hp - ab.hpCost);
        if (this.characterId === 'allmight') this.hp = Math.min(this.maxHp, this.hp + 5);
        const damageMult = this.getDamageMultiplier();
        const baseDamage = ab.damage * damageMult;

        if (ab.buff) {
            this.applyStatus(ab.buff, this);
            if (ab.buffStacks) for (const b of ab.buffStacks) this.applyStatus(b, this);
            room.broadcastEffect('buff', { position: this.position, color: this.character.auraColor });
        }
        if (ab.blink) {
            const dir = this.getFacingDir();
            const dist = ab.range;
            this.position.x += dir.x * dist;
            this.position.z += dir.z * dist;
            this.position.y += 0.5;
            if (ab.grantsInvuln) this.invulnTimer = ab.grantsInvuln;
            room.broadcastEffect('blink', { from: this.position, to: this.position, color: this.character.auraColor });
        }
        if (ab.dashAttack) {
            const dir = this.getFacingDir();
            this.velocity.x = dir.x * 30;
            this.velocity.z = dir.z * 30;
            this.actionLockTimer = 0.3;
            this.scheduleMeleeHit(room, baseDamage, ab, 0.15);
        }
        if (ab.leap) {
            const dir = this.getFacingDir();
            this.velocity.x = dir.x * 18;
            this.velocity.z = dir.z * 18;
            this.velocity.y = ab.leapHeight || 12;
            this.scheduleMeleeHit(room, baseDamage, ab, 0.4);
        }
        if (ab.teleportToMarker && this.markers.length > 0) {
            const m = this.markers[this.markers.length - 1];
            this.position = { ...m.position };
            this.position.y += 1;
            this.invulnTimer = 0.3;
            room.broadcastEffect('teleport_flash', { position: this.position, color: this.character.auraColor });
            if (ab.followUpAttack) this.scheduleMeleeHit(room, baseDamage, ab, 0.1);
        }
        if (ab.multiTeleport) {
            this.castingAbility = { slot, ab, hits: ab.teleportHits, hitsDone: 0, interval: 0.25, timer: 0, damagePerHit: ab.damagePerHit * damageMult };
            this.castTimer = ab.cinematicTime || 2.0;
            this.invulnTimer = ab.cinematicTime || 2.0;
        }
        if (ab.summonsClones) {
            for (let i = 0; i < ab.summonsClones; i++) {
                const angle = (i / ab.summonsClones) * Math.PI * 2;
                this.clones.push({
                    position: { x: this.position.x + Math.cos(angle) * 2, y: this.position.y, z: this.position.z + Math.sin(angle) * 2 },
                    duration: ab.cloneDuration, attackTimer: 1.0, damage: ab.damage * damageMult * 0.5
                });
            }
            room.broadcastEffect('clone_summon', { position: this.position });
        }
        if (ab.projectile) {
            const count = ab.projectileCount || 1;
            const spread = ab.projectileSpread || 0;
            const baseDir = this.getFacingDir();
            const fire = (idx) => {
                const angle = count > 1 ? (idx - (count - 1) / 2) * spread : 0;
                const cos = Math.cos(angle), sin = Math.sin(angle);
                const dir = { x: baseDir.x * cos - baseDir.z * sin, y: baseDir.y, z: baseDir.x * sin + baseDir.z * cos };
                const speed = ab.projectileSpeed || 25;
                const proj = new Projectile({
                    ownerId: this.id, team: this.team,
                    position: { x: this.position.x + dir.x * 1.2, y: this.position.y + 1.2, z: this.position.z + dir.z * 1.2 },
                    velocity: vecScale(dir, speed),
                    damage: baseDamage / (ab.projectileCount && !ab.beam ? 1 : 1),
                    radius: 0.4, width: ab.projectileWidth || 0.8,
                    lifetime: ab.range / speed + 0.5,
                    statusApply: ab.statusApply || [],
                    aoeOnImpact: ab.aoeOnImpact, aoeRadius: ab.aoeRadius || 0,
                    pillarAoe: ab.pillarAoe, pillarRadius: ab.pillarRadius || 0,
                    chains: ab.chains, chainCount: ab.chainCount || 0,
                    knockback: ab.knockback || 0,
                    placesMarker: ab.placesMarker, placesGroundMarker: ab.placesGroundMarker,
                    color: this.character.color, visualType: ab.animType
                });
                room.projectiles.push(proj);
            };
            if (ab.projectileInterval) {
                this.castingAbility = { slot, ab, fire, count, idx: 0, interval: ab.projectileInterval, timer: 0 };
                this.castTimer = count * ab.projectileInterval;
            } else {
                for (let i = 0; i < count; i++) fire(i);
            }
        }
        if (ab.beam) {
            const dir = this.getFacingDir();
            const proj = new Projectile({
                ownerId: this.id, team: this.team,
                position: { x: this.position.x + dir.x * 1.5, y: this.position.y + 1.2, z: this.position.z + dir.z * 1.5 },
                velocity: vecScale(dir, 60),
                damage: baseDamage, radius: ab.beamWidth || 2,
                lifetime: 0.6, beam: true, beamWidth: ab.beamWidth,
                piercing: true, color: this.character.color, visualType: 'beam'
            });
            room.projectiles.push(proj);
            room.broadcastEffect('beam_charge', { position: this.position, dir, color: this.character.color, width: ab.beamWidth });
        }
        if (ab.aoeAttack && !ab.projectile && !ab.beam) {
            const center = ab.groundTarget && target ? target : this.position;
            for (const [pid, p] of room.players) {
                if (p.dead || pid === this.id) continue;
                if (this.team && p.team === this.team) continue;
                const d = dist3(center, p.position);
                if (d < ab.aoeRadius + p.hitboxRadius) {
                    const fall = 1 - (d / (ab.aoeRadius + p.hitboxRadius)) * 0.3;
                    const hits = ab.multiHit || 1;
                    for (let h = 0; h < hits; h++) {
                        p.takeDamage(baseDamage * fall / hits, this, room, {
                            knockback: ab.knockback || 0, statusApply: ab.statusApply || []
                        });
                    }
                }
            }
            room.broadcastEffect('aoe_burst', { position: center, radius: ab.aoeRadius, color: this.character.color });
        }
        if (!ab.projectile && !ab.beam && !ab.aoeAttack && !ab.dashAttack && !ab.leap && !ab.teleportToMarker && !ab.blink && !ab.buff && !ab.summonsClones && !ab.multiTeleport) {
            this.scheduleMeleeHit(room, baseDamage, ab, 0.1);
        }
        if (ab.selfStun) this.applyStatus('STUN', null);
        if (ab.ultimate && this.characterId === 'megumin') {
            this.applyStatus('STUN', null);
            const stun = this.statusEffects.get('STUN');
            if (stun) stun.duration = ab.selfStun || 5;
        }
        room.broadcastEffect('cast', { position: this.position, ability: ab.animType, color: this.character.color, slot });
        return true;
    }

    scheduleMeleeHit(room, damage, ab, delay) {
        setTimeout(() => {
            if (this.dead) return;
            const dir = this.getFacingDir();
            const hitCenter = { x: this.position.x + dir.x * (ab.range / 2), y: this.position.y + 1, z: this.position.z + dir.z * (ab.range / 2) };
            const hits = ab.multiHit || 1;
            for (const [pid, p] of room.players) {
                if (p.dead || pid === this.id) continue;
                if (this.team && p.team === this.team) continue;
                const d = dist3(hitCenter, p.position);
                if (d < ab.range / 1.5 + p.hitboxRadius) {
                    let crit = false;
                    if (ab.critChance && Math.random() < ab.critChance) crit = true;
                    if (this.characterId === 'killua') {
                        this.consecutiveHits++;
                        if (this.consecutiveHits >= 3) { crit = true; this.consecutiveHits = 0; }
                    }
                    const finalDmg = crit ? damage * 1.5 : damage;
                    const statusList = [...(ab.statusApply || [])];
                    if (crit && ab.statusApplyOnCrit) statusList.push(...ab.statusApplyOnCrit);
                    if (this.characterId === 'rengoku' && (ab.animType || '').startsWith('slash')) statusList.push('BURN');
                    p.takeDamage(finalDmg, this, room, {
                        knockback: ab.knockback || 0, launches: ab.launches,
                        statusApply: statusList, critical: crit, source: 'melee'
                    });
                }
            }
        }, delay * 1000);
    }

    getFacingDir() {
        return { x: Math.sin(this.rotation), y: 0, z: Math.cos(this.rotation) };
    }

    update(dt, input, room) {
        if (this.dead) {
            this.respawnTimer -= dt;
            if (this.respawnTimer <= 0) this.respawn(room);
            return;
        }
        if (this.spawnInvuln > 0) this.spawnInvuln -= dt;
        if (this.invulnTimer > 0) this.invulnTimer -= dt;
        if (this.actionLockTimer > 0) this.actionLockTimer -= dt;
        if (this.hitstunTimer > 0) this.hitstunTimer -= dt;
        if (this.parryTimer > 0) this.parryTimer -= dt;
        if (this.transformCooldown > 0) this.transformCooldown -= dt;
        if (this.maskCooldown > 0) this.maskCooldown -= dt;
        if (this.heartStackTimer > 0) { this.heartStackTimer -= dt; if (this.heartStackTimer <= 0) this.heartStacks = 0; }
        if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) { this.comboCount = 0; this.comboTarget = null; } }
        for (const k in this.cooldowns) if (this.cooldowns[k] > 0) this.cooldowns[k] -= dt;
        this.outOfCombatTimer += dt;
        this.mp = Math.min(this.maxMp, this.mp + this.character.stats.mpRegen * dt);
        if (this.characterId === 'naruto' && this.outOfCombatTimer > 0) this.hp = Math.min(this.maxHp, this.hp + 2 * dt);
        if (this.characterId === 'nezuko' && this.outOfCombatTimer > 4) this.hp = Math.min(this.maxHp, this.hp + 3 * dt);
        if (this.dashCharges < CONFIG.DASH_CHARGES_MAX) {
            this.dashRechargeTimer -= dt;
            if (this.dashRechargeTimer <= 0) { this.dashCharges++; this.dashRechargeTimer = CONFIG.DASH_RECHARGE_TIME; }
        }
        if (this.castingAbility) {
            const c = this.castingAbility;
            c.timer += dt;
            if (c.fire && c.idx < c.count && c.timer >= c.interval) {
                c.fire(c.idx); c.idx++; c.timer = 0;
                if (c.idx >= c.count) { this.castingAbility = null; this.castTimer = 0; }
            }
            if (c.hits !== undefined) {
                if (c.timer >= c.interval && c.hitsDone < c.hits) {
                    let nearest = null, nd = 999;
                    for (const [pid, p] of room.players) {
                        if (p.dead || pid === this.id) continue;
                        if (this.team && p.team === this.team) continue;
                        const d = dist3(this.position, p.position);
                        if (d < nd) { nd = d; nearest = p; }
                    }
                    if (nearest) {
                        this.position = { x: nearest.position.x - this.getFacingDir().x * 1.5, y: nearest.position.y, z: nearest.position.z - this.getFacingDir().z * 1.5 };
                        nearest.takeDamage(c.damagePerHit, this, room, { source: 'teleport_combo' });
                        room.broadcastEffect('teleport_flash', { position: nearest.position, color: this.character.auraColor });
                    }
                    c.hitsDone++; c.timer = 0;
                    if (c.hitsDone >= c.hits) { this.castingAbility = null; this.castTimer = 0; }
                }
            }
            this.castTimer -= dt;
            if (this.castTimer <= 0 && !c.fire && c.hits === undefined) { this.castingAbility = null; }
        }
        for (const [id, eff] of this.statusEffects) {
            eff.elapsed += dt; eff.tickTimer += dt;
            if (eff.tickTimer >= eff.def.tickRate) {
                eff.tickTimer = 0;
                if (eff.def.damagePerTick !== 0) {
                    const dmg = eff.def.damagePerTick * (eff.stacks || 1);
                    if (dmg > 0) this.takeDamage(dmg, null, room, { source: 'dot' });
                    else this.hp = Math.min(this.maxHp, this.hp - dmg);
                }
            }
            if (eff.elapsed >= eff.duration) this.statusEffects.delete(id);
        }
        for (let i = this.markers.length - 1; i >= 0; i--) {
            this.markers[i].time -= dt;
            if (this.markers[i].time <= 0) this.markers.splice(i, 1);
        }
        for (let i = this.clones.length - 1; i >= 0; i--) {
            const c = this.clones[i]; c.duration -= dt; c.attackTimer -= dt;
            if (c.attackTimer <= 0) {
                c.attackTimer = 1.5;
                let nearest = null, nd = 6;
                for (const [pid, p] of room.players) {
                    if (p.dead || pid === this.id) continue;
                    if (this.team && p.team === this.team) continue;
                    const d = dist3(c.position, p.position);
                    if (d < nd) { nd = d; nearest = p; }
                }
                if (nearest) nearest.takeDamage(c.damage, this, room, { source: 'clone' });
            }
            if (c.duration <= 0) this.clones.splice(i, 1);
        }
        if (this.characterId === 'goku' && !this.transformedSuper && this.hp < this.maxHp * 0.25 && this.transformCooldown <= 0) {
            this.transformedSuper = true; this.transformCooldown = 999;
            room.broadcastEffect('transform', { position: this.position, type: 'super_saiyan' });
        }
        if (this.characterId === 'ichigo' && !this.maskActive && this.hp < this.maxHp * 0.4 && this.maskCooldown <= 0) {
            this.maskActive = true; this.maskCooldown = 30;
            setTimeout(() => { this.maskActive = false; }, 8000);
            room.broadcastEffect('transform', { position: this.position, type: 'hollow_mask' });
        }
        if (input && !this.isDisabled()) this.processInput(input, dt, room);
        this.applyPhysics(dt, room);
    }

    processInput(input, dt, room) {
        if (typeof input.cameraYaw === 'number') this.cameraYaw = input.cameraYaw;
        if (typeof input.cameraPitch === 'number') this.cameraPitch = clamp(input.cameraPitch, -1.4, 1.4);
 let mx = 0, mz = 0;
        if (input.forward) mz -= 1;
        if (input.backward) mz += 1;
        if (input.left) mx -= 1;
        if (input.right) mx += 1;
        const len = Math.sqrt(mx * mx + mz * mz);
        if (len > 0) {
            mx /= len; mz /= len;
            // Camera-relative movement: yaw rotates input vector to world space
            const yaw = this.cameraYaw;
            const wx = mx * Math.cos(yaw) + mz * Math.sin(yaw);
            const wz = -mx * Math.sin(yaw) + mz * Math.cos(yaw);
            const speed = this.character.stats.moveSpeed * this.getMoveSpeedMultiplier();
            const ctrl = this.onGround ? 1 : CONFIG.AIR_CONTROL;
            const tt = Math.min(1, ctrl * dt * 12);
            this.velocity.x = lerp(this.velocity.x, wx * speed, tt);
            this.velocity.z = lerp(this.velocity.z, wz * speed, tt);
            // Face movement direction (only if not locked-on)
            if (!this.lockOnTarget) {
                this.rotation = Math.atan2(wx, wz);
            } else {
                const lt = room.players.get(this.lockOnTarget);
                if (lt && !lt.dead) {
                    this.rotation = Math.atan2(lt.position.x - this.position.x, lt.position.z - this.position.z);
                }
            }
        } else if (this.onGround) {
            this.velocity.x = lerp(this.velocity.x, 0, Math.min(1, dt * CONFIG.FRICTION));
            this.velocity.z = lerp(this.velocity.z, 0, Math.min(1, dt * CONFIG.FRICTION));
        }            this.velocity.x = lerp(this.velocity.x, 0, dt * CONFIG.FRICTION);
            this.velocity.z = lerp(this.velocity.z, 0, dt * CONFIG.FRICTION);
        }
        if (input.jump && !this.jumpHeld) {
            if (this.onGround) {
                this.velocity.y = CONFIG.JUMP_VELOCITY * this.character.stats.jumpHeight;
                this.onGround = false; this.canDoubleJump = true;
            } else if (this.canDoubleJump) {
                this.velocity.y = CONFIG.DOUBLE_JUMP_VELOCITY * this.character.stats.jumpHeight;
                this.canDoubleJump = false;
                room.broadcastEffect('double_jump', { position: this.position });
            }
        }
        this.jumpHeld = input.jump;
        if (input.dash && !this.dashHeld && this.dashCharges > 0 && !this.isDashing) {
            this.dashCharges--;
            if (this.dashRechargeTimer <= 0) this.dashRechargeTimer = CONFIG.DASH_RECHARGE_TIME;
            this.isDashing = true; this.dashTimer = CONFIG.DASH_DURATION;
            const dir = (mx === 0 && mz === 0) ? this.getFacingDir() : normalize3({ x: mx * Math.cos(this.cameraYaw) - mz * Math.sin(this.cameraYaw), y: 0, z: mx * Math.sin(this.cameraYaw) + mz * Math.cos(this.cameraYaw) });
            this.dashDir = dir;
            this.invulnTimer = Math.max(this.invulnTimer, 0.15);
            room.broadcastEffect('dash', { position: this.position, dir, color: this.character.auraColor });
        }
        this.dashHeld = input.dash;
        if (this.isDashing) {
            this.dashTimer -= dt;
            this.velocity.x = this.dashDir.x * CONFIG.DASH_SPEED;
            this.velocity.z = this.dashDir.z * CONFIG.DASH_SPEED;
            this.velocity.y = Math.max(this.velocity.y, -1);
            if (this.dashTimer <= 0) this.isDashing = false;
        }
        this.isBlocking = !!input.block;
        if (input.parry && !this.parryHeld) this.parryTimer = CONFIG.PARRY_WINDOW;
        this.parryHeld = input.parry;
        if (input.lockOn && !this.lockOnHeld) this.toggleLockOn(room);
        this.lockOnHeld = input.lockOn;
        if (input.light && !this.lightHeld) this.useAbility('light', room);
        this.lightHeld = input.light;
        if (input.heavy && !this.heavyHeld) this.useAbility('heavy', room);
        this.heavyHeld = input.heavy;
        if (input.q && !this.qHeld) this.useAbility('q', room);
        this.qHeld = input.q;
        if (input.e && !this.eHeld) this.useAbility('e', room, input.targetPos);
        this.eHeld = input.e;
        if (input.r && !this.rHeld) this.useAbility('r', room);
        this.rHeld = input.r;
        if (input.f && !this.fHeld) this.useAbility('f', room, input.targetPos);
        this.fHeld = input.f;
    }

    toggleLockOn(room) {
        if (this.lockOnTarget) { this.lockOnTarget = null; return; }
        let best = null, bestScore = Infinity;
        const facing = this.getFacingDir();
        for (const [pid, p] of room.players) {
            if (p.dead || pid === this.id) continue;
            if (this.team && p.team === this.team) continue;
            const d = dist3(this.position, p.position);
            if (d > CONFIG.LOCKON_RANGE) continue;
            const toTarget = normalize3(vecSub(p.position, this.position));
            const ang = angleBetween(facing, toTarget);
            if (ang > CONFIG.LOCKON_ANGLE) continue;
            const score = d + ang * 10;
            if (score < bestScore) { bestScore = score; best = pid; }
        }
        this.lockOnTarget = best;
    }

    applyPhysics(dt, room) {
        this.velocity.y += CONFIG.GRAVITY * dt;
        this.position.x += this.velocity.x * dt;
        this.position.y += this.velocity.y * dt;
        this.position.z += this.velocity.z * dt;
        const half = CONFIG.ARENA_SIZE / 2;
        this.position.x = clamp(this.position.x, -half, half);
        this.position.z = clamp(this.position.z, -half, half);
        this.onGround = false;
        // Ground - player position.y = bottom of feet, model offset handles rest
        if (this.position.y <= 1.0) {
            this.position.y = 1.0;
            this.velocity.y = 0;
            this.onGround = true;
            this.canDoubleJump = true;
        }
        // Platforms - check feet-on-top
        for (const plat of room.map.platforms) {
            const px = plat.x, pz = plat.z, py = plat.y;
            const hw = plat.w / 2, hd = plat.d / 2, hh = plat.h / 2;
            const top = py + hh;
            const inX = this.position.x > px - hw - 0.4 && this.position.x < px + hw + 0.4;
            const inZ = this.position.z > pz - hd - 0.4 && this.position.z < pz + hd + 0.4;
            if (inX && inZ) {
                // Standing on top
                if (this.position.y >= top - 0.1 && this.position.y <= top + 1.0 && this.velocity.y <= 0) {
                    this.position.y = top + 1.0;
                    this.velocity.y = 0;
                    this.onGround = true;
                    this.canDoubleJump = true;
                }
            }
        }
        if (this.position.y < CONFIG.MIN_Y_DEATH) this.die(null, room);
    }
        if (this.position.y < CONFIG.MIN_Y_DEATH) this.die(null, room);
    }

    respawn(room) {
        const sp = room.map.spawnPoints[Math.floor(Math.random() * room.map.spawnPoints.length)];
        this.reset(sp);
        room.broadcastEffect('respawn', { position: this.position, name: this.name });
    }

    serialize() {
        return {
            id: this.id, name: this.name, characterId: this.characterId, team: this.team,
            position: this.position, velocity: this.velocity, rotation: this.rotation,
            cameraYaw: this.cameraYaw, cameraPitch: this.cameraPitch,
            hp: this.hp, maxHp: this.maxHp, mp: this.mp, maxMp: this.maxMp,
            ultGauge: this.ultGauge, dead: this.dead, respawnTimer: this.respawnTimer,
            score: this.score, kills: this.kills, deaths: this.deaths,
            cooldowns: this.cooldowns, dashCharges: this.dashCharges,
            statusEffects: Array.from(this.statusEffects.keys()),
            isBlocking: this.isBlocking, isDashing: this.isDashing,
            transformedSuper: this.transformedSuper, maskActive: this.maskActive,
            lockOnTarget: this.lockOnTarget, comboCount: this.comboCount,
            invulnerable: this.invulnTimer > 0 || this.spawnInvuln > 0,
            clones: this.clones.map(c => ({ position: c.position }))
        };
    }
}

// =============================================================================
// ROOM CLASS
// =============================================================================
class Room {
    constructor(id, mode, mapId, hostId) {
        this.id = id;
        this.mode = GAME_MODES[mode] || GAME_MODES.ffa;
        this.mapId = mapId && MAPS[mapId] ? mapId : MAP_LIST[Math.floor(Math.random() * MAP_LIST.length)];
        this.map = MAPS[this.mapId];
        this.hostId = hostId;
        this.players = new Map();
        this.projectiles = [];
        this.effects = [];
        this.state = 'lobby';
        this.matchTimer = this.mode.timeLimit;
        this.lastTickMs = nowMs();
        this.io = io;
        this.createdAt = nowMs();
        this.teamScores = { 1: 0, 2: 0 };
        this.chatHistory = [];
    }

    addPlayer(player) {
        if (this.players.size >= this.mode.maxPlayers) return false;
        if (this.mode.teamBased) {
            const t1 = [...this.players.values()].filter(p => p.team === 1).length;
            const t2 = [...this.players.values()].filter(p => p.team === 2).length;
            player.team = t1 <= t2 ? 1 : 2;
        }
        this.players.set(player.id, player);
        return true;
    }

    removePlayer(playerId) {
        this.players.delete(playerId);
        if (playerId === this.hostId && this.players.size > 0) {
            this.hostId = this.players.keys().next().value;
        }
    }

    startMatch() {
        if (this.players.size < this.mode.minPlayers) return false;
        this.state = 'playing';
        this.matchTimer = this.mode.timeLimit;
        const sps = [...this.map.spawnPoints];
        let i = 0;
        for (const [, p] of this.players) {
            const sp = sps[i % sps.length]; i++;
            p.reset(sp);
            p.score = 0; p.kills = 0; p.deaths = 0;
        }
        this.teamScores = { 1: 0, 2: 0 };
        this.io.to(this.id).emit('matchStart', { mapId: this.mapId, mode: this.mode.id });
        return true;
    }

        endMatch(winnerName) {
        this.state = 'ended';
        const standings = [...this.players.values()].sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (b.kills !== a.kills) return b.kills - a.kills;
            return b.damageDealt - a.damageDealt;
        }).map(p => ({
            name: p.name,
            character: p.characterId,
            score: p.score,
            kills: p.kills,
            deaths: p.deaths,
            damageDealt: Math.round(p.damageDealt),
            damageTaken: Math.round(p.damageTaken),
            team: p.team
        }));
        this.io.to(this.id).emit('matchEnd', { winner: winnerName, standings, teamScores: this.teamScores });
        setTimeout(() => { this.state = 'lobby'; this.io.to(this.id).emit('returnToLobby'); }, 8000);
    }


    update(dt) {
        if (this.state !== 'playing') return;
        this.matchTimer -= dt;
        if (this.matchTimer <= 0) { this.endMatchByTime(); return; }
        for (const [, p] of this.players) p.update(dt, p.lastInput, this);
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            this.projectiles[i].update(dt, this);
            if (this.projectiles[i].dead) this.projectiles.splice(i, 1);
        }
        if (this.mode.teamBased) {
            const t1 = [...this.players.values()].filter(p => p.team === 1).reduce((s, p) => s + p.kills, 0);
            const t2 = [...this.players.values()].filter(p => p.team === 2).reduce((s, p) => s + p.kills, 0);
            this.teamScores = { 1: t1, 2: t2 };
            if (t1 >= this.mode.scoreLimit) this.endMatch('Team Red');
            else if (t2 >= this.mode.scoreLimit) this.endMatch('Team Blue');
        } else {
            for (const [, p] of this.players) {
                if (p.score >= this.mode.scoreLimit) { this.endMatch(p.name); return; }
            }
        }
    }

    endMatchByTime() {
        if (this.mode.teamBased) {
            const winner = this.teamScores[1] > this.teamScores[2] ? 'Team Red' : (this.teamScores[2] > this.teamScores[1] ? 'Team Blue' : 'Draw');
            this.endMatch(winner);
        } else {
            const top = [...this.players.values()].sort((a, b) => b.score - a.score)[0];
            this.endMatch(top ? top.name : 'No one');
        }
    }

    broadcastState() {
        const state = {
            t: nowMs(),
            timer: this.matchTimer,
            players: [...this.players.values()].map(p => p.serialize()),
            projectiles: this.projectiles.map(p => p.serialize()),
            teamScores: this.teamScores,
            state: this.state
        };
        this.io.to(this.id).emit('state', state);
    }

    broadcastEffect(type, data) {
        this.io.to(this.id).emit('effect', { type, data, t: nowMs() });
    }

    chat(playerId, msg) {
        const p = this.players.get(playerId);
        if (!p) return;
        const now = nowMs();
        if (now - p.lastChatMs < CONFIG.CHAT_COOLDOWN_MS) return;
        p.lastChatMs = now;
        const clean = sanitizeChat(msg);
        if (!clean) return;
        const entry = { name: p.name, team: p.team, msg: clean, t: now };
        this.chatHistory.push(entry);
        if (this.chatHistory.length > 50) this.chatHistory.shift();
        this.io.to(this.id).emit('chat', entry);
    }

    lobbyInfo() {
        return {
            id: this.id, mode: this.mode.id, mapId: this.mapId, hostId: this.hostId,
            state: this.state, playerCount: this.players.size, maxPlayers: this.mode.maxPlayers,
            players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, character: p.characterId, team: p.team }))
        };
    }
}

// =============================================================================
// ROOM MANAGER
// =============================================================================
const rooms = new Map();
const playerRoom = new Map();

function createRoom(mode, mapId, hostId) {
    if (rooms.size >= CONFIG.MAX_ROOMS) return null;
    const id = genId('room');
    const room = new Room(id, mode, mapId, hostId);
    rooms.set(id, room);
    return room;
}

function findOrCreateRoom(mode) {
    for (const [, r] of rooms) {
        if (r.mode.id === mode && r.state === 'lobby' && r.players.size < r.mode.maxPlayers) return r;
    }
    return createRoom(mode, null, null);
}

function cleanupRooms() {
    const now = nowMs();
    for (const [id, r] of rooms) {
        if (r.players.size === 0 && now - r.createdAt > 60000) rooms.delete(id);
        else if (now - r.createdAt > CONFIG.ROOM_TIMEOUT_MS) {
            r.io.to(r.id).emit('roomClosed', { reason: 'timeout' });
            rooms.delete(id);
        }
    }
}
setInterval(cleanupRooms, 30000);

// =============================================================================
// MAIN GAME LOOP
// =============================================================================
let lastLoopMs = nowMs();
function gameLoop() {
    const now = nowMs();
    const dt = Math.min(0.1, (now - lastLoopMs) / 1000);
    lastLoopMs = now;
    for (const [, r] of rooms) {
        r.update(dt);
        if (r.state === 'playing') r.broadcastState();
    }
}
setInterval(gameLoop, CONFIG.TICK_INTERVAL);

// =============================================================================
// SOCKET.IO HANDLERS
// =============================================================================
io.on('connection', (socket) => {
    console.log(`[CONN] ${socket.id}`);
    socket.emit('hello', {
        characters: CHARACTERS, maps: MAPS, modes: GAME_MODES,
        statusEffects: STATUS_EFFECTS, config: { TICK_RATE: CONFIG.TICK_RATE, ARENA_SIZE: CONFIG.ARENA_SIZE }
    });

    socket.on('listRooms', () => {
        const list = [...rooms.values()].filter(r => r.state === 'lobby').map(r => r.lobbyInfo());
        socket.emit('roomList', list);
    });

    socket.on('createRoom', (data) => {
        const room = createRoom(data.mode || 'ffa', data.mapId, socket.id);
        if (!room) { socket.emit('error', { msg: 'Cannot create room' }); return; }
        const player = new Player(socket.id, data.name, data.character);
        room.addPlayer(player);
        playerRoom.set(socket.id, room.id);
        socket.join(room.id);
        socket.emit('joinedRoom', { room: room.lobbyInfo(), youAre: socket.id });
        io.to(room.id).emit('roomUpdate', room.lobbyInfo());
    });

    socket.on('joinRoom', (data) => {
        let room = data.roomId ? rooms.get(data.roomId) : findOrCreateRoom(data.mode || 'ffa');
        if (!room) { socket.emit('error', { msg: 'Room not found' }); return; }
        if (room.players.size >= room.mode.maxPlayers) { socket.emit('error', { msg: 'Room full' }); return; }
        const player = new Player(socket.id, data.name, data.character);
        if (!room.addPlayer(player)) { socket.emit('error', { msg: 'Cannot join' }); return; }
        playerRoom.set(socket.id, room.id);
        socket.join(room.id);
        socket.emit('joinedRoom', { room: room.lobbyInfo(), youAre: socket.id });
        io.to(room.id).emit('roomUpdate', room.lobbyInfo());
    });

    socket.on('changeCharacter', (data) => {
        const roomId = playerRoom.get(socket.id);
        const room = rooms.get(roomId);
        if (!room || room.state !== 'lobby') return;
        const p = room.players.get(socket.id);
        if (!p || !CHARACTERS[data.character]) return;
        p.characterId = data.character;
        p.character = CHARACTERS[data.character];
        p.maxHp = p.character.stats.maxHp; p.hp = p.maxHp;
        p.maxMp = p.character.stats.maxMp; p.mp = p.maxMp;
        io.to(room.id).emit('roomUpdate', room.lobbyInfo());
    });

    socket.on('startMatch', () => {
        const roomId = playerRoom.get(socket.id);
        const room = rooms.get(roomId);
        if (!room) return;
        if (room.hostId !== socket.id) return;
        room.startMatch();
    });

    socket.on('input', (input) => {
        const roomId = playerRoom.get(socket.id);
        const room = rooms.get(roomId);
        if (!room || room.state !== 'playing') return;
        const p = room.players.get(socket.id);
        if (!p) return;
        if (typeof input.seq === 'number' && input.seq <= p.lastInputSeq) return;
        if (typeof input.seq === 'number') p.lastInputSeq = input.seq;
        p.lastInput = input;
    });

    socket.on('chat', (data) => {
        const roomId = playerRoom.get(socket.id);
        const room = rooms.get(roomId);
        if (!room) return;
        room.chat(socket.id, data.msg);
    });

    socket.on('leaveRoom', () => {
        const roomId = playerRoom.get(socket.id);
        const room = rooms.get(roomId);
        if (!room) return;
        room.removePlayer(socket.id);
        socket.leave(room.id);
        playerRoom.delete(socket.id);
        io.to(room.id).emit('roomUpdate', room.lobbyInfo());
    });

    socket.on('ping', (cb) => { if (typeof cb === 'function') cb(nowMs()); });

    socket.on('disconnect', () => {
        console.log(`[DISC] ${socket.id}`);
        const roomId = playerRoom.get(socket.id);
        const room = rooms.get(roomId);
        if (room) {
            room.removePlayer(socket.id);
            io.to(room.id).emit('roomUpdate', room.lobbyInfo());
        }
        playerRoom.delete(socket.id);
    });
});

server.listen(CONFIG.PORT, () => {
    console.log(`[SERVER] Listening on port ${CONFIG.PORT}`);
    console.log(`[SERVER] http://localhost:${CONFIG.PORT}`);
});
