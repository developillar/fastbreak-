/* =============================================================================
   MYCAREER STORY — THIS IS THE FILE YOU EDIT TO WRITE THE STORY.

   Everything narrative lives here as data; the engine (career.js) just walks
   it. Rewrite any line freely — the cutscene player renders whatever's here.

   STRUCTURE
   ---------
   A career is chapters, in order. Each chapter is a list of EVENTS, played
   strictly in sequence:

     { type: "scene", id, title, bg?, lines, choice?, onEnter? }
        A cutscene. `lines` play one tap at a time. Optional `choice` shows
        after the last line. Optional onEnter: "draft" assigns your league
        team when the scene starts (used once, on Draft Night).
        `bg` picks the painted backdrop: blacktop | gym | stage | locker |
        press | arena | rooftop (defaults to blacktop).

     { type: "game", id, label, opponent, venue?, difficulty, objectives,
       mustWin? }
        A playable key game (also simmable from the career screen).
        opponent: "street" (generated blacktop squad), "rival" (the rival's
        team), or a 3-letter league abbr like "GHO". mustWin: true replays
        the game until you win it. venue: "street" renders the outdoor park.

     { type: "sim", id, label, count }
        A block of one-tap simmed filler games ("never play 82").

   WRITING TOOLS
   -------------
   - Line text supports templates: {name} (MyPlayer), {team} (full team
     name), {teamAbbr}, {rival} (rival's name), {city}.
   - `speaker` is free text. Use "NARRATOR" for letterbox narration,
     "YOU" for the MyPlayer, or any character name you invent. Speakers
     with a portrait in the cast table (hub.js CAST) show their face.
   - choice.options[].effects: { rep, up, flag: "anyString", rival,
     coach, fans, chem, energy } — the last four move the career-life
     meters (bonds/energy) shown on the MyCareer screen.
     Flags accumulate in career.flags — use them later for callbacks
     (the engine exposes them; scenes can be gated on flags via `requires`).
   - A scene may set `requires: "someFlag"` to only play if that flag was
     earned earlier (otherwise it's skipped silently).
   ========================================================================== */

export const RIVAL = {
  id: "rival-1",
  name: "D. AMARI",
  team: "GHO",                       // the rival plays for the Ghosts
  blurb: "The other name on every scout's list. Smiles for the cameras, hunts in the paint.",
};

