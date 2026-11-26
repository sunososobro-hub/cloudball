/* Every tunable number of the engine lives here, with a name.
 * Units: metres, seconds, metres/second unless stated. Probabilities are 0..1. */

export const ENGINE_VERSION = '0.4.12';

/* ---- game structure ---- */
export const REGULATION_INNINGS = 9;
export const MAX_INNINGS = 15;            /* a game still tied after this many innings ends as a tie */
export const OUTS_PER_HALF = 3;
export const LINEUP_SIZE = 9;
export const BALLS_FOR_WALK = 4;
export const STRIKES_FOR_OUT = 3;
export const ROTATION_SIZE = 5;
export const TIEBREAK_RUNNER_BASE = 2;    /* extra innings start with a runner on second */
export const MAX_FRAMES = 4000;           /* hard stop: a game that needs more frames is a bug */
export const HALF = 0.5;                   /* centre of a uniform draw, and an even coin flip */
export const STREAM_TIME_PRECISION = 1000; /* stream times are rounded to 1/1000 s */
export const BIG = { NONE: 0, NOTABLE: 1, HUGE: 2 };   /* how much a frame matters to the broadcast (crowd, captions) */
export const IBB_PITCH_SPOT = [0.6, 0.7];  /* where the pitch-out of an intentional walk is drawn */
export const COSMETIC_SALT = 0x5ca1ab1e;  /* seed offset of the RNG used for looks only (pitch type, speed, slides) */

/* ---- broadcast timeline (how long each frame takes on screen) ---- */
export const PRE_DUR = 18;
export const BREAK_DUR = 34;
export const CHANGE_DUR = 14;
/* #81: the pitching coach's mound visit after a "stay" pick, once per pitcher (frame `VIS`). render/visit.js needs about 13.2 s for the
 * walk out and back from either dugout; the rest is the talk at the mound. Timing only: no draw, no outcome reads it. */
export const MOUND_VISIT_DUR = 16;
export const VOTE_DUR = 2;
export const VOTE_WINDOW = 15;
export const PITCH_DUR = { ball: 12, cstr: 12, sstr: 12, foul: 12, hbp: 15, ibb: 10, bk: 10, po: 10, pof: 8 };
export const PITCH_DUR_DEFAULT = 10;
export const PA_END_HOLD = 3;             /* extra pause after a plate appearance ends */
export const WALK_FRAME_DUR = 12;
export const RELEASE = 1.6;               /* pitch leaves the hand, seconds into a pitch frame */
export const ARRIVE = 2.05;               /* pitch reaches the plate */
export const CATCH_SNAP = 0.12;           /* plate to catcher's mitt */
export const CALL_LAG = 0.05;             /* umpire's call after the ball arrives */
export const IBB_SHOW_AT = 1.9;
export const HIT_SHOW_LEAD = 0.3;         /* a hit is shown this long before the ball lands */
export const INPLAY_BASE_DUR = 8;
export const INPLAY_MOVES_DUR = 2.5;
export const INPLAY_RUNS_DUR = 2;
export const POST_CATCH_HOLD = 1.2;
export const POST_PLAY_HOLD = 1.5;        /* frame keeps running this long after the last throw/arrival */
export const WALK_BACK_SPEED = 6.5;
export const WALK_BACK_PAD = 0.6;

/* ---- pitching ---- */
/* Chance that a pitch is in the strike zone, by count [balls][strikes], times the pitcher's control.
 * Pitchers come into the zone when behind and work off the plate when ahead. */
export const ZONE_BY_COUNT = [
  [0.52, 0.44, 0.36],
  [0.55, 0.49, 0.43],
  [0.59, 0.57, 0.51],
  [0.64, 0.63, 0.60],
];
export const ZONE_P_MIN = 0.2;
export const ZONE_P_MAX = 0.75;
export const ZONE_HALF_WIDTH = 0.21;      /* in-zone x spread is +-this */
export const ZONE_Y_MIN = 0.55;
export const ZONE_Y_SPAN = 0.55;
export const MISS_X_MIN = 0.24;
export const MISS_X_SPAN = 0.25;
export const MISS_LOW_Y = 0.35;
export const MISS_LOW_SPAN = 0.25;
export const MISS_HIGH_Y = 1.15;
export const MISS_HIGH_SPAN = 0.3;
export const HBP_P = 0.0077;              /* chance that a taken pitch outside the zone hits the batter */
export const TIRE_AFTER_PITCHES = 85;
export const TIRE_STUFF_PER_PITCH = 0.003;
export const TIRE_CTRL_PER_PITCH = 0.002;
export const KMH_BASE = 135;
export const KMH_STUFF_REF = 0.95;
export const KMH_PER_STUFF = 70;
export const KMH_JITTER = 7;
/* [name (on-screen copy), cumulative share, km/h offset from the fastball] */
export const PITCH_TYPES = [['直球', 0.5, 0], ['滑球', 0.7, -10], ['曲球', 0.82, -22], ['變速球', 0.92, -14], ['指叉球', 1, -12]];

