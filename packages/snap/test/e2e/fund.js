// SPDX-License-Identifier: Apache-2.0

/**
 * Funding a Snap-derived party.
 *
 * The Snap derives a party that has never existed before, so it has no balance,
 * and minting is an operator action. canton-middleware already ships the tool:
 *
 *   scripts/remote/mint-demo-devnet.sh -p <party> -a <amount>
 *
 * which wraps scripts/remote/mint-to-party.go, described in its own header as a
 * utility for minting to external parties "without requiring database
 * registration". That is exactly this case.
 *
 * Set MIDDLEWARE_REPO to let the test fund itself. Without it the test prints
 * the command and fails, rather than timing out on an empty balance and leaving
 * someone to guess why.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const REPO = process.env.MIDDLEWARE_REPO;
const CONFIG = process.env.MINT_CONFIG; // passed through as -c when set
const SCRIPT = "scripts/remote/mint-demo-devnet.sh";

export function fundingCommand(party, amount) {
  const cfg = CONFIG ? ` -c ${CONFIG}` : "";
  return `./${SCRIPT} -p "${party}" -a ${amount}${cfg}`;
}

/**
 * Mint DEMO to a party. Returns true if it minted, throws with the command to
 * run if it could not.
 *
 * @param {string} party Canton party id
 * @param {string} amount decimal string
 */
export async function fundParty(party, amount = "100") {
  if (!REPO) {
    throw new Error(
      `Cannot fund ${party}: set MIDDLEWARE_REPO to the canton-middleware checkout, ` +
        `or fund it yourself first with:\n    ${fundingCommand(party, amount)}`,
    );
  }
  const script = join(REPO, SCRIPT);
  const config = join(REPO, CONFIG ?? "config.api-server.devnet-test.yaml");
  const absent = [script, config].filter((f) => !existsSync(f));
  if (absent.length) {
    throw new Error(
      `MIDDLEWARE_REPO is set but these are missing:\n  ${absent.join("\n  ")}\n` +
        `Both are untracked in canton-middleware today. Commit them, or pass ` +
        `MINT_CONFIG pointing at a tracked config.`,
    );
  }

  const args = ["-p", party, "-a", String(amount)];
  if (CONFIG) args.push("-c", CONFIG);

  try {
    const { stdout } = await run(script, args, { cwd: REPO, timeout: 90000 });
    return stdout;
  } catch (err) {
    // The script's own stderr is far more useful than the exit code.
    throw new Error(
      `Minting to ${party} failed.\n  command: ${fundingCommand(party, amount)}\n` +
        `  stderr: ${(err.stderr || err.message || "").slice(0, 500)}`,
    );
  }
}
