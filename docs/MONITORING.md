# Monitoring and operator alerts

Verified on 2026-10-13 for the experimental TEST network only. The canonical genesis is `7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon`. TEST assets have no monetary value.

## Configured Railway alerts

The designated project is `356bcb0b-49c4-4bd3-bf10-bff7db8f33fe`, production environment `3367b373-2332-4702-8cce-c12b8f03949e`, service `network-release` (`d0a1de40-bd9c-47eb-a7fc-477f1c55b2d6`) and volume `080bf785-50e7-4dda-893b-4d613aa5e9a8` mounted at `/data`.

An account-specific notification override is saved for **solana-classic**, with **Email & In-App** delivery to the existing operator account. The contact address is intentionally excluded from public evidence. The selected events are Deployment Crashed, Deployment Oom Killed, Deployment Failed, Volume Alert Triggered/Resolved, and Monitor Triggered/Resolved. Other projects and account preferences were not changed.

| Signal | Saved condition | Verification |
| --- | --- | --- |
| Deployment failure/crash/OOM | Native events listed above | Project-specific account rule reopened after navigation |
| Memory | Above 12.8 GB; 80% of the current 16 GB decimal service cap | Saved monitor reopened; official CLI returned `MEMORY_USAGE_GB`, threshold `12.8`, condition `above`, and only the designated service ID |
| Volume capacity | Enabled 85% warning; 42,500 MB of the 50,000 MB quota | Volume-only change reviewed and applied; enabled threshold survived page reload |

The volume's pre-existing 80%, 95%, and 100% alerts remain enabled. No resource cap, domain, credential, service start command, or service deployment was changed by this monitoring configuration. Native volume alert metadata was the sole staged change applied.

