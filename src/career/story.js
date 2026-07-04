/* =============================================================================
   MYCAREER STORY — THIS IS THE FILE YOU EDIT TO WRITE THE STORY.

   Everything narrative lives here as data; the engine (career.js) just walks
   it. Every "[EDIT]" text is a placeholder waiting for your writing.

   STRUCTURE
   ---------
   A career is chapters, in order. Each chapter is a list of EVENTS, played
   strictly in sequence:

     { type: "scene", id, title, lines, choice?, onEnter? }
        A cutscene. `lines` play one tap at a time. Optional `choice` shows
        after the last line. Optional onEnter: "draft" assigns your league
        team when the scene starts (used once, on Draft Night).

     { type: "game", id, label, opponent, venue?, difficulty, objectives,
       mustWin? }
        A playable key game (also simmable from the career screen).
        opponent: "street" (generated blacktop squad), "rival" (the rival's
        team), or a 3-letter league abbr like "GHO". mustWin: true replays
        the game until you win it.

     { type: "sim", id, label, count }
        A block of one-tap simmed filler games ("never play 82").

   WRITING TOOLS
   -------------
   - Line text supports templates: {name} (MyPlayer), {team} (full team
     name), {teamAbbr}, {rival} (rival's name), {city}.
   - `speaker` is free text. Use "NARRATOR" for letterbox narration,
     "YOU" for the MyPlayer, or any character name you invent.
   - choice.options[].effects: { rep: n, up: n, flag: "anyString" }.
     Flags accumulate in career.flags — use them later for callbacks
     (the engine exposes them; scenes can be gated on flags via `requires`).
   - A scene may set `requires: "someFlag"` to only play if that flag was
     earned earlier (otherwise it's skipped silently).
   ========================================================================== */

export const RIVAL = {
  id: "rival-1",
  name: "D. AMARI",
  team: "GHO",                       // the rival plays for the Ghosts
  blurb: "[EDIT] One-line bio of your rival — the other name on every scout's list.",
};

