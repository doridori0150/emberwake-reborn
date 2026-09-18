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
    "shieldman": { "name": "방패 파수병", "asset": "enemy.brute", "tint": "hue-rotate(180deg) saturate(1.3)", "hp": 12, "dmg": 4, "speed": 2, "detect": 3, "ai": "shield", "size": 52, "gold": [4, 6], "loot": [["ore", 0.6], ["coal", 0.4]], "note": "예고 없이 방패로 밀친다(약타, 1칸 밀림). 등 뒤가 벽이면 찧기로 온전히 맞는다. 옆·뒤로 돌아가면 정면 방패가 통하지 않는다.", "traits": { "frontArmor": { "n": 2 } } },
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
  "gear": {
    "longsword": { "name": "길드 장검", "slot": "weapon", "heroes": ["ara"], "tier": 1, "icon": "town.icon_longsword", "cost": { "ore": 3, "wood": 1 }, "weapon": { "dice": "1d8+1", "name": "장검 베기" }, "options": ["keen", "weighted"], "optionSlots": 1 },
    "warhammer": { "name": "파수병의 전쟁망치", "slot": "weapon", "heroes": ["ara"], "tier": 2, "icon": "town.icon_warhammer", "cost": { "ore": 4, "coal": 3 }, "weapon": { "dice": "2d4+2", "name": "망치 내려치기" }, "slam": 1, "options": ["keen", "weighted"], "optionSlots": 2 },
    "daggers": { "name": "그림자 쌍단검", "slot": "weapon", "heroes": ["noa"], "tier": 1, "icon": "town.icon_daggers", "cost": { "ore": 2, "hide": 2 }, "weapon": { "dice": "2d3+1", "name": "쌍단검 베기" }, "crit": 5, "options": ["keen", "weighted"], "optionSlots": 1 },
    "hookblade": { "name": "갈고리 칼", "slot": "weapon", "heroes": ["noa"], "tier": 2, "icon": "town.icon_hookblade", "cost": { "ore": 3, "coal": 2, "hide": 2 }, "weapon": { "dice": "1d6+2", "name": "갈고리 베기" }, "crit": 10, "options": ["keen", "weighted"], "optionSlots": 2 },
    "focusrod": { "name": "수지 촉매봉", "slot": "weapon", "heroes": ["lumi"], "tier": 1, "icon": "town.icon_focusrod", "cost": { "wood": 2, "resin": 2 }, "weapon": { "dice": "1d6+1", "name": "촉매탄" }, "options": ["keen", "weighted"], "optionSlots": 1 },
    "starstaff": { "name": "별빛 지팡이", "slot": "weapon", "heroes": ["lumi"], "tier": 2, "icon": "town.icon_starstaff", "cost": { "wood": 3, "crystal": 2 }, "weapon": { "dice": "2d4", "range": 4, "name": "별빛탄" }, "options": ["keen", "weighted"], "optionSlots": 2 },
    "framepack": { "name": "뼈대 배낭", "slot": "bag", "tier": 2, "icon": "town.icon_framepack", "cost": { "hide": 3, "wood": 3, "coal": 1 }, "bag": 4, "options": ["pouch_ore", "pouch_herb", "reinforced"], "optionSlots": 2 },
    "expedition": { "name": "원정대 등짐", "slot": "bag", "tier": 3, "icon": "town.icon_expedition_pack", "cost": { "hide": 4, "crystal": 2, "relic": 1 }, "bag": 6, "stackAll": 1, "options": ["pouch_ore", "pouch_herb", "reinforced"], "optionSlots": 3 },
    "recallstone": { "name": "귀환석", "slot": "trinket", "tier": 1, "icon": "gear.signal", "cost": { "resin": 2, "relic": 1 }, "recall": 1, "text": "원정당 1회, 탐사 중 어디서든 바로 길드로 귀환한다(전투 중에는 쓸 수 없다)." }
  },
  "craftOptions": {
    "keen": { "name": "날 세우기", "slots": ["weapon"], "cost": { "ore": 2 }, "effects": { "bonus": 1 } },
    "weighted": { "name": "무게추", "slots": ["weapon"], "cost": { "coal": 2 }, "effects": { "crit": 10 } },
    "pouch_ore": { "name": "광석 주머니", "slots": ["bag"], "cost": { "hide": 2 }, "effects": { "stack:ore": 3, "stack:coal": 3, "stack:crystal": 2 } },
    "pouch_herb": { "name": "약초 주머니", "slots": ["bag"], "cost": { "flax": 3 }, "effects": { "stack:herb": 3, "stack:flax": 3, "stack:wood": 3 } },
    "reinforced": { "name": "덧댄 바닥", "slots": ["bag"], "cost": { "hide": 2, "ore": 1 }, "effects": { "bag": 1 } }
  },
  "portraits": {},
  "npcs": {},
  "decor": {},
  "tuning": {},
  "events": [
    {
      "id": "first_descent",
      "name": "첫 하강",
      "trigger": {
        "type": "runStart",
        "region": "verdant"
      },
      "pages": [
        {
          "speaker": "아라",
          "portrait": "actor.ara",
          "side": "left",
          "text": "여기가 길드의 옛 입구야. 인장은 가장 깊은 성소에 있을 거다."
        },
        {
          "speaker": "노아",
          "portrait": "actor.noa",
          "side": "right",
          "text": "욕심내지 마. 가방이 차면 귀환문으로 돌아와. 살아서 가져온 것만 길드 것이 되니까."
        }
      ],
      "choices": []
    },
    {
      "id": "wounded_scout",
      "name": "다친 정찰병",
      "trigger": {
        "type": "roomEnter",
        "region": "verdant",
        "roomType": "shelter"
      },
      "pages": [
        {
          "speaker": "정찰병",
          "portrait": "",
          "side": "right",
          "text": "…길드 사람인가? 늑대에게 물렸어. 약초가 있으면 좀 나눠 주겠나."
        }
      ],
      "choices": [
        {
          "label": "약초 2개를 건넨다",
          "require": {
            "mat": {
              "herb": 2
            }
          },
          "effects": [
            {
              "type": "flag",
              "flag": "scout_saved"
            },
            {
              "type": "gold",
              "n": 8
            }
          ],
          "reply": "고맙네. 길드에 돌아가면 꼭 찾아가지."
        },
        {
          "label": "붕대를 감아 준다 (시간 2)",
          "effects": [
            {
              "type": "time",
              "n": 2
            },
            {
              "type": "flag",
              "flag": "scout_saved"
            }
          ],
          "reply": "살았어… 이 은혜는 잊지 않겠네."
        },
        {
          "label": "지나친다",
          "effects": [],
          "reply": "…그래, 자네도 바쁘겠지."
        }
      ]
    },
    {
      "id": "scout_returns",
      "name": "정찰병의 보답",
      "trigger": {
        "type": "returnGuild",
        "flag": "scout_saved",
        "outcome": "extracted"
      },
      "pages": [
        {
          "speaker": "정찰병",
          "portrait": "",
          "side": "right",
          "text": "약속대로 왔네. 회랑에서 주운 것들이야. 길드 재건에 보태 쓰게."
        }
      ],
      "choices": [
        {
          "label": "고맙게 받는다",
          "effects": [
            {
              "type": "mat",
              "mat": "ore",
              "n": 3
            },
            {
              "type": "mat",
              "mat": "wood",
              "n": 3
            },
            {
              "type": "unflag",
              "flag": "scout_saved"
            }
          ]
        }
      ]
    },
    {
      "id": "workshop_open",
      "name": "공방의 불",
      "trigger": {
        "type": "facility",
        "facility": "workshop",
        "level": 1
      },
      "pages": [
        {
          "speaker": "아라",
          "portrait": "actor.ara",
          "side": "left",
          "text": "화로에 다시 불이 붙었어. 이제 무기와 가방을 만들 수 있다."
        },
        {
          "speaker": "노아",
          "portrait": "actor.noa",
          "side": "right",
          "text": "가방부터 만들자. 빈손으로 돌아오는 건 이제 지긋지긋해."
        }
      ],
      "choices": []
    },
    {
      "id": "warden_falls",
      "name": "수문장의 최후",
      "trigger": {
        "type": "bossKill",
        "region": "verdant"
      },
      "pages": [
        {
          "speaker": "아라",
          "portrait": "actor.ara",
          "side": "left",
          "text": "끝났다… 인장을 챙겨. 돌아갈 때까지가 원정이다."
        }
      ],
      "choices": []
    }
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
