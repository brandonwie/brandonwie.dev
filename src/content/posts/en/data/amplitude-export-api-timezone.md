---
title: Amplitude Export API Timezone Behavior
description: How Amplitude Export API handles timezones and hour boundaries for event data
date: 2026-01-27T00:00:00.000Z
updated: '2026-07-13'
tags:
  - data
  - amplitude
  - timezone
  - api
category: data
draft: false
lang: en
expanded: true
references:
  - url: 'https://amplitude.com/docs/apis/analytics/export'
    title: export
    type: verified
  - url: 'https://amplitude.com/docs/admin/account-management/manage-orgs-projects'
    title: Amplitude Manage Organizations and Projects (Timezone Settings)
    type: official
source_content_hash: 3da00d1b637a8ddf27288d93eed9876f139a151779a3e6ed8ddfa933fae953ba
---

I spent an entire afternoon arguing with my team about whether our Amplitude ETL pipeline was fetching the wrong day's data. The pipeline ran at 01:00 KST, our users were in Korea, and someone reasonably asked: "Shouldn't we fetch KST-based hours?" It felt like a valid question. It turned out the answer was hiding in the Amplitude project settings, not the API docs.

---

## The confusion

Our ETL pipeline fetched Amplitude event data daily at 01:00 KST (16:00 UTC). The team questioned whether the export should fetch KST-based hours since users are in Korea. This ambiguity risked fetching the wrong 24-hour window of events, either missing data or duplicating it, if the timezone assumption was wrong.

The Amplitude Export API documentation does not make the timezone behavior of `start`/`end` parameters immediately obvious. That gap led to a full team discussion about whether we had been pulling the wrong data all along.

---

## Why this was harder than it sounds

Four things made this investigation slow.

The documentation is ambiguous. The Amplitude docs do not explicitly state whether `start`/`end` parameters follow the project timezone or are always UTC. I had to verify empirically by checking `server_upload_time` suffixes in exported events.

Team discussions mixed up KST and UTC. Team members assumed "business day" meant KST calendar day, but the project was configured for UTC. Confirming that required navigating into the Amplitude Console settings.

The hypothetical KST scenario complicated the reasoning. I had to work through what would happen if the project were KST-configured (requiring fetches across two UTC dates) to convince the team that the current UTC setup was simpler and correct.

There was no test environment for timezone changes. I had no way to safely switch the Amplitude project timezone to KST to test behavior, so all verification came from reading existing data patterns.

---

## The answer: it depends on your project timezone

The question was: "ETL runs at 01:00 KST (16:00 UTC) fetching yesterday's data. Shouldn't we fetch KST-based hours since our users are in Korea?"

The answer: no. Our Amplitude project used UTC timezone, not KST. The Export API always interprets `start`/`end` parameters in UTC. The project timezone setting determines how Amplitude displays data in its dashboard, but the API does not convert for you.

Here is what I confirmed:

| Setting                          | Value                            | Impact                                            |
| -------------------------------- | -------------------------------- | ------------------------------------------------- |
| **Amplitude Project Timezone**   | UTC                              | All hour boundaries are UTC-based                 |
| **Export API `start` Parameter** | UTC hours                        | `start=20260126T00` = UTC hour 0 (not KST hour 0) |
| **Event Timestamps**             | UTC                              | `server_upload_time` field uses `.000Z` suffix    |
| **DAG Execution Time**           | 16:00 UTC = 01:00 KST (next day) | Processes previous UTC day                        |
| **Hours Fetched**                | 0-23 UTC                         | Complete business day in UTC                      |

---

## How the Export API request works

The request format is straightforward:

```text
start=YYYYMMDDTHH
end=YYYYMMDDTHH
```

The timezone is always UTC, regardless of the project timezone setting.

Both bounds are inclusive, and that detail is easy to miss. `start` and `end` each name an hour that gets included, so `start=20260126T00&end=20260126T01` returns two hours of data, hour 0 and hour 1, not the single 00:00-00:59 window it looks like. To fetch exactly one hour, set `start` and `end` to the same value: `start=20260126T00&end=20260126T00`.

Both of our production fetchers carried this double-fetch defect (`packages/etl/jobs/amplitude/amplitude_common.py:94-95` and `amplitude_backfill.py:112-113`), quietly pulling two hours every time they meant to pull one.

The timezone still applies regardless of the project setting. If the project were configured for KST (hypothetical), a request naming UTC hour 0 would still fetch UTC hour 0. That 9-hour offset between KST and UTC would mean you are not getting what you think you are getting.

---

## Tracing the full ETL pipeline

The full timeline is what makes the logic click.

```text
DAG: amplitude_etl_dag
Schedule: 0 16 * * * (16:00 UTC = 01:00 KST next day)
Processes: {{ yesterday_ds }} (UTC date)
```

Here is a concrete example:

| Time (UTC)       | Time (KST)       | Action                                              |
| ---------------- | ---------------- | --------------------------------------------------- |
| 2026-01-26 00:00 | 2026-01-26 09:00 | Events start occurring                              |
| 2026-01-26 15:00 | 2026-01-27 00:00 | Events continue (past KST midnight)                 |
| 2026-01-27 16:00 | 2026-01-28 01:00 | **DAG runs**, fetches 2026-01-26 UTC (all 24 hours) |

The fetch covers hours 0 through 23 for the UTC date 2026-01-26:

