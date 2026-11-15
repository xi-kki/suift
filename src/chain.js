import { createDAppKit } from '@mysten/dapp-kit-core';
import '@mysten/dapp-kit-core/web';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';

export const PKG = '0xf103b5b54a6de40e5efaa77a205e327776bd29e4be18cff76748fdee87e04701';
export const LEADERBOARD = '0x82b6ec776d4eb15fcfa1e11225c704d0f489e1f47810d43e936c237b7a1d5219';
const URL = 'https://fullnode.testnet.sui.io:443';

export const dAppKit = createDAppKit({
  networks: ['testnet'],
  defaultNetwork: 'testnet',
  createClient: (network) => new SuiGrpcClient({ network, baseUrl: URL }),
});

const client = new SuiGrpcClient({ network: 'testnet', baseUrl: URL });

const Entry = bcs.struct('Entry', {
  player: bcs.Address,
  name: bcs.string(),
  score: bcs.u64(),
  laps: bcs.u64(),
  perfects: bcs.u64(),
  ts_ms: bcs.u64(),
});
const Board = bcs.struct('Leaderboard', {
  id: bcs.Address,
  entries: bcs.vector(Entry),
  total_runs: bcs.u64(),
});

export async function fetchBoard() {
  const { object } = await client.getObject({ objectId: LEADERBOARD, include: { content: true } });
  const b = Board.parse(object.content);
  return {
    total: Number(b.total_runs),
    entries: b.entries.map((e) => ({ ...e, score: Number(e.score), laps: Number(e.laps), perfects: Number(e.perfects) })),
  };
}

export function account() {
  const c = dAppKit.stores.$connection.get();
  return c.isConnected && c.account ? c.account.address : null;
}

export function onAccount(fn) {
  return dAppKit.stores.$connection.subscribe((c) => fn(c.isConnected && c.account ? c.account.address : null));
}

// Move checks byte length (<=16), not chars
const clip16 = (s) => { const e = new TextEncoder(); let o = ''; for (const ch of s) { if (e.encode(o + ch).length > 16) break; o += ch; } return o || 'unnamed'; };

export async function submitRun({ name, score, laps, perfects, image }) {
  const sender = account();
  if (!sender) throw new Error('Connect a wallet first');
  const tx = new Transaction();
  const m = tx.moveCall({
    target: `${PKG}::suift::submit_run`,
    arguments: [
      tx.object(LEADERBOARD),
      tx.pure.string(clip16(name)),
      tx.pure.u64(score),
      tx.pure.u64(laps),
      tx.pure.u64(perfects),
      tx.pure.string(image),
      tx.object.clock(),
    ],
  });
  tx.transferObjects([m], sender);
  const r = await dAppKit.signAndExecuteTransaction({ transaction: tx });
  if (r.FailedTransaction) throw new Error(r.FailedTransaction.status.error?.message || 'Transaction failed');
  return r.Transaction.digest;
}

export const txUrl = (d) => `https://suiscan.xyz/testnet/tx/${d}`;
