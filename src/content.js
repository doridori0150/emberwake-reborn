/* 도구(editor.html)가 관리하는 콘텐츠: 추가 적·등장 조합·수제 방. 아래 객체는 JSON 그대로라 손으로 고쳐도 된다.
   data.js 가 이 표를 기본 표에 합친다(같은 id 는 덮어쓴다). 도구에서 저장하면 이 파일 전체를 다시 쓴다. */
(function (g) {
  'use strict';
  const ER = g.ER = g.ER || {};
  ER.CONTENT = {
  "enemies": {
    "sporeling": { "name": "포자 등짐꾼", "asset": "enemy.goblin", "tint": "hue-rotate(60deg) saturate(1.5)", "hp": 6, "dmg": 2, "speed": 3, "detect": 3, "ai": "melee", "size": 44, "gold": [1, 3], "loot": [["herb", 0.6]], "traits": { "explode": { "dmg": 4 } } },
    "pilferer": { "name": "좀도둑", "asset": "enemy.goblin", "tint": "sepia(0.8) brightness(1.1)", "hp": 8, "dmg": 1, "speed": 4, "detect": 4, "ai": "melee", "size": 42, "gold": [3, 5], "loot": [["flax", 0.5]], "traits": { "thief": { "gold": 8 } } },
    "alpha": { "name": "굶주린 우두머리 늑대", "asset": "enemy.wolf", "tint": "hue-rotate(-40deg) saturate(1.8)", "hp": 13, "dmg": 3, "speed": 4, "detect": 4, "ai": "pack", "size": 50, "gold": [3, 5], "loot": [["hide", 1]], "traits": { "enrage": { "below": 50, "dmg": 2, "speed": 1 } } },
    "slag": { "name": "슬래그 덩어리", "asset": "enemy.brute", "tint": "hue-rotate(10deg) saturate(2) brightness(0.9)", "hp": 12, "dmg": 4, "speed": 2, "detect": 3, "ai": "melee", "size": 52, "gold": [3, 5], "loot": [["coal", 0.7]], "traits": { "split": { "into": "slaglet", "n": 2 } } },
    "slaglet": { "name": "슬래그 조각", "asset": "enemy.goblin", "tint": "hue-rotate(-10deg) saturate(2.2)", "hp": 4, "dmg": 2, "speed": 3, "detect": 3, "ai": "melee", "size": 34, "gold": [0, 1], "loot": [["coal", 0.3]] },
    "shieldman": { "name": "방패 파수병", "asset": "enemy.brute", "tint": "hue-rotate(180deg) saturate(1.3)", "hp": 12, "dmg": 4, "speed": 2, "detect": 3, "ai": "melee", "size": 52, "gold": [4, 6], "loot": [["ore", 0.6], ["coal", 0.4]], "traits": { "frontArmor": { "n": 2 } } },
    "hexer": { "name": "금서 필경사", "asset": "enemy.archer", "tint": "hue-rotate(-100deg) saturate(1.4)", "hp": 10, "dmg": 3, "speed": 3, "detect": 5, "range": 5, "ai": "ranged", "size": 50, "gold": [4, 7], "loot": [["crystal", 0.4], ["flax", 0.4]], "traits": { "hex": { "n": 1 } } },
    "banner": { "name": "별빛 기수", "asset": "enemy.shaman", "tint": "hue-rotate(40deg) saturate(1.6) brightness(1.15)", "hp": 14, "dmg": 3, "speed": 2, "detect": 4, "ai": "melee", "size": 54, "gold": [5, 8], "loot": [["essence", 0.4], ["crystal", 0.3]], "traits": { "aura": { "armor": 1, "radius": 2 }, "regen": { "n": 1 } } },
    "nest": { "name": "필사 인형 둥지", "asset": "enemy.shaman", "tint": "grayscale(0.7) brightness(0.7)", "hp": 14, "dmg": 0, "speed": 0, "detect": 4, "ai": "none", "size": 46, "gold": [5, 8], "loot": [["essence", 0.5]], "traits": { "spawner": { "kind": "inkling", "every": 2, "max": 2 } } },
    "inkling": { "name": "먹물 인형", "asset": "enemy.goblin", "tint": "grayscale(1) brightness(0.55)", "hp": 4, "dmg": 3, "speed": 3, "detect": 4, "ai": "melee", "size": 36, "gold": [0, 0], "loot": [] }
  },
  "spawns": [
    { "region": "verdant", "room": "supply", "group": ["pilferer", "goblin"] },
    { "region": "verdant", "room": "mine", "group": ["sporeling", "wolf"] },
    { "region": "verdant", "room": "garden", "group": ["archer", "sporeling"] },
    { "region": "verdant", "room": "hall", "group": ["alpha", "wolf"] },
    { "region": "verdant", "room": "hall", "group": ["pilferer"] },
    { "region": "foundry", "room": "supply", "group": ["slag"] },
    { "region": "foundry", "room": "mine", "group": ["shieldman", "slinger"] },
    { "region": "foundry", "room": "mine2", "group": ["slag", "slinger"] },
    { "region": "foundry", "room": "garden", "group": ["slinger", "shieldman"] },
    { "region": "foundry", "room": "hall", "group": ["slag", "hound"] },
    { "region": "archive", "room": "supply", "group": ["hexer", "wraith"] },
    { "region": "archive", "room": "mine", "group": ["banner", "wraith", "wraith"] },
    { "region": "archive", "room": "mine2", "group": ["banner", "acolyte"] },
    { "region": "archive", "room": "garden", "group": ["hexer", "banner"] },
    { "region": "archive", "room": "hall", "group": ["nest", "wraith"] },
    { "region": "archive", "room": "hall2", "group": ["nest", "hexer"] }
  ],
  "rooms": [
    { "tiles": [
        "#############",
        "#...........#",
        "#.........h.#",
        "#..o.....o..#",
        "#...........#",
        "#..o.....o..#",
        "#...........#",
        "#........hh.#",
        "#############"
      ], "id": "looted_store", "name": "약탈당한 창고", "type": "supply", "regions": ["verdant"], "weight": 1, "flip": true, "objects": [{ "kind": "node", "mat": "flax", "qty": 3, "x": 1, "y": 1 }, { "kind": "chest", "chest": "basic", "guarded": true, "x": 11, "y": 1 }, { "kind": "node", "mat": "wood", "qty": 2, "x": 1, "y": 7 }], "enemies": [{ "kind": "goblin", "facing": "right", "post": true, "looting": true, "x": 10, "y": 1 }, { "kind": "goblin", "facing": "right", "post": true, "looting": true, "x": 11, "y": 2 }, { "kind": "pilferer", "facing": "right", "x": 2, "y": 6, "patrol": [[2, 6], [8, 6]] }] },
    { "tiles": [
        "#############",
        "#...........#",
        "#.hhh...hhh.#",
        "#.h.......h.#",
        "#...........#",
        "#.h.......h.#",
        "#.hhh...hhh.#",
        "#...........#",
        "#############"
      ], "id": "thorn_gallery", "name": "가시 회랑", "type": "mine", "regions": ["verdant"], "weight": 1, "flip": true, "objects": [{ "kind": "chest", "chest": "sealed", "guarded": true, "x": 6, "y": 4 }, { "kind": "node", "mat": "ore", "qty": 2, "x": 1, "y": 7 }, { "kind": "node", "mat": "ore", "qty": 2, "x": 11, "y": 7 }, { "kind": "node", "mat": "resin", "qty": 2, "x": 11, "y": 1 }], "enemies": [{ "kind": "alpha", "facing": "left", "post": true, "x": 4, "y": 4 }, { "kind": "wolf", "facing": "right", "post": true, "x": 8, "y": 4 }] },
    { "tiles": [
        "#############",
        "#h..........#",
        "#..o.....o..#",
        "#...........#",
        "#........h..#",
        "#...........#",
        "#..o.....o..#",
        "#h..........#",
        "#############"
      ], "id": "seal_garden_ring", "name": "가시 울타리 정원", "type": "garden", "regions": ["verdant"], "weight": 1, "flip": true, "objects": [{ "kind": "node", "mat": "herb", "qty": 4, "x": 11, "y": 1 }, { "kind": "device", "guarded": true, "x": 10, "y": 4 }, { "kind": "node", "mat": "resin", "qty": 2, "guarded": true, "x": 11, "y": 7 }], "enemies": [{ "kind": "archer", "facing": "left", "post": true, "x": 10, "y": 3 }, { "kind": "sporeling", "facing": "left", "post": true, "x": 10, "y": 5 }] },
    { "tiles": [
        "#############",
        "#...........#",
        "#..hh...hh..#",
        "#..h.....h..#",
        "#...........#",
        "#..h.....h..#",
        "#..hh...hh..#",
        "#...........#",
        "#############"
      ], "id": "slag_pit", "name": "슬래그 웅덩이", "type": "supply", "regions": ["foundry"], "weight": 1, "flip": true, "objects": [{ "kind": "node", "mat": "coal", "qty": 3, "x": 1, "y": 1 }, { "kind": "node", "mat": "flax", "qty": 2, "x": 1, "y": 7 }, { "kind": "chest", "chest": "sealed", "guarded": true, "x": 6, "y": 4 }], "enemies": [{ "kind": "slag", "facing": "left", "post": true, "x": 5, "y": 4 }] },
    { "tiles": [
        "#############",
        "#...........#",
        "#..o........#",
        "#.......h...#",
        "#...........#",
        "#.......h...#",
        "#..o........#",
        "#...........#",
        "#############"
      ], "id": "shield_line", "name": "방패 전열", "type": "mine", "regions": ["foundry"], "weight": 1, "flip": true, "objects": [{ "kind": "node", "mat": "ore", "qty": 3, "guarded": true, "x": 11, "y": 1 }, { "kind": "node", "mat": "ore", "qty": 3, "guarded": true, "x": 11, "y": 2 }, { "kind": "node", "mat": "coal", "qty": 3, "guarded": true, "x": 11, "y": 6 }, { "kind": "node", "mat": "coal", "qty": 3, "guarded": true, "x": 11, "y": 7 }], "enemies": [{ "kind": "shieldman", "facing": "left", "post": true, "x": 9, "y": 2 }, { "kind": "shieldman", "facing": "left", "post": true, "x": 8, "y": 6 }, { "kind": "slinger", "facing": "left", "post": true, "x": 10, "y": 7 }] },
    { "tiles": [
        "#############",
        "#...........#",
        "#.o.........#",
        "#......h....#",
        "#...........#",
        "#......h....#",
        "#.o.........#",
        "#...........#",
        "#############"
      ], "id": "ink_nest", "name": "먹물 둥지", "type": "hall", "regions": ["archive"], "weight": 1, "flip": true, "objects": [{ "kind": "node", "mat": "flax", "qty": 2, "x": 1, "y": 1 }, { "kind": "chest", "chest": "basic", "guarded": true, "x": 11, "y": 1 }, { "kind": "node", "mat": "crystal", "qty": 1, "guarded": true, "x": 11, "y": 7 }], "enemies": [{ "kind": "nest", "facing": "left", "post": true, "x": 10, "y": 2 }, { "kind": "hexer", "facing": "left", "post": true, "x": 10, "y": 6 }] },
    { "tiles": [
        "#############",
        "#...........#",
        "#..o.....o..#",
        "#.....h.....#",
        "#..h.....h..#",
        "#.....h.....#",
        "#..o.....o..#",
        "#...........#",
        "#############"
      ], "id": "charge_arena", "name": "기둥의 결투장", "type": "sanctum", "regions": ["verdant", "archive"], "weight": 1, "flip": true, "objects": [], "enemies": [{ "kind": "@boss", "facing": "left", "x": 6, "y": 4 }] }
  ]
};
  if (typeof module === 'object') module.exports = ER;
})(typeof globalThis !== 'undefined' ? globalThis : this);