Open [Railway observability](https://railway.com/project/356bcb0b-49c4-4bd3-bf10-bff7db8f33fe/observability?environmentId=3367b373-2332-4702-8cce-c12b8f03949e) to inspect the memory monitor, [volume settings](https://railway.com/project/356bcb0b-49c4-4bd3-bf10-bff7db8f33fe/volume/080bf785-50e7-4dda-893b-4d613aa5e9a8/settings?environmentId=3367b373-2332-4702-8cce-c12b8f03949e) for capacity warnings, and [account notification preferences](https://railway.com/account/notifications) for the saved project routing.

## Runtime health and response

The application checks upstream health, canonical genesis, required programs, and slot progress every 30 seconds. Its `/api/status` becomes degraded after 60 seconds without slot advance; `/healthz` returns 503 when unhealthy. Verify those behaviors against the final deployed candidate's source and negative-control evidence. Railway's deployment healthcheck alone does not establish continuous uptime probing.

An independent, always-on Railway service **operator-monitor** (`ed491e1f-e40f-4050-bebe-113792bb4ae8`) polls the public API `/healthz`, `/api/status`, `getGenesisHash`, and finalized `getSlot` every 30 seconds. Requests time out after eight seconds and JSON responses are bounded to 32 KiB. Two consecutive upstream failures cause an unhealthy signal. Wrong genesis, slot regression, or no finalized slot progress for 60 seconds cause an immediate unhealthy signal. A successful advancing canonical probe clears it.

Read its sanitized [monitor status](https://operator-monitor-production.up.railway.app/api/monitor) for the most recent finalized slot, last progress time, probe result, boot/deployment identity, and signal state. Its process has an exact **500,000,000-byte** memory cap (0.5 decimal GB), 0.5 vCPU, one replica, no volume, always-on hosting, and an `ALWAYS` restart policy. Fractional GiB-to-decimal conversions produced a fractional-byte value in Railway's config; the exact decimal cap avoids that parsing problem and remains above the observed 310 MB signal. It has no wallet keys, network mutation methods, email credentials, or user-selected target URL. Only its designated service/project may start the production monitor.

Railway's HTTP 5xx graph exposes no Add Monitor action. Consequently its native alert uses a clearly named **derived network health signal (monitor memory)**, scoped solely to operator-monitor. When the independent probes are unhealthy, this process reserves and touches a fixed 192 MiB buffer. The native memory threshold is Above **0.18 GB**, causing Monitor Triggered/Resolved events that use the existing project-specific account email rule. Recovery releases the buffer and runs explicit garbage collection. This is a bounded health signal, not resource pressure, an OOM test, or a change to the validator's memory. The scoped HTTP 5xx chart is diagnostic only. `/signal` also reports 200/503 and is sampled through the public ingress.

The controlled fixture binds only to loopback inside the monitor container. Initial test mode verifies an actual HTTP upstream failure, recovery, a real elapsed 60-second slot stall, and resumed slot progress. Its unhealthy signal is held for 330 seconds to span provider evaluation intervals. After evidence capture, `SC_MONITOR_FIXTURE=0` disables it and `/alert-test` returns 404. No public fixture RPC or state-changing test route exists. The canonical network keeps being checked during the fixture.

An operator should inspect `/api/status` and `/api/runtime` at the designated API origin `https://network-release-production.up.railway.app`. A wrong genesis is an identity failure: stop mutation admission and investigate; never substitute a public Solana RPC or initialize a replacement ledger. For memory or volume alarms, inspect the designated service metrics and logs before considering cap changes or cleanup. Preserve operator material, SQLite, immutable assets, and the TEST ledger; follow the backup/recovery runbooks for any disruptive action.

## Remaining acceptance evidence

Configuration and operator mailbox receipt are verified. The founder directly confirmed receipt of the recovery-drill failure email and the monitor trigger/recovery emails; see evidence/operator-alert-receipt.json. Provider dispatch records remain unavailable. The official CLI exposes an authenticated-user `notificationDeliveries` query with EMAIL/INAPP/WEBHOOK channels and SENT/PENDING/FAILED status. A read-only query restricted to this project, workspace, and EMAIL channel returned `Not Authorized` with the current CLI session. No recipient addresses or notification bodies were requested. No native test-notification button was found in the inspected account/rule UI. The loopback fixture generated a real native monitor event while the canonical network remained healthy.

The hosted controlled fixture passed actual upstream failure/recovery and a real elapsed 60-second finalized-slot stall/recovery while canonical probes remained healthy. Railway sampled the derived signal above its 0.18 GB threshold and created native alert `5b01f273-65c7-42f7-9604-32d07d3fc28a` at `2026-10-13T07:44:28.707Z`. That was **376,578 ms after** the controlled upstream failure; it arrived after the probe itself had already recovered. Its native recovery was recorded at `2026-10-13T07:50:28.704Z`. Thirty-second probe cadence does not establish a thirty-second notification deadline. Provider evaluation/aggregation and dispatch add latency; no notification latency bound is claimed.

The final steady deployment is `22f46035-b3fc-4056-aa06-871b6d14869d`: fixture disabled, test endpoint 404, canonical finalized-slot progress verified, and health-signal memory released. See [hosted fixture evidence](../evidence/monitoring-hosted-fixture-long.json), [native lifecycle evidence](../evidence/monitoring-native-lifecycle.json), and [steady-state evidence](../evidence/monitoring-steady-state.json). Typecheck, scoped lint, the final-source local HTTP fixture test, and rejection of the main-service identity passed. Source checksums match the isolated two-file deployment upload.

The validator pressure monitor had no alert records when first read. Its pressure trigger/recovery path has not been forced. The independent health monitor now supplies continuously hosted 30-second endpoint probing. Operator mailbox receipt is now confirmed. No provider dispatch timestamp or guaranteed notification latency is claimed. Railway-hosted probes and Railway-native alerts share a provider; a provider-wide outage may affect both.

Sanitized configuration and precise limits are recorded in [monitoring-config.json](../evidence/monitoring-config.json). Its top-level `passed` now records the configured routing, actual native lifecycle and direct operator receipt confirmation.