```text
Execution Date: 2026-01-26 (UTC)
Hours Fetched: 0-23 (UTC)

Hour 0:  2026-01-26 00:00-00:59 UTC = 2026-01-26 09:00-09:59 KST
Hour 1:  2026-01-26 01:00-01:59 UTC = 2026-01-26 10:00-10:59 KST
...
Hour 23: 2026-01-26 23:00-23:59 UTC = 2026-01-27 08:00-08:59 KST
```

The result covers a full UTC day: 24 hours of events. That spans two KST calendar dates, but represents one complete business day in UTC. No data is missing and none is duplicated.

---

## Validating your own setup

Before trusting any of this for your project, verify what timezone your Amplitude project uses.

### Through the Amplitude console

1. Login to Amplitude
2. Navigate to: **Settings > Projects > [Your Project] > General**
3. Find the **"Timezone"** setting
4. Verify it shows **"UTC"** (not "Asia/Seoul" or another local timezone)

### Through the API response

Check the `server_upload_time` field in any exported event:

```json
{
  "server_upload_time": "2026-01-26T00:00:00.000Z",
  ...
}
```

The `.000Z` suffix confirms UTC timezone.

---

## Common misconceptions

"Export API uses project timezone." It does not. The `start`/`end` parameters are always UTC, regardless of the project timezone setting.

"We need to convert hours to KST." If the project timezone is UTC, no conversion is needed. Fetch hours 0-23 UTC and you get a complete day.

"Business day equals KST calendar day." Business day equals a UTC calendar day when the project timezone is UTC. KST is a display preference in the Amplitude dashboard, not an API contract.

"Replaying an old export window recovers late events." It does not. Export windows filter on `server_upload_time`, and an event that uploads late gets a later upload time, so a future window delivers it, never the original one. Re-fetching the original window can only repair missing or partial export *delivery*; it cannot pull in late client uploads. That reframes reconciliation: treat replay as delivery repair, and handle late uploads on the forward ingestion path. Because late events land in older `event_time` partitions, downstream aggregation has to fan out over every affected partition rather than only the day it is reprocessing.

---

## What if the project were KST?

If the Amplitude project were configured for KST timezone, the math changes:

| UTC Hour               | KST Hour               | What to Fetch              |
| ---------------------- | ---------------------- | -------------------------- |
| 2026-01-25 15:00-23:59 | 2026-01-26 00:00-08:59 | Previous date, hours 15-23 |
| 2026-01-26 00:00-14:59 | 2026-01-26 09:00-23:59 | Current date, hours 0-14   |

You would need to fetch from two UTC dates to assemble one KST business day. Our UTC-configured project avoids this entirely. One UTC date equals one business day, a clean 1:1 mapping.

---

## Code: no timezone conversion needed

Because the project is UTC, the fetch code stays clean:

```python
# amplitude_backfill.py
def fetch_hour_from_amplitude(date: str, hour: int, ...):
    # date: "2026-01-26" (UTC)
    # hour: 0-23 (UTC)

    date_compact = date.replace("-", "")  # "20260126"
    start_param = f"{date_compact}T{hour:02d}"  # "20260126T00"
    # Both bounds are inclusive, so end must equal start to fetch ONE hour.
    # The original `(hour + 1) % 24` fetched two hours, a silent double-fetch.
    end_param = f"{date_compact}T{hour:02d}"  # "20260126T00"

    # No timezone conversion - parameters are UTC as-is
    url = f"{AMPLITUDE_EXPORT_API_URL}?start={start_param}&end={end_param}"
```

The validation logic is equally simple:

```python
# amplitude_validate.py
def validate_data_completeness(execution_date: str, ...):
    # execution_date: "2026-01-26" (UTC)
    # Expects 24 hours (0-23 UTC)

    expected_hours = set(range(24))
    # Simple check - no timezone math needed
```

There are no conversion functions or offset calculations, and no edge-case handling for month boundaries. The UTC project timezone keeps the code simple.

---

## Practical limits

A few operational constraints shape how you schedule and size these fetches.

Exported data is not queryable the instant an hour closes. It becomes available roughly two hours later. Schedule fetches with that delay built in, or an early run pulls an incomplete hour.

Requests have a size ceiling. Anything over 4GB returns a 400, and long time ranges can time out with a 504. The fix is to chunk by hour, but there is no sub-hour granularity to split further, so a single hour that is itself oversized cannot be divided on the API. That case has to route to Amplitude's S3 or manual backfill lane instead.

Rate limits are not documented on the export page. Before building retry-heavy reconciliation on top of the API, confirm the limits with Amplitude support rather than assuming there is headroom.

---

## Takeaway

The Export API timezone behavior is not documented clearly, but the answer is predictable once you know where to look. Check your Amplitude project timezone first. It determines everything. If the project is UTC, your ETL pipeline can fetch hours 0-23 for any UTC date without conversion. If the project is a local timezone like KST, you need cross-date fetching logic that is more fragile and harder to debug.

This applies specifically to Amplitude's batch Export API. Other analytics platforms (Mixpanel, GA4) each handle timezones differently. And if you are using Amplitude's real-time or Cohort APIs, timestamp handling may differ from the Export API as well.

The lesson that stuck with me: when the team asks "shouldn't we convert to local time?", the answer often starts with "what timezone is the source system configured to use?"

---

## References

- **Amplitude Export API Docs:** <https://amplitude.com/docs/apis/analytics/export>
- **Amplitude Timezone Settings:** Amplitude Console > Settings > Projects > General
- **Implementation:** `arch-etl/jobs/amplitude/amplitude_backfill.py`
- **ETL DAG:** `arch-airflow/dags/amplitude_etl_dag.py`