/* ---- batting ---- */
/* Chance of a swing by count [balls][strikes]: batters take early and on 3-0, protect with two strikes. */
export const SWING_ZONE_BY_COUNT = [      /* at a pitch in the zone */
  [0.45, 0.70, 0.88],
  [0.56, 0.73, 0.91],
  [0.57, 0.75, 0.93],
  [0.12, 0.72, 0.95],
];
export const SWING_CHASE_BY_COUNT = [     /* at a pitch outside the zone; divided by the batter's eye */
  [0.18, 0.28, 0.34],
  [0.21, 0.31, 0.36],
  [0.19, 0.32, 0.40],
  [0.04, 0.23, 0.45],
];
export const SWING_MAX = 0.97;
export const CONTACT_IN_ZONE = 0.825;
export const CONTACT_CHASE = 0.555;
export const CONTACT_MAX = 0.97;
export const FOUL_P = 0.5;
export const FOUL_P_2K = 0.51;

/* ---- batted ball mix and results ---- */
export const GB_SHARE = 0.43;
export const LD_SHARE_END = 0.64;         /* GB below 0.43, LD up to this, air above */
export const POPUP_OF_AIR = 0.22;
export const SPRAY_MAX_DEG = 44;
export const SPRAY_MAIN_DEG = 88;
export const SPRAY_NOISE_DEG = 20;
export const HR_P = 0.162;                /* x pow^2 / stuff, for fly balls */
export const GB_HIT_P = 0.236;            /* x con / stuff */
export const GB_DOUBLE_P = 0.04;
export const LD_HIT_P = 0.66;             /* x con / stuff */
export const LD_SINGLE_END = 0.71;
export const LD_DOUBLE_END = 0.98;
export const FB_HIT_P = 0.15;
export const FB_SINGLE_END = 0.38;
export const FB_DOUBLE_END = 0.94;
export const PU_HIT_P = 0.02;
export const ERROR_P = 0.015;
export const GB_OUT_DIST = [24, 16];      /* [min, random span] */
export const GB_HIT_DIST = [55, 20];
export const GB_OUT_SPEED = 28;
export const GB_HIT_SPEED = 32;
export const GB_PEAK = 0.6;
export const LD_SHALLOW_P = 0.4;
export const LD_SHALLOW_DIST = [35, 10];
export const LD_DEEP_DIST = [60, 30];
export const LD_HIT_DIST = [60, 40];
export const LD_SPEED = 34;
export const LD_PEAK = [3, 3];
export const PU_DIST = [15, 30];
export const PU_HANG = [4, 1.2];
export const PU_PEAK = [30, 8];
export const FB_HR_DIST = [114, 22];
export const FB_OUT_DIST = [65, 35];
export const FB_HIT_DIST = [85, 25];
export const FB_HANG = [3.4, 1.4];
export const FB_PEAK = [22, 12];
export const TRIPLE_MIN_DIST = 100;
export const HIT_ROLL_FACTOR = 1.08;      /* an air-ball hit rolls this much past its landing point */
export const HIT_ROLL_TIME = 0.8;

/* ---- baserunning choices ---- */
export const SCORE_FROM_2ND_ON_SINGLE = 0.6;
export const FIRST_TO_THIRD_ON_SINGLE = 0.29;
export const SCORE_FROM_1ST_ON_DOUBLE = 0.42;
/* Advancing on a throw (#38): on an outfield single that scores the runner from second, the outfielder throws home
 * with this chance (he is safe: the throw arrives after him) and the batter, with second open, takes it on the throw.
 * First guess, not tuned: about one try in three; it only moves a runner, never adds an out. */