export const STORY = [
  /* ======================== CH 0 · BLACKTOP ======================== */
  {
    id: "ch0", title: "BLACKTOP", subtitle: "WHERE IT STARTS",
    events: [
      {
        type: "scene", id: "ch0-open", title: "FIRST LIGHT", bg: "blacktop",
        lines: [
          { speaker: "NARRATOR", text: "Sixth Street court, 6 a.m. The chain net is rusted through and the three-point line is spray paint. Nobody famous ever came from here. That's the point." },
          { speaker: "YOU", text: "Everybody sleeps. That's fine. {name} doesn't need an alarm — the ball hitting asphalt is the alarm." },
          { speaker: "NARRATOR", text: "For three mornings now, someone's been leaning on the fence. Coffee. Clipboard. Watching every rep like it's game seven." },
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
        type: "scene", id: "ch0-after", title: "THE CARD", bg: "blacktop",
        lines: [
          { speaker: "SCOUT REYES", text: "Reyes. I scout for people who don't miss. I've watched forty kids this month — thirty-nine of them play like the rim owes them money." },
          { speaker: "SCOUT REYES", text: "You play like you owe the GAME something. Combine's in three weeks. This card gets you in the door. What you do inside is yours." },
        ],
        choice: {
          prompt: "The card is in {name}'s hand. Say something.",
          options: [
            { id: "hungry", text: "\"Three weeks is two more than I need.\"", effects: { rep: 60, flag: "hungry", fans: 4 } },
            { id: "cool", text: "Nod. Pocket the card. Get back to work.", effects: { rep: 60, flag: "cool", coach: 4 } },
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
        type: "scene", id: "ch1-open", title: "THE GYM", bg: "gym",
        lines: [
          { speaker: "NARRATOR", text: "The combine gym smells like new sneakers and old fear. Forty prospects. Ten roster spots. Every drill is a trial." },
          { speaker: "D. AMARI", text: "So you're the blacktop story Reyes keeps telling. Cute. I've been ranked number one since ninth grade — this week is a coronation, not a competition." },
          { speaker: "YOU", text: "{name} says nothing. The scoreboard talks better." },
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
        type: "scene", id: "ch1-mid", title: "TAPE DON'T LIE", bg: "gym",
        lines: [
          { speaker: "SCOUT REYES", text: "Decent. Not good — decent. The tape says you disappear for whole possessions. Pros don't get to disappear. Tomorrow, the showcase: Amari's squad, national feed, every GM watching." },
          { speaker: "SCOUT REYES", text: "Beat the coronation. Make them learn your name the hard way." },
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
        type: "scene", id: "ch2-draft", title: "GREEN ROOM", onEnter: "draft", bg: "stage",
        lines: [
          { speaker: "NARRATOR", text: "Draft night. Rented suit, borrowed tie, a table with {name}'s name on a little card. The phone sits face up, screen dark, heavier than any defender ever was." },
          { speaker: "NARRATOR", text: "Then it rings." },
          { speaker: "COMMISSIONER", text: "With their selection... the {city} {team} select {name}." },
          { speaker: "YOU", text: "The walk to the stage is twenty steps. It took years." },
        ],
        choice: {
          prompt: "First words as a pro, into every camera on earth?",
          options: [
            { id: "grateful", text: "\"This is for Sixth Street. All of it.\"", effects: { rep: 80, flag: "grateful", fans: 6, chem: 3 } },
            { id: "warning", text: "\"Whoever passed on me — write the date down.\"", effects: { rep: 80, flag: "onNotice", fans: 4, rival: 1 } },
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
        type: "scene", id: "ch3-open", title: "LOCKER 14", bg: "locker",
        lines: [
          { speaker: "COACH", text: "Locker fourteen. It was Hollis's before you — eleven seasons, never missed a practice. In this building we don't care where you got drafted, we care what you do on Tuesdays." },
          { speaker: "COACH", text: "You'll get minutes when the minutes trust you. Debut's Friday. Don't try to be a legend by halftime — be a professional by the fourth." },
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
        type: "scene", id: "ch3-close", title: "EXIT INTERVIEW", bg: "locker",
        lines: [
          { speaker: "COACH", text: "Season one. You played hard, you played scared, sometimes in the same quarter. That's every rookie ever." },
          { speaker: "COACH", text: "Here's what the film says: when the ball finds you late, good things happen. Next year, I want you DEMANDING it late. Go home. Rest two weeks. Then build the summer that changes everything." },
        ],
      },
    ],
  },

  /* ======================== CH 4 · THE LEAP ======================== */
  {
    id: "ch4", title: "THE LEAP", subtitle: "SEASON TWO",
    events: [
      {
        type: "scene", id: "ch4-open", title: "SUMMER WORK", bg: "blacktop",
        lines: [
          { speaker: "NARRATOR", text: "No cameras follow the summer. Just Sixth Street again — same crooked rim, five hundred makes a morning, blisters that turn to callus, callus that turns to touch." },
          { speaker: "NARRATOR", text: "Amari spent the offseason on billboards. {name} spent it on the same cracked square of asphalt. October will grade both plans." },
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
        type: "scene", id: "ch4-close", title: "NAME IN LIGHTS", bg: "press",
        lines: [
          { speaker: "REPORTER", text: "League sources are calling it the leap — top ten in scoring since January, and tonight the arena was chanting the name. So: {name}. Is this the best version of you?" },
          { speaker: "YOU", text: "\"No.\" A smile. \"That's the scary part.\"" },
        ],
      },
    ],
  },

  /* ======================== CH 5 · THE CHASE ======================== */
  {
    id: "ch5", title: "THE CHASE", subtitle: "THE RIVALRY PEAKS",
    events: [
      {
        type: "scene", id: "ch5-open", title: "TWO NAMES, ONE THRONE", bg: "press",
        lines: [
          { speaker: "D. AMARI", text: "On live TV, mid-interview, Amari looks straight into the lens: \"There's one team I circle. One. Tell {name} the throne isn't a timeshare — come take it or stop talking.\"" },
          { speaker: "NARRATOR", text: "The clip does forty million views by morning. The league moves the game to prime time. Everything since the combine has been driving toward this night." },
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
        type: "scene", id: "ch5-close", title: "RESPECT", bg: "arena",
        lines: [
          { speaker: "D. AMARI", text: "The arena's emptying out. Amari waits by the tunnel — no cameras, no entourage. \"Since ninth grade nobody's made me chase. You did.\" A hand extended." },
          { speaker: "YOU", text: "{name} takes it. The rivalry isn't over. It just finally became worth having." },
        ],
      },
    ],
  },

  /* ======================== CH 6 · LEGACY ======================== */
  {
    id: "ch6", title: "LEGACY", subtitle: "WHAT REMAINS",
    events: [
      {
        type: "scene", id: "ch6-open", title: "THE LAST SEASON", bg: "rooftop",
        lines: [
          { speaker: "NARRATOR", text: "Years pass the way seasons do — all at once. The knees ask questions now. The jumper still answers. One announcement, one October morning: this year is the last one." },
          { speaker: "NARRATOR", text: "Every road building sells out. Even the ones that used to boo. ESPECIALLY the ones that used to boo." },
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
        type: "scene", id: "ch6-close", title: "HANG THEM UP", bg: "arena",
        lines: [
          { speaker: "NARRATOR", text: "They raise the jersey on a Tuesday. Locker fourteen's nameplate comes down slow, the way it went up. Somewhere on Sixth Street, a kid is counting makes before school." },
          { speaker: "YOU", text: "\"People ask what I gave the game. Wrong question.\" {name} looks up at the rafters. \"Everything I have, the game gave me first. We're even.\"" },
        ],
      },
    ],
  },
];