export const STORY = [
  /* ======================== CH 0 · BLACKTOP ======================== */
  {
    id: "ch0", title: "BLACKTOP", subtitle: "WHERE IT STARTS",
    events: [
      {
        type: "scene", id: "ch0-open", title: "FIRST LIGHT",
        lines: [
          { speaker: "NARRATOR", text: "[EDIT] Opening shot — the neighborhood court at dawn. Set the scene." },
          { speaker: "YOU", text: "[EDIT] {name}'s first words. Who are they before anyone knows them?" },
          { speaker: "NARRATOR", text: "[EDIT] A stranger has been watching from the fence for three days." },
        ],
      },
      {
        type: "game", id: "ch0-run", label: "THE RUN", opponent: "street",
        venue: "street", difficulty: 0, mustWin: true,
        objectives: [
          { id: "ch0-pts", type: "points", target: 6 },
          { id: "ch0-win", type: "team_win" },
        ],
      },
      {
        type: "scene", id: "ch0-after", title: "THE CARD",
        lines: [
          { speaker: "SCOUT REYES", text: "[EDIT] The stranger introduces themself. They saw something." },
          { speaker: "SCOUT REYES", text: "[EDIT] The offer: a combine invite. One shot." },
        ],
        choice: {
          prompt: "[EDIT] How does {name} take the card?",
          options: [
            { id: "hungry", text: "[EDIT] Hungry answer", effects: { rep: 60, flag: "hungry" } },
            { id: "cool", text: "[EDIT] Ice-cold answer", effects: { rep: 60, flag: "cool" } },
          ],
        },
      },
    ],
  },

  /* ======================== CH 1 · SEEN ======================== */
  {
    id: "ch1", title: "SEEN", subtitle: "THE COMBINE",
    events: [
      {
        type: "scene", id: "ch1-open", title: "THE GYM",
        lines: [
          { speaker: "NARRATOR", text: "[EDIT] The combine gym — forty prospects, ten roster futures." },
          { speaker: "D. AMARI", text: "[EDIT] First meeting with the rival. Make it sting." },
        ],
      },
      {
        type: "game", id: "ch1-scrimmage", label: "COMBINE SCRIMMAGE", opponent: "street",
        difficulty: 1,
        objectives: [
          { id: "ch1a-pts", type: "points", target: 10 },
          { id: "ch1a-ast", type: "assists", target: 2 },
        ],
      },
      {
        type: "scene", id: "ch1-mid", title: "TAPE DON'T LIE",
        lines: [
          { speaker: "SCOUT REYES", text: "[EDIT] Feedback after the first scrimmage — honest, not kind." },
        ],
      },
      {
        type: "game", id: "ch1-showcase", label: "DRAFT SHOWCASE", opponent: "rival",
        difficulty: 1,
        objectives: [
          { id: "ch1b-pts", type: "points", target: 12 },
          { id: "ch1b-win", type: "team_win" },
        ],
      },
    ],
  },

  /* ======================== CH 2 · DRAFT NIGHT ======================== */
  {
    id: "ch2", title: "DRAFT NIGHT", subtitle: "THE CALL",
    events: [
      {
        type: "scene", id: "ch2-draft", title: "GREEN ROOM", onEnter: "draft",
        lines: [
          { speaker: "NARRATOR", text: "[EDIT] Draft night. Suits, cameras, a phone that won't ring... until it does." },
          { speaker: "COMMISSIONER", text: "[EDIT-KEEP {team}] With their pick, the {team} select... {name}." },
          { speaker: "YOU", text: "[EDIT] Walking to the stage. What's in their head?" },
        ],
        choice: {
          prompt: "[EDIT] First words as a pro?",
          options: [
            { id: "grateful", text: "[EDIT] Thank the ones who got you here", effects: { rep: 80, flag: "grateful" } },
            { id: "warning", text: "[EDIT] Put the league on notice", effects: { rep: 80, flag: "onNotice" } },
          ],
        },
      },
    ],
  },

  /* ======================== CH 3 · ROOKIE ======================== */
  {
    id: "ch3", title: "ROOKIE", subtitle: "SEASON ONE",
    events: [
      {
        type: "scene", id: "ch3-open", title: "LOCKER 14",
        lines: [
          { speaker: "COACH", text: "[EDIT] First practice with {team}. The coach sets the terms." },
        ],
      },
      {
        type: "game", id: "ch3-debut", label: "PRO DEBUT", opponent: "any",
        difficulty: 1,
        objectives: [
          { id: "ch3a-pts", type: "points", target: 8 },
        ],
      },
      { type: "sim", id: "ch3-sim1", label: "EARLY SEASON", count: 6 },
      {
        type: "game", id: "ch3-rival", label: "RIVALRY NIGHT", opponent: "rival",
        difficulty: 1,
        objectives: [
          { id: "ch3b-pts", type: "points", target: 14 },
          { id: "ch3b-win", type: "team_win" },
        ],
      },
      { type: "sim", id: "ch3-sim2", label: "THE GRIND", count: 6 },
      {
        type: "scene", id: "ch3-close", title: "EXIT INTERVIEW",
        lines: [
          { speaker: "COACH", text: "[EDIT] Season one wrap — where you stand, what's missing." },
        ],
      },
    ],
  },

  /* ======================== CH 4 · THE LEAP ======================== */
  {
    id: "ch4", title: "THE LEAP", subtitle: "SEASON TWO",
    events: [
      {
        type: "scene", id: "ch4-open", title: "SUMMER WORK",
        lines: [
          { speaker: "NARRATOR", text: "[EDIT] The offseason montage. What did {name} sacrifice?" },
        ],
      },
      { type: "sim", id: "ch4-sim1", label: "SEASON TWO OPENS", count: 5 },
      {
        type: "game", id: "ch4-statement", label: "STATEMENT GAME", opponent: "any",
        difficulty: 2,
        objectives: [
          { id: "ch4a-pts", type: "points", target: 16 },
          { id: "ch4a-win", type: "team_win" },
        ],
      },
      { type: "sim", id: "ch4-sim2", label: "THE STRETCH", count: 5 },
      {
        type: "scene", id: "ch4-close", title: "NAME IN LIGHTS",
        lines: [
          { speaker: "REPORTER", text: "[EDIT] The media starts saying the name. First taste of fame." },
        ],
      },
    ],
  },

  /* ======================== CH 5 · THE CHASE ======================== */
  {
    id: "ch5", title: "THE CHASE", subtitle: "THE RIVALRY PEAKS",
    events: [
      {
        type: "scene", id: "ch5-open", title: "TWO NAMES, ONE THRONE",
        lines: [
          { speaker: "D. AMARI", text: "[EDIT] The rival, ascendant, calls the shot in public." },
        ],
      },
      { type: "sim", id: "ch5-sim1", label: "COLLISION COURSE", count: 5 },
      {
        type: "game", id: "ch5-showdown", label: "THE SHOWDOWN", opponent: "rival",
        difficulty: 2, mustWin: true,
        objectives: [
          { id: "ch5a-pts", type: "points", target: 18 },
          { id: "ch5a-win", type: "team_win" },
        ],
      },
      {
        type: "scene", id: "ch5-close", title: "RESPECT",
        lines: [
          { speaker: "D. AMARI", text: "[EDIT] After the showdown — what does the rivalry become?" },
        ],
      },
    ],
  },

  /* ======================== CH 6 · LEGACY ======================== */
  {
    id: "ch6", title: "LEGACY", subtitle: "WHAT REMAINS",
    events: [
      {
        type: "scene", id: "ch6-open", title: "THE LAST SEASON",
        lines: [
          { speaker: "NARRATOR", text: "[EDIT] Years later. What does the game owe {name}? What do they owe it?" },
        ],
      },
      { type: "sim", id: "ch6-sim1", label: "FAREWELL TOUR", count: 4 },
      {
        type: "game", id: "ch6-final", label: "THE FINAL GAME", opponent: "rival",
        difficulty: 2,
        objectives: [
          { id: "ch6a-pts", type: "points", target: 20 },
        ],
      },
      {
        type: "scene", id: "ch6-close", title: "HANG THEM UP",
        lines: [
          { speaker: "NARRATOR", text: "[EDIT] The closing scene. The jersey in the rafters. Roll credits." },
          { speaker: "YOU", text: "[EDIT] {name}'s last words to the game." },
        ],
      },
    ],
  },
];