export const THROW_HOME_ON_SINGLE_P = 0.35;
/* Out on the bases (#38): on an outfield single with fewer than two outs, a runner from second who would be held at
 * third is sent home anyway with this chance; the outfielder's throw to the catcher decides (rules/fielding.js): out
 * when the ball beats him, else he scores. First guess, not tuned (MLB sends about 60% and loses a few percent of them). */
export const SEND_FROM_2ND_ON_SINGLE_P = 0.12;
/* Out on the bases (#38): on an outfield single with fewer than two outs and second open, the batter tries to stretch it
 * into a double with this chance; the throw to second decides: tagged out when the ball beats him, else a double.
 * First guess, not tuned (MLB: a few hundred batters a season are thrown out stretching, about 0.1 a game). */
export const STRETCH_1B_P = 0.03;
export const DP_TRY_P = 0.44;
export const SAC_FLY_P = 0.8;             /* runner on third tags and scores on a fly out */
export const TAG_2ND_TO_3RD_P = 0.2;      /* runner on second tags and takes an open third on a fly out */
export const GB_ADVANCE_P = 0.5;
export const STEAL_CONSIDER_P = 0.4;       /* 0.48 before #38 part 4: steals of third now take their share of SB/game */
export const STEAL_TRY_BASE = 0.45;
export const STEAL_TRY_PER_SPD = 1.2;
export const STEAL_TRY_RANGE = [0.1, 0.85];
export const STEAL_OK_BASE = 0.75;
export const STEAL_OK_PER_SPD = 0.6;
export const STEAL_OK_RANGE = [0.5, 0.9];
/* Steal of third (#38): runner on second alone, fewer than two outs. Same try chance by speed as a steal of second;
 * fast runners try more often, so STEAL3_OK_BASE sits below MLB 2024's 82.2% on steals of third (FanGraphs 2025-04-23).
 * Both tuned so SB3/game and CS3/game match tests/replay/run.mjs REFERENCE (about 80% safe over 3000 games). */
export const STEAL3_CONSIDER_P = 0.2;
export const STEAL3_OK_BASE = 0.76;
export const STEAL3_OK_RANGE = [0.5, 0.9];
export const HOME_SLIDE_P = 0.5;
/* Wild pitch (#38): a low pitch out of the zone (ball or chased swinging strike, not ending the plate appearance)
 * with a runner on and no steal on gets past the catcher with this chance; every runner moves up one base.
 * Passed ball: any other ball, called or swinging strike (not ending the PA) with a runner on gets by him with PB_P.
 * Both tuned so WP/game and PB/game match tests/replay/run.mjs REFERENCE (MLB 2025, see there). */
export const WP_P = 0.025;
export const PB_P = 0.002;
/* Balk: before a pitch with a runner on (no steal on) the pitcher balks with BK_P; no pitch counts, every runner moves
 * up one base. The plate umpire calls it BK_CALL_AT s into the frame (the pitcher stops at the top of his leg lift);
 * runners trot from there. Tuned so BK/game matches tests/replay/run.mjs REFERENCE (MLB 2025, see there). */
export const BK_P = 0.0006;
export const BK_CALL_AT = 0.9;
/* Pickoff (#38): before a pitch with a runner on first, second open and no steal on, the pitcher picks him off with PO_P
 * (only the throws that get him: attempts that do not are not modelled). No pitch counts. The runner has his lead
 * (PO_LEAD m, taken by PO_LEAD_AT s), the pitcher steps off and throws to the first baseman holding him on at PO_THROW_AT
 * at PO_THROW_V; the runner reacts PO_REACT later and dives back; the tag beats his hand. Tuned so PO/game matches
 * tests/replay/run.mjs REFERENCE (FanGraphs 2023, see there). */
export const PO_P = 0.0022;
export const PO_LEAD = 3.4;
export const PO_LEAD_AT = 1.0;
export const PO_THROW_AT = 1.3;
export const PO_THROW_V = 30;
export const PO_REACT = 0.3;
/* Throw-over that does not get him (#38): same set-up, drawn with POF_P after the pickoff draw, at most POF_MAX_PA times
 * in one plate appearance (MLB rule since 2023: two disengagements per plate appearance; a third that does not get the
 * runner is a balk, so pitchers stop at two). The runner keeps a shorter lead (POF_LEAD m), reads the step-off and breaks
 * back POF_READ s before the throw leaves, so he is back before the ball (resolvePickoff checks it). The first baseman's
 * swipe tag comes too late, he lobs the ball back to the pitcher POF_BACK_AFTER s after the catch at POF_BACK_V.
 * Tuned so pickoff throws/game (PO + POF) match tests/replay/run.mjs REFERENCE (CBS Sports 2023, see there). */
