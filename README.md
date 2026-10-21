# meme — launch memes backed by memes

A pump.fun launchpad on Solana. Every coin launched here picks an existing meme to back it
(BONK, WIF, POPCAT, or any SPL mint). The coin's pump.fun creator fees are claimed on a schedule and split:

| Share | Default | Goes to |
|---|---|---|
| Backing | 50% | Swapped into the backing meme via Jupiter and **held in the coin's vault** |
| Launcher | 40% | The wallet that launched the coin |
| Treasury | 10% | Your platform wallet |

All three are env vars (`BACKING_BPS`, `LAUNCHER_BPS`, `TREASURY_BPS`, must sum to 10000).

## How it works

```
launcher wallet ──deposit (dev buy + 0.05 SOL)──► coin vault (new keypair, encrypted at rest)
                                                      │
                                   pump.fun create ◄──┘  vault is signer ⇒ vault is the coin's creator
                                                      │
          dev-buy tokens + unused SOL ◄───────────────┘  sent back to the launcher

every WORKER_INTERVAL_SEC:
  vault ──collectCreatorFee──► SOL in vault ──► 50% Jupiter swap → backing meme stays in vault
                                              ├─► 40% launcher
                                              └─► 10% treasury
```

The key design choice: **the vault, not the person, is the coin's on-chain creator.** pump.fun pays creator
fees to whoever created the coin, so making the vault the creator is what makes the backing enforceable.
The launcher can't redirect fees away from the backing. One vault per coin keeps the accounting exact
(pump.fun's fee claim is per creator, across all their coins).

Edge cases handled:
- **User closes the tab after depositing:** the worker finds funded vaults older than 2 minutes and finishes the launch.
- **Create tx fails:** the deposit is refunded automatically. A confirmation timeout is checked against the chain first, so a launch that actually landed is never refunded.
- **Deposit never completed:** after 24h the launch expires and any partial deposit is returned.
- **Swap fails:** nothing is paid out that round; the full amount is retried next pass.
- **Dev-buy hand-off fails:** retried by the worker.

## Setup

```bash
npm install
cp .env.example .env
npm run gen-key          # paste output into VAULT_ENCRYPTION_KEY
# set TREASURY_PUBKEY, SOLANA_RPC_URL (+ NEXT_PUBLIC_SOLANA_RPC_URL)
npm run dev              # web app on :3000
npm run worker           # fee claimer + buyback loop (run as a second process)
```

Production: `npm run build && npm start` plus `npm run worker` under a process manager (pm2, systemd, a Fly/Railway worker).
The app uses SQLite (`DATABASE_PATH`), so it needs a persistent disk. It does not fit on serverless (Vercel) as-is;
for that, swap `src/lib/db.ts` for Postgres.

## Project map

```
src/lib/pump.ts        pump.fun IPFS upload + PumpPortal create / collectCreatorFee tx builders
src/lib/launch.ts      deposit → create → hand dev buy back → return overhead; refunds
src/lib/distribute.ts  claim creator fees, swap backing share, pay launcher + treasury
src/lib/jupiter.ts     SOL → backing meme swap
src/lib/crypto.ts      AES-256-GCM for vault + mint secret keys
src/lib/db.ts          SQLite schema (tokens, distributions)
scripts/worker.ts      the background loop
src/app/launch         launch form (wallet signs one SOL transfer, nothing else)
src/app/token/[mint]   coin page: vault holdings, totals, buyback history
```

## Before you put real money through it

I wrote this without network access to the package registry or to pump.fun, so it has **not been compiled or run**.
Do these on a small test launch first:

1. `npm install && npm run typecheck && npm run build`, then fix anything that shakes out.
2. **Verify the PumpPortal API shape** (`action: "create"`, `pool: "pump"`, `action: "collectCreatorFee"`) against
   pumpportal.fun's docs. Endpoints are env vars, so you can repoint them without code changes.
3. **Verify the creator-vault seeds** in `src/lib/distribute.ts` (`creator-vault` on the pump program,
   `creator_vault` on PumpSwap). They are only used to skip claims when fees are tiny; if they're wrong the worker
   just attempts the claim every pass.
4. Check the Jupiter base URL (`JUPITER_API_URL`) is current.
5. Launch one coin with a 0.01 SOL dev buy, trade it a little, run `npm run worker:once`, and confirm on Solscan
   that the vault received the backing meme.

Operational notes:
- **Back up `VAULT_ENCRYPTION_KEY`.** Lose it and every vault (and its backing) is gone.
- The server holds vault keys, so the server is the trust boundary. Lock it down; consider a KMS/HSM for the key.
- Add rate limiting to `/api/launch/prepare` (it uploads to IPFS) before going public.
- Backing is held, not redeemable. If you want holders to be able to redeem against it, that needs an on-chain program.
- Memecoin launchpads can carry legal obligations depending on where you and your users are. Worth a check before launch.
