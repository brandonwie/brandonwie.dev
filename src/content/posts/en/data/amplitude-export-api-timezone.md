---
title: Amplitude Export API Timezone Behavior
description: How Amplitude Export API handles timezones and hour boundaries for event data
date: 2026-01-27T00:00:00.000Z
updated: '2026-03-22'
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
source_content_hash: eb50c2b64160c8af77b018c3e6ab37d96b70a03cb8dd615bfd57a5212cc9b2ea
---

I spent an entire afternoon arguing with my team about whether our Amplitude ETL pipeline was fetching the wrong day's data. The pipeline ran at 01:00 KST, our users were in Korea, and someone reasonably asked: "Shouldn't we fetch KST-based hours?" It felt like a valid question. It turned out the answer was hiding in the Amplitude project settings, not the API docs.

---

## The Confusion

Our ETL pipeline fetched Amplitude event data daily at 01:00 KST (16:00 UTC). The team questioned whether the export should fetch KST-based hours since users are in Korea. This ambiguity risked fetching the wrong 24-hour window of events -- either missing data or duplicating it -- if the timezone assumption was wrong.

The Amplitude Export API documentation does not make the timezone behavior of `start`/`end` parameters immediately obvious. That gap led to a full team discussion about whether we had been pulling the wrong data all along.

---

## Why This Was Harder Than It Sounds

Four things made this investigation slow.

**Documentation ambiguity.** The Amplitude docs do not explicitly state whether `start`/`end` parameters follow the project timezone or are always UTC. I had to verify empirically by checking `server_upload_time` suffixes in exported events.

**KST vs UTC confusion in team discussions.** Team members assumed "business day" meant KST calendar day, but the project was configured for UTC. Confirming that required navigating into the Amplitude Console settings.

**Hypothetical KST scenario complicated reasoning.** I had to work through what would happen if the project were KST-configured (requiring fetches across two UTC dates) to convince the team that the current UTC setup was simpler and correct.

**No test environment for timezone changes.** There was no way to safely switch the Amplitude project timezone to KST to test behavior. All verification was done by reading existing data patterns.

---

## The Answer: It Depends on Your Project Timezone

The question was: "ETL runs at 01:00 KST (16:00 UTC) fetching yesterday's data. Shouldn't we fetch KST-based hours since our users are in Korea?"

The answer: **No.** Our Amplitude project used UTC timezone, not KST. The Export API always interprets `start`/`end` parameters in UTC. The project timezone setting determines how Amplitude displays data in its dashboard, but the API does not convert for you.

Here is what I confirmed:

| Setting                          | Value                            | Impact                                            |
| -------------------------------- | -------------------------------- | ------------------------------------------------- |
| **Amplitude Project Timezone**   | UTC                              | All hour boundaries are UTC-based                 |
| **Export API `start` Parameter** | UTC hours                        | `start=20260126T00` = UTC hour 0 (not KST hour 0) |
| **Event Timestamps**             | UTC                              | `server_upload_time` field uses `.000Z` suffix    |
| **DAG Execution Time**           | 16:00 UTC = 01:00 KST (next day) | Processes previous UTC day                        |
| **Hours Fetched**                | 0-23 UTC                         | Complete business day in UTC                      |

---

## How the Export API Request Works

The request format is straightforward:

```text
start=YYYYMMDDTHH
end=YYYYMMDDTHH
```

The timezone is always UTC, regardless of the project timezone setting.

For example, with a UTC-configured project, the request `start=20260126T00&end=20260126T01` returns events from UTC 2026-01-26 00:00:00 to 00:59:59. No surprises.

But if the project were configured for KST (hypothetical), that same request would still fetch UTC hour 0. That 9-hour offset between KST and UTC would mean you are not getting what you think you are getting.

---

## Tracing the Full ETL Pipeline

Understanding the timeline end-to-end made the logic click.

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

The result covers a full UTC day -- 24 hours of events. That spans two KST calendar dates, but represents one complete business day in UTC. No data missing, no data duplicated.

---

## Validating Your Own Setup

Before trusting any of this for your project, verify what timezone your Amplitude project uses.

### Through the Amplitude Console

1. Login to Amplitude
2. Navigate to: **Settings > Projects > [Your Project] > General**
3. Find the **"Timezone"** setting
4. Verify it shows **"UTC"** (not "Asia/Seoul" or another local timezone)

### Through the API Response

Check the `server_upload_time` field in any exported event:

```json
{
  "server_upload_time": "2026-01-26T00:00:00.000Z",
  ...
}
```

The `.000Z` suffix confirms UTC timezone.

---

## Busting Three Common Misconceptions

**"Export API uses project timezone."** It does not. The `start`/`end` parameters are always UTC, regardless of the project timezone setting.

**"We need to convert hours to KST."** If the project timezone is UTC, no conversion is needed. Fetch hours 0-23 UTC and you get a complete day.

**"Business day equals KST calendar day."** Business day equals a UTC calendar day when the project timezone is UTC. KST is a display preference in the Amplitude dashboard, not an API contract.

---

## What If the Project Were KST?

If the Amplitude project were configured for KST timezone, the math changes significantly:

| UTC Hour               | KST Hour               | What to Fetch              |
| ---------------------- | ---------------------- | -------------------------- |
| 2026-01-25 15:00-23:59 | 2026-01-26 00:00-08:59 | Previous date, hours 15-23 |
| 2026-01-26 00:00-14:59 | 2026-01-26 09:00-23:59 | Current date, hours 0-14   |

You would need to fetch from **two** UTC dates to assemble one KST business day. Our UTC-configured project avoids this entirely -- one UTC date equals one business day, a clean 1:1 mapping.

---

## Code: No Timezone Conversion Needed

Because the project is UTC, the fetch code stays clean:

```python
# amplitude_backfill.py
def fetch_hour_from_amplitude(date: str, hour: int, ...):
    # date: "2026-01-26" (UTC)
    # hour: 0-23 (UTC)

    date_compact = date.replace("-", "")  # "20260126"
    start_param = f"{date_compact}T{hour:02d}"  # "20260126T00"
    end_param = f"{date_compact}T{(hour + 1) % 24:02d}"  # "20260126T01"

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

No conversion functions, no offset calculations, no edge-case handling for month boundaries. The UTC project timezone keeps everything straightforward.

---

## Takeaway

The Export API timezone behavior is not documented clearly, but the answer is predictable once you know where to look. Check your Amplitude project timezone first -- it determines everything. If the project is UTC, your ETL pipeline can fetch hours 0-23 for any UTC date without conversion. If the project is a local timezone like KST, you need cross-date fetching logic that is more fragile and harder to debug.

This applies specifically to Amplitude's batch Export API. Other analytics platforms (Mixpanel, GA4) each handle timezones differently. And if you are using Amplitude's real-time or Cohort APIs, timestamp handling may differ from the Export API as well.

The lesson that stuck with me: when the team asks "shouldn't we convert to local time?", the answer often starts with "what timezone is the source system configured to use?"

---

## References

- **Amplitude Export API Docs:** <https://amplitude.com/docs/apis/analytics/export>
- **Amplitude Timezone Settings:** Amplitude Console > Settings > Projects > General
