// dashboard/src/app/api/prep-pack/route.ts
import { NextResponse } from 'next/server';
import * as childProcess from 'node:child_process';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { buildJobStem } from '@/lib/prep-pack/naming';
import type { PrepPackJobResponse } from '@/lib/prep-pack/types';

const VAULT_INBOX = 'F:\\Obsidian\\SecondBrain\\Inbox';
const AUDIOBOOK_OUTPUT_DIR = 'F:\\Projects\\EbookAutomation\\output\\audiobooks';
const KINDLE_OUTPUT_DIR = 'F:\\Projects\\EbookAutomation\\output\\kindle';
const VAULT_NOTE_DIR = 'F:\\Obsidian\\SecondBrain\\Learning\\Audiobooks';

// Path to the wrapper script. process.cwd() is the dashboard/ dir when Next.js runs;
// tools/ sits next to src/.
const WRAPPER_SCRIPT = path.resolve(process.cwd(), 'tools', 'run-prep-pack.ps1');

// Absolute pwsh path. Node's spawn inherits the parent's PATH, but Next.js
// dev servers can be started from environments where pwsh isn't on PATH.
// Using the conventional Windows install path is more reliable than relying
// on lookup. Fall back to bare 'pwsh' so this still works on a dev machine
// where it's on PATH but installed somewhere unconventional.
const PWSH_DEFAULT = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
const PWSH_BIN = process.env.PWSH_BIN ?? PWSH_DEFAULT;

const DISCORD_RELAY_URL = process.env.DISCORD_RELAY_URL ?? 'http://localhost:3000/api/discord-relay';

const RequestSchema = z.object({
  intelligence: z.object({
    company: z.string().trim().min(1),
    jobTitle: z.string().trim().min(1),
    applicationId: z.string().trim().min(1),
    companyResearch: z.unknown().optional(),
    interviewPrep: z.unknown().optional(),
  }),
  config: z.object({
    voice: z.enum(['Steffan', 'Aria', 'Jenny', 'Guy']),
    depth: z.enum(['Quick', 'Standard', 'Deep']),
    mode: z.enum(['Single', 'Series']),
    produceKindle: z.boolean(),
    kindleFormat: z.enum(['KFX', 'AZW3']),
    customFocus: z.string(),
  }),
  sourceText: z.string().trim().min(1),
});

export async function POST(request: Request): Promise<Response> {
  let parsed;
  try {
    const body = await request.json();
    parsed = RequestSchema.parse(body);
  } catch (err) {
    return NextResponse.json(
      { status: 'rejected', reason: 'Invalid request body', details: String(err) },
      { status: 400 },
    );
  }

  const { intelligence, config, sourceText } = parsed;
  const stem = buildJobStem(intelligence.company, intelligence.jobTitle, new Date());
  const inputPath = path.join(VAULT_INBOX, `${stem}.txt`);

  try {
    await fsp.mkdir(VAULT_INBOX, { recursive: true });
    await fsp.writeFile(inputPath, sourceText, 'utf8');
  } catch (err) {
    return NextResponse.json(
      { status: 'rejected', reason: `Failed to write input file: ${String(err)}` },
      { status: 500 },
    );
  }

  const args: string[] = [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', WRAPPER_SCRIPT,
    '-InputFile', inputPath,
    '-Voice', config.voice,
    '-Depth', config.depth,
    '-Mode', config.mode,
    '-DiscordWebhookUrl', DISCORD_RELAY_URL,
  ];
  if (config.produceKindle) {
    args.push('-ProduceKindle');
    args.push('-KindleFormat', config.kindleFormat);
  }

  // Spawn pwsh.exe to run the wrapper script. CRITICAL on Windows:
  //   pwsh.exe -File <script> needs an inherited terminal session to actually
  //   execute the script body. With detached:true + closed/null-device stdio,
  //   pwsh starts (PID gets issued), allocates no host, then exits cleanly
  //   (code 0, ~120ms) without running ANY of the script. Multiple workarounds
  //   tried (null-device fds, os.devNull, windowsHide variations) — none
  //   reliably keep pwsh's host alive to run -File.
  //
  // Pragmatic fix: detached:false + stdio:inherit. The child inherits the
  // dev server's terminal, pwsh's host binds successfully, the script runs.
  // Tradeoff: if the dev server is killed mid-render, the wrapper dies too.
  // For a single-user local feature that's acceptable — re-clicking Render
  // is cheap and the wrapper writes a transcript anyway. Bonus: wrapper's
  // live output (planner steps, chapter generation, Calibre progress) shows
  // in the dev server terminal, so users can watch progress without tailing
  // the transcript file.
  console.error(`[prep-pack] spawning: ${PWSH_BIN} ${args.join(' ')}`);
  const child = childProcess.spawn(PWSH_BIN, args, {
    detached: false,
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: false,
  });

  child.on('error', (err) => {
    console.error(
      `[prep-pack] spawn ERROR for stem ${stem}: ${err.message}. ` +
        `PWSH_BIN=${PWSH_BIN}. Set PWSH_BIN env var to override.`,
    );
  });
  child.on('spawn', () => {
    console.error(`[prep-pack] spawn OK for stem ${stem}: pid=${child.pid}`);
  });
  child.on('exit', (code, signal) => {
    console.error(
      `[prep-pack] subprocess EXIT for stem ${stem}: code=${code} signal=${signal}`,
    );
  });

  // No child.unref(): detached:false ties the child's lifetime to the
  // parent's event loop. The route handler returns 202 immediately while
  // the spawn is still running — the request response is decoupled from
  // child completion via Node's async I/O model.

  const expectedOutputs: PrepPackJobResponse['expectedOutputs'] = {
    vaultNote: path.join(VAULT_NOTE_DIR, `${stem}.md`),
    mp3: path.join(AUDIOBOOK_OUTPUT_DIR, `${stem}.mp3`),
  };
  if (config.produceKindle) {
    const ext = config.kindleFormat.toLowerCase();
    expectedOutputs.kindle = path.join(KINDLE_OUTPUT_DIR, `${stem}.${ext}`);
  }

  return NextResponse.json(
    {
      status: 'started',
      jobStem: stem,
      inputPath,
      expectedOutputs,
    } satisfies PrepPackJobResponse,
    { status: 202 },
  );
}
