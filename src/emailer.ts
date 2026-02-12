import { log } from './logger.js';
import type { MatchResult } from './types.js';
import type { Config } from './config.js';

function sourceLabel(source: string): string {
  if (source === 'remoteok') return 'Remote OK';
  if (source === 'web3career') return 'Web3.Career';
  return source;
}

function jobCardHTML(match: MatchResult): string {
  const { job, score, explanation } = match;
  const salaryText = job.salary.raw || 'Not disclosed';

  return `
    <div style="border:1px solid #e0e0e0;border-radius:8px;padding:20px;margin-bottom:16px;background:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h2 style="margin:0;font-size:18px;color:#1a1a1a;">${job.title}</h2>
        <span style="background:#4CAF50;color:#fff;padding:4px 10px;border-radius:12px;font-size:14px;font-weight:bold;">${score}%</span>
      </div>
      <p style="margin:4px 0;color:#555;font-size:14px;">${job.company} &bull; ${salaryText}</p>
      <div style="margin:12px 0;font-size:13px;color:#666;line-height:1.5;">
        ${explanation.map((line) => `<div>${line}</div>`).join('')}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <a href="${job.url}" style="display:inline-block;background:#2196F3;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:bold;">View Job</a>
        <span style="font-size:12px;color:#999;">Source: ${sourceLabel(job.source)}</span>
      </div>
    </div>`;
}

export function generateEmailHTML(matches: MatchResult[]): string {
  const cards = matches.map((m) => jobCardHTML(m)).join('');

  const bodyContent =
    matches.length > 0
      ? cards
      : '<p style="color:#666;font-size:16px;text-align:center;padding:40px 0;">No jobs passed your filters today. Try broadening your skills or adjusting your Hard Nos.</p>';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <h1 style="font-size:22px;color:#1a1a1a;margin-bottom:20px;">Career Coach Daily Matches</h1>
    ${bodyContent}
    <p style="font-size:12px;color:#999;text-align:center;margin-top:24px;">
      Powered by Career Coach &bull; <a href="https://remoteok.com" style="color:#999;">RemoteOK</a> &bull; <a href="https://web3.career" style="color:#999;">Web3.Career</a>
    </p>
  </div>
</body>
</html>`;
}

export function generateSubject(matchCount: number): string {
  if (matchCount === 0) return 'No matches today';
  return `Your ${matchCount} matches for today`;
}

export async function sendMatchEmail(
  matches: MatchResult[],
  config: Config,
  isDryRun: boolean,
): Promise<boolean> {
  if (isDryRun) {
    log.info('Dry-run: skipping email send');
    return false;
  }

  const apiKey = process.env['RESEND_API_KEY'];
  if (!apiKey) {
    log.error('RESEND_API_KEY not set — cannot send email');
    return false;
  }

  const html = generateEmailHTML(matches);
  const subject = generateSubject(matches.length);

  log.info(`Sending email to ${config.user.email}: "${subject}"`);

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);

    await resend.emails.send({
      from: 'Career Coach <onboarding@resend.dev>',
      to: config.user.email,
      subject,
      html,
    });

    log.info('Email sent successfully');
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`Email send failed: ${message}`);
    return false;
  }
}