export const POF_P = 0.062;
export const POF_MAX_PA = 2;
export const POF_LEAD = 2.8;
export const POF_READ = 0.35;
export const POF_BACK_AFTER = 1.2;
export const POF_BACK_V = 14;
export const WP_BREAK = 0.35;             /* runners break this long after the ball reaches the plate (it gets past the mitt): WP and PB */

/* ---- manager decisions ---- */
/* The starter's pitch budget as his coach sees it: SP_LIMIT_PITCHES while nobody has scored on him,
 * SP_LIMIT_PER_RUN shorter for every run allowed, SP_LATE_CUT shorter from inning SP_LATE_INNING on. */
export const SP_LIMIT_PITCHES = 97;
export const SP_LIMIT_PER_RUN = 7;
export const SP_LATE_INNING = 7;
export const SP_LATE_CUT = 8;
export const SP_ASK_BEFORE = [0, 12];     /* the change question comes up this many pitches before the budget: [min, random span] */
export const SP_PULL_RUNS = [4, 2];       /* ...or once he has allowed this many runs: [min, random span] */
export const SP_MAX_RUNS = 5;             /* from this many runs the coach's own pick is a change, whatever the pitch count */
export const RP_PULL_PITCHES = [20, 14];
export const RP_PULL_RUNS = 3;
export const STAY_HOLD_BATTERS = 3;       /* after "stay", do not ask again for this many batters */
export const IBB_MIN_INNING = 4;
export const IBB_MIN_POWER = 1;
export const IBB_CONSIDER_P = 0.8;
export const IBB_CLOSE_RUNS = 1;          /* the coach's own pick is a walk only within this many runs... */
export const IBB_COACH_MIN_INNING = 8;    /* ...and from this inning on; earlier he pitches to the batter */
/* pinch hit (#436 part 2): off by default (factory games unchanged); simGame opts.pinchHit overrides */
export const PINCH_HIT_ON = false;
export const PH_MIN_INNING = 7;           /* asked only from this inning on, with a runner on second or third */
export const PH_EDGE = 0.3;               /* coach's own pick is the pinch hitter when his bat value (con x pow) is this much higher */
export const PH_DUR = 10;                 /* seconds of the pinch-hit frame (walk from the dugout) */
export const BUNT_POW_MAX = 1.0;
export const BUNT_ASK_P = 0.75;
export const BUNT_MIN_INNING = 7;
export const BUNT_MAX_DEFICIT = 1;
export const BUNT_SAC_END = 0.7;          /* below: sacrifice attempt */
export const BUNT_HIT_END = 0.82;         /* below: bunt for a hit; above: defence goes for the lead runner */
export const BUNT_DIST = [10, 4];
export const BUNT_ROLL_SPEED = 8;
export const BUNT_SPRAY_DEG = [-30, 30];  /* third-base line to the mound */
export const BUNT_FIELDERS = ['P', '3B'];
export const BUNT_HIT_FUMBLE = 1.5;        /* seconds lost picking up a bunt that was placed too well */

/* ---- fielding and throwing ---- */
export const FIELD_VAVG = 6.4;            /* average chase speed used to decide what is reachable */
export const FIELD_REACT = 0.25;
/* Fielder range (#378): a batter's optional `def` (centred on 1.0 like arm; missing = 1) scales his chase speed,
 * clamped to the same 0.85..1.15 band as ARM_MIN + ARM_SPAN. The factory rosters carry no `def`, so their games stay
 * byte for byte the same. */
export const DEF_MIN = 0.85;
export const DEF_MAX = 1.15;
/* ... and the defence behind the pitcher turns hits into outs: a hit or error chance is divided by
 * 1 + (mean def of the fielders who play that ball - 1) x weight (grounders: the infield, line drives and fly balls:
 * the outfield, pop-ups: all seven). First guess, owner to tune: at the clamp ends a whole team moves hits by about
 * +-5%, near the MLB spread of team defence (about +-0.015 BABIP). Errors follow the glove fully. */
