#[test_only]
module suift::suift_tests;

use std::string;
use sui::clock;
use sui::test_scenario as ts;
use suift::suift::{Self, Leaderboard, Mandala};

const ALICE: address = @0xA;
const BOB: address = @0xB;

fun setup(): ts::Scenario {
    let mut sc = ts::begin(@0x0);
    suift::init_for_testing(sc.ctx());
    sc
}

fun submit(sc: &mut ts::Scenario, who: address, score: u64) {
    sc.next_tx(who);
    let mut lb = sc.take_shared<Leaderboard>();
    let clk = clock::create_for_testing(sc.ctx());
    let m = suift::submit_run(
        &mut lb,
        string::utf8(b"orbiter"),
        score,
        3,
        2,
        string::utf8(b"data:image/svg+xml,<svg/>"),
        &clk,
        sc.ctx(),
    );
    transfer::public_transfer(m, who);
    clk.destroy_for_testing();
    ts::return_shared(lb);
}

#[test]
fun ranks_sorted_desc() {
    let mut sc = setup();
    submit(&mut sc, ALICE, 50);
    submit(&mut sc, BOB, 90);
    sc.next_tx(ALICE);
    let lb = sc.take_shared<Leaderboard>();
    assert!(suift::len(&lb) == 2);
    assert!(suift::score_at(&lb, 0) == 90);
    assert!(suift::player_at(&lb, 0) == BOB);
    assert!(suift::score_at(&lb, 1) == 50);
    assert!(suift::total_runs(&lb) == 2);
    ts::return_shared(lb);
    sc.end();
}

#[test]
fun keeps_only_best_per_player() {
    let mut sc = setup();
    submit(&mut sc, ALICE, 50);
    submit(&mut sc, ALICE, 30);
    submit(&mut sc, ALICE, 70);
    sc.next_tx(ALICE);
    let lb = sc.take_shared<Leaderboard>();
    assert!(suift::len(&lb) == 1);
    assert!(suift::score_at(&lb, 0) == 70);
    assert!(suift::total_runs(&lb) == 3);
    ts::return_shared(lb);
    sc.end();
}

#[test]
fun mints_mandala_to_player() {
    let mut sc = setup();
    submit(&mut sc, ALICE, 42);
    sc.next_tx(ALICE);
    let m = sc.take_from_sender<Mandala>();
    assert!(suift::mandala_score(&m) == 42);
    sc.return_to_sender(m);
    sc.end();
}

#[test]
fun caps_board_size() {
    let mut sc = setup();
    let mut i = 1;
    while (i <= 25) {
        submit(&mut sc, sui::address::from_u256((i as u256)), i * 10);
        i = i + 1;
    };
    sc.next_tx(ALICE);
    let lb = sc.take_shared<Leaderboard>();
    assert!(suift::len(&lb) == 20);
    assert!(suift::score_at(&lb, 0) == 250);
    assert!(suift::score_at(&lb, 19) == 60);
    ts::return_shared(lb);
    sc.end();
}

#[test, expected_failure(abort_code = suift::EZeroScore)]
fun rejects_zero() {
    let mut sc = setup();
    submit(&mut sc, ALICE, 0);
    sc.end();
}

#[test, expected_failure(abort_code = suift::EScoreTooHigh)]
fun rejects_absurd() {
    let mut sc = setup();
    submit(&mut sc, ALICE, 10_000_001);
    sc.end();
}
