/// Suift - a calm orbit game. Runs are scored off-chain in the browser;
/// each finished run is submitted here: it updates a shared top-20 leaderboard
/// (best run per player) and mints the run's mandala as a collectible.
/// Note: scores are client-reported (testnet game), bounded by sanity checks.
module suift::suift;

use std::string::String;
use sui::clock::Clock;
use sui::display_registry::DisplayRegistry;
use std::internal;
use sui::event;
use sui::package;

const MAX_ENTRIES: u64 = 20;
const MAX_SCORE: u64 = 10_000_000;
const MAX_NAME: u64 = 16;
const MAX_IMAGE: u64 = 12_000;

#[error]
const EZeroScore: vector<u8> = b"score must be > 0";
#[error]
const EScoreTooHigh: vector<u8> = b"score out of range";
#[error]
const EBadName: vector<u8> = b"name too long";
#[error]
const EBadImage: vector<u8> = b"image too large";

public struct SUIFT has drop {}

public struct Entry has copy, drop, store {
    player: address,
    name: String,
    score: u64,
    laps: u64,
    perfects: u64,
    ts_ms: u64,
}

public struct Leaderboard has key {
    id: UID,
    entries: vector<Entry>,
    total_runs: u64,
}

public struct Mandala has key, store {
    id: UID,
    name: String,
    score: u64,
    laps: u64,
    perfects: u64,
    image: String,
    created_ms: u64,
}

public struct RunSubmitted has copy, drop {
    player: address,
    name: String,
    score: u64,
    laps: u64,
    perfects: u64,
    rank: u64, // 0 = not on board, else 1-based
    mandala: ID,
}

public struct AdminCap has key, store { id: UID }

fun init(otw: SUIFT, ctx: &mut TxContext) {
    let publisher = package::claim(otw, ctx);
    transfer::public_transfer(publisher, ctx.sender());
    transfer::public_transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
    transfer::share_object(Leaderboard { id: object::new(ctx), entries: vector[], total_runs: 0 });
}

/// One-time after publish: register Display v2 for Mandala via system registry (0xd).
public fun setup_display(registry: &mut DisplayRegistry, _: &AdminCap, ctx: &mut TxContext) {
    let (mut d, cap) = registry.new<Mandala>(internal::permit<Mandala>(), ctx);
    d.set(&cap, b"name".to_string(), b"Suift Mandala - {score}".to_string());
    d.set(&cap, b"description".to_string(), b"Drawn by {name} in one calm orbit: {laps} laps, {perfects} perfect fits.".to_string());
    d.set(&cap, b"image_url".to_string(), b"{image}".to_string());
    d.set(&cap, b"project_url".to_string(), b"https://xi-kki.github.io/suift/".to_string());
    d.share();
    transfer::public_transfer(cap, ctx.sender());
}

public fun submit_run(
    lb: &mut Leaderboard,
    name: String,
    score: u64,
    laps: u64,
    perfects: u64,
    image: String,
    clock: &Clock,
    ctx: &mut TxContext,
): Mandala {
    assert!(score > 0, EZeroScore);
    assert!(score <= MAX_SCORE, EScoreTooHigh);
    assert!(name.length() <= MAX_NAME, EBadName);
    assert!(image.length() <= MAX_IMAGE, EBadImage);

    let player = ctx.sender();
    let now = clock.timestamp_ms();
    lb.total_runs = lb.total_runs + 1;

    let rank = upsert(lb, Entry { player, name, score, laps, perfects, ts_ms: now });

    let m = Mandala { id: object::new(ctx), name, score, laps, perfects, image, created_ms: now };
    event::emit(RunSubmitted { player, name, score, laps, perfects, rank, mandala: object::id(&m) });
    m
}

/// Keep best entry per player; sorted desc; capped. Returns 1-based rank or 0.
fun upsert(lb: &mut Leaderboard, e: Entry): u64 {
    let n = lb.entries.length();
    let mut i = 0;
    while (i < n) {
        if (lb.entries[i].player == e.player) {
            if (lb.entries[i].score >= e.score) return 0;
            lb.entries.remove(i);
            break
        };
        i = i + 1;
    };
    let n = lb.entries.length();
    let mut pos = 0;
    while (pos < n && lb.entries[pos].score >= e.score) pos = pos + 1;
    if (pos >= MAX_ENTRIES) return 0;
    lb.entries.insert(e, pos);
    if (lb.entries.length() > MAX_ENTRIES) { lb.entries.pop_back(); };
    pos + 1
}

// === views ===
public fun len(lb: &Leaderboard): u64 { lb.entries.length() }
public fun score_at(lb: &Leaderboard, i: u64): u64 { lb.entries[i].score }
public fun player_at(lb: &Leaderboard, i: u64): address { lb.entries[i].player }
public fun total_runs(lb: &Leaderboard): u64 { lb.total_runs }
public fun mandala_score(m: &Mandala): u64 { m.score }

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) { init(SUIFT {}, ctx) }
