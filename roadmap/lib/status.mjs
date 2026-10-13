export const SOAK_DURATION_MS = 86_400_000;
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : null;
const identityKeys = ['genesis', 'sourceCommit', 'coreSha256', 'apiBootId', 'validatorBootId', 'deploymentId'];

export function summarize(checkpoint, probes, now = Date.now()) {
  const unwrap = key => probes[key]?.ok ? object(probes[key].data) : null;
  const runtime = unwrap('runtime'), network = unwrap('network'), monitor = unwrap('monitor'), qa = unwrap('qa'), feed = unwrap('progress');
  const expected = checkpoint.runtime;
  const identityMatches = runtime ? identityKeys.every(key => typeof runtime[key] === 'string' && runtime[key] === expected[key]) : null;
  const freezeMatches = typeof qa?.freezeSha256 === 'string' ? qa.freezeSha256 === checkpoint.freezeSha256 : null;
  const progressFreezeMatches = typeof feed?.freezeSha256 === 'string' ? feed.freezeSha256 === checkpoint.freezeSha256 : null;
  const candidateMatches = item => !!object(item) && item.genesis === expected.genesis && !!object(item.candidate) && Object.entries(checkpoint.candidate).every(([key, value]) => item.candidate[key] === value);
  const runMatches = item => candidateMatches(item) && !!date(checkpoint.soakStartedAt) && !!date(item.startedAt) && Date.parse(item.startedAt) === Date.parse(checkpoint.soakStartedAt);
  const validReport = item => runMatches(item) && !!date(item.at) && Date.parse(item.startedAt) <= Date.parse(item.at) && Date.parse(item.at) <= now + 10_000;
  const progress = object(feed?.progress), result = object(feed?.result);
  const validProgress = validReport(progress), validResult = validReport(result);
  // A terminal result is authoritative over an older journey report. Reader
  // response timestamps are not journey observations or evidence of continuity.
  const report = validResult ? result : validProgress ? progress : null;
  const startedAt = date(report?.startedAt);
  const endsAt = startedAt ? new Date(Date.parse(startedAt) + SOAK_DURATION_MS).toISOString() : null;
  const reportAt = date(report?.at);
  const progressStale = qa?.state === 'starting' && (!reportAt || now - Date.parse(reportAt) > 480_000);
  const measuredJourneys = count(report?.completedJourneys);
  const completedJourneys = measuredJourneys !== null && measuredJourneys <= 288 ? measuredJourneys : null;
  let accepted = qa?.state === 'completed' && qa.soakAccepted === true && validResult && result.passed === true && Number.isSafeInteger(result.durationMs) && result.durationMs >= SOAK_DURATION_MS && Date.parse(result.at) - Date.parse(result.startedAt) >= SOAK_DURATION_MS && now - Date.parse(result.startedAt) >= SOAK_DURATION_MS && completedJourneys === 288 && identityMatches === true && freezeMatches === true && progressFreezeMatches === true;
  const interrupted = qa?.state === 'interrupted' || (validResult && result.passed === false);
  let soakState = 'unknown';
  if (qa) soakState = interrupted ? 'interrupted' : accepted ? 'passed' : qa.state === 'completed' ? 'verification-needed' : qa.state === 'starting' ? startedAt ? progressStale ? 'stale' : 'running' : 'starting' : qa.state === 'blocked' ? 'blocked' : 'waiting';
  if (qa?.state === 'starting' && (identityMatches !== true || freezeMatches !== true || progressFreezeMatches !== true)) soakState = 'unknown';
  if (soakState === 'running' && completedJourneys === null) soakState = 'unknown';
  const mismatchedReport = [progress, result].some(item => item && ('candidate' in item || 'genesis' in item) && (!candidateMatches(item) || date(item.startedAt) && (!date(checkpoint.soakStartedAt) || Date.parse(item.startedAt) !== Date.parse(checkpoint.soakStartedAt))));
  if (identityMatches === false || freezeMatches === false || progressFreezeMatches === false || mismatchedReport) { soakState = 'candidate-changed'; accepted = false; }
  const monitorAt = date(monitor?.lastProbeAt);
  const monitorFresh = !!monitorAt && now - Date.parse(monitorAt) < 90_000 && now >= Date.parse(monitorAt) - 10_000;
  return {
    schemaVersion: 1, fetchedAt: new Date(now).toISOString(), checkpoint,
    sources: Object.fromEntries(Object.entries(probes).map(([key, value]) => [key, { ok: value.ok === true && !!object(value.data), error: value.ok === true && object(value.data) ? null : 'Public status source unavailable', fetchedAt: date(value.fetchedAt) }])),
    network: { state: ['online', 'degraded'].includes(network?.state) ? network.state : 'unknown', genesisMatches: network?.genesisMatches === true, slot: count(network?.slot), finalizedSlot: monitorFresh ? count(monitor?.current?.finalizedSlot) : null, identityMatches, monitorState: monitorFresh ? monitor.current?.healthy === true && monitor.overdue !== true ? 'online' : 'degraded' : 'stale', monitorAt, lastProgressAt: date(monitor?.current?.lastProgressAt) },
    soak: { state: soakState, runnerState: typeof qa?.state === 'string' ? qa.state : 'unknown', freezeMatches, progressFreezeMatches, startedAt, endsAt, reportAt, progressStale, completedJourneys, totalJourneys: 288, observations: count(report?.observations), accepted: !!accepted, activationAt: date(qa?.soakStarted ? qa.at : null), issues: Array.isArray(qa?.issues) ? qa.issues.filter(x => typeof x === 'string').slice(0, 12).map(x => x.slice(0, 200)) : [], elapsedMs: startedAt ? Math.max(0, now - Date.parse(startedAt)) : null },
    // Release approval remains an explicit reviewed checkpoint; the soak alone
    // does not confer release, production token, bridge, or mainnet acceptance.
    releaseAccepted: checkpoint.releaseAccepted === true && accepted === true
  };
}