export const DEF_HIT_WEIGHT = 0.33;
export const DEF_ERR_WEIGHT = 1;
export const GB_REACH_BONUS = 0.5;        /* a grounder may be picked up this far past the chase range */
export const AIR_REACH_SAFETY = 0.999;    /* a catchable air ball is strictly inside the fielder's range */
export const CATCH_STAND_OFF = 0.4;       /* fielder sets up this far beside the ball */
export const COVER_REACT = 0.1;           /* extra delay before a fielder breaks to cover a base */
export const COVER_SPEED = 6.5;
export const PIVOT_SPEED = 7;
export const COVER_NEAR = 0.3;            /* already on the spot if closer than this */
export const BAG_FOOT = 0.12;             /* a covering fielder's foot is this far from the bag centre */
export const RELAY_SPOT_OFF = [0.55, 0.45];
export const THIRD_TAG_OFF = 0.3;            /* tag spot at third: this far from the bag on both axes, inside the diamond */
/* Tag spot at second, [x, z] from the bag: beside the first-to-second lane on the third-base side,
 * so the runner slides past the fielder and not through him. */
export const SECOND_TAG_OFF = [-0.3, 0.3];
export const HOME_TAG_SPOT = [0.75, -0.55];
export const SOLO_SETUP = 0.15;           /* fielder gathers himself before running to the bag */
export const SOLO_HOLD = 0.9;
export const ARM_MIN = 0.85;
export const ARM_SPAN = 0.3;
export const THROW_SHORT = 20;
export const THROW_V_SHORT = [25, 5];     /* [base, bonus at max arm] */
export const THROW_V_INFIELD = [34, 6];
export const THROW_V_OUTFIELD = [36, 7];
export const THROW_MIN = 0.25;            /* shortest possible ball flight */
export const XFER_BASE = 1;
export const XFER_ARM = 0.3;
export const XFER_OUTFIELD = 0.15;
export const XFER_SHORT = 0.2;
export const XFER_MIN = 0.6;
export const XFER_MAX = 1.2;
export const XFER_RUSH = 0.45;            /* fastest glove-to-hand transfer under pressure */
export const PIVOT_XFER = 0.4;
export const FORCE_MARGIN = 0.25;         /* fielders aim to beat the runner by this much */
export const TAG_EARLY = 0.25;            /* on a tag out the ball is there this long before the runner */
export const TAG_LATE = 0.3;              /* on a safe tag play the ball is this late */
export const OUT_CALL_LAG = 0.05;
/* A ball that beats the runner by less than this is no out: the tie goes to the runner, and every out
 * stays provable from the stream, whose times are rounded to the millisecond. */
export const CLOSE_PLAY_MARGIN = 0.01;
export const CATCHER_POP = 0.7;           /* catcher's transfer on a steal */
export const RETURN_AFTER_CATCH = 1.2;
export const RETURN_AFTER_THROW = 0.7;

/* ---- running ---- */
export const RUN_SPEED = 7.8;
export const WALK_SPEED = 4.5;            /* trot on a walk */
/* #266: home-run trot. MLB trots run about 22-23 s home to home (Statcast / Tater Trot Tracker averages, 2015-2024);
 * 4 x 27.43 m at 5.0 m/s with RUN_ACCEL is 22.4 s. Every runner of a home run trots at this pace. */
export const HR_TROT_SPEED = 5.0;
export const RUN_ACCEL = 0.9;             /* seconds to reach full speed */
export const BAT_RUN_DELAY = 0.1;         /* batter leaves the box this long after contact */
export const STEAL_JUMP = 0.3;            /* a stealing runner breaks this long before release */
export const WALK_DELAY = 0.8;
export const SLIDE_D = 3;
export const LEAD_STAND = 0;
/* #23 part 1: primary lead a runner keeps between pitches (before the first move and after the pitch); same as the lead a
 * held runner takes on a pickoff (PO_LEAD). A runner who tags up on a caught fly goes back to the bag (LEAD_STAND). */
export const LEAD_PRIMARY = 3.4;
export const LEAD_PITCH = 3.8;
export const LEAD_OPEN = 0.6;
export const LEAD_GROW = 0.9;
export const LEAD_BACK_AT = 0.2;
export const LEAD_BACK_DUR = 0.8;

/* ---- defensive alignment ---- */
export const HOLD_OFF = 0.8;
export const DP_SHIFT = 0.3;
export const HOLD2_SHIFT = 0.4;
export const HOT3_SHIFT = 0.5;
