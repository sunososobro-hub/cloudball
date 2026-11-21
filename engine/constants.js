/* Every tunable number of the engine lives here, with a name.
 * Units: metres, seconds, metres/second unless stated. Probabilities are 0..1. */

export const ENGINE_VERSION = '0.3.0';

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
export const VOTE_DUR = 2;
export const VOTE_WINDOW = 15;
export const PITCH_DUR = { ball: 12, cstr: 12, sstr: 12, foul: 12, hbp: 15, ibb: 10 };
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
export const ZONE_P_BASE = 0.53;
export const ZONE_P_MAX = 0.64;
export const ZONE_HALF_WIDTH = 0.21;      /* in-zone x spread is +-this */
export const ZONE_Y_MIN = 0.55;
export const ZONE_Y_SPAN = 0.55;
export const MISS_X_MIN = 0.24;
export const MISS_X_SPAN = 0.25;
export const MISS_LOW_Y = 0.35;
export const MISS_LOW_SPAN = 0.25;
export const MISS_HIGH_Y = 1.15;
export const MISS_HIGH_SPAN = 0.3;
export const HBP_P = 0.012;               /* chance that a taken pitch outside the zone hits the batter */
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
export const SWING_IN_ZONE = 0.65;
export const SWING_CHASE = 0.33;          /* divided by the batter's eye */
export const SWING_2K_IN_ZONE = 0.18;
export const SWING_2K_CHASE = 0.1;
export const SWING_3B_FACTOR = 0.5;
export const SWING_30_FACTOR = 0.3;
export const SWING_MAX = 0.95;
export const CONTACT_IN_ZONE = 0.86;
export const CONTACT_CHASE = 0.62;
export const CONTACT_MAX = 0.97;
export const FOUL_P = 0.5;
export const FOUL_P_2K = 0.56;

/* ---- batted ball mix and results ---- */
export const GB_SHARE = 0.43;
export const LD_SHARE_END = 0.64;         /* GB below 0.43, LD up to this, air above */
export const POPUP_OF_AIR = 0.22;
export const SPRAY_MAX_DEG = 44;
export const SPRAY_MAIN_DEG = 88;
export const SPRAY_NOISE_DEG = 20;
export const HR_P = 0.155;                /* x pow^2 / stuff, for fly balls */
export const GB_HIT_P = 0.255;            /* x con / stuff */
export const GB_DOUBLE_P = 0.04;
export const LD_HIT_P = 0.7;              /* x con / stuff */
export const LD_SINGLE_END = 0.68;
export const LD_DOUBLE_END = 0.97;
export const FB_HIT_P = 0.17;
export const FB_SINGLE_END = 0.35;
export const FB_DOUBLE_END = 0.9;
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
export const FIRST_TO_THIRD_ON_SINGLE = 0.25;
export const SCORE_FROM_1ST_ON_DOUBLE = 0.4;
export const DP_TRY_P = 0.5;
export const SAC_FLY_P = 0.55;
export const GB_ADVANCE_P = 0.5;
export const STEAL_CONSIDER_P = 0.6;
export const STEAL_TRY_BASE = 0.45;
export const STEAL_TRY_PER_SPD = 1.2;
export const STEAL_TRY_RANGE = [0.1, 0.85];
export const STEAL_OK_BASE = 0.72;
export const STEAL_OK_PER_SPD = 0.6;
export const STEAL_OK_RANGE = [0.5, 0.9];
export const HOME_SLIDE_P = 0.5;

/* ---- manager decisions ---- */
export const SP_PULL_PITCHES = [75, 20];  /* [min, random span] */
export const SP_PULL_RUNS = [4, 2];
export const RP_PULL_PITCHES = [20, 14];
export const RP_PULL_RUNS = 3;
export const STAY_HOLD_BATTERS = 3;       /* after "stay", do not ask again for this many batters */
export const IBB_MIN_INNING = 4;
export const IBB_MIN_POWER = 1;
export const IBB_CONSIDER_P = 0.8;
export const IBB_CLOSE_RUNS = 2;
export const BUNT_POW_MAX = 1.0;
export const BUNT_ASK_P = 0.6;
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
export const GB_REACH_BONUS = 0.5;        /* a grounder may be picked up this far past the chase range */
export const AIR_REACH_SAFETY = 0.999;    /* a catchable air ball is strictly inside the fielder's range */
export const CATCH_STAND_OFF = 0.4;       /* fielder sets up this far beside the ball */
export const COVER_REACT = 0.1;           /* extra delay before a fielder breaks to cover a base */
export const COVER_SPEED = 6.5;
export const PIVOT_SPEED = 7;
export const COVER_NEAR = 0.3;            /* already on the spot if closer than this */
export const BAG_FOOT = 0.12;             /* a covering fielder's foot is this far from the bag centre */
export const RELAY_SPOT_OFF = [0.55, 0.45];
export const THIRD_TAG_OFF = 0.3;
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
export const CATCHER_POP = 0.7;           /* catcher's transfer on a steal */
export const RETURN_AFTER_CATCH = 1.2;
export const RETURN_AFTER_THROW = 0.7;

/* ---- running ---- */
export const RUN_SPEED = 7.8;
export const WALK_SPEED = 4.5;            /* trot on a walk */
export const RUN_ACCEL = 0.9;             /* seconds to reach full speed */
export const BAT_RUN_DELAY = 0.1;         /* batter leaves the box this long after contact */
export const STEAL_JUMP = 0.3;            /* a stealing runner breaks this long before release */
export const WALK_DELAY = 0.8;
export const SLIDE_D = 3;
export const LEAD_STAND = 0;
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
