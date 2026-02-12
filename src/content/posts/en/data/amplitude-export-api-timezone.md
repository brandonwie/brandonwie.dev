---
title: Amplitude Export API Timezone Behavior
description: How Amplitude Export API handles timezones and hour boundaries for event data
date: 2026-01-27T00:00:00.000Z
updated: 2026-01-27T00:00:00.000Z
tags:
  - data
  - amplitude
  - timezone
  - api
category: data
draft: false
lang: en
references:
  - url: "https://amplitude.com/docs/apis/analytics/export"
    title: export
    type: verified
  - url: "https://amplitude.com/docs/admin/account-management/manage-orgs-projects"
    title: Amplitude Manage Organizations and Projects (Timezone Settings)
    type: official
---

Our ETL pipeline fetched Amplitude event data every day at 01:00 KST. A teammate asked, "Shouldn't we be fetching KST-based hours since our users are in Korea?" It was a reasonable question -- and getting the answer wrong meant either missing an entire day of events or duplicating them.

## Why This Matters

Timezone mismatches in data pipelines are silent killers. The pipeline runs, the data lands in your warehouse, and everything looks fine -- until an analyst notices that event counts for a "business day" are off by 9 hours. By the time someone catches it, weeks of reports may already be wrong.

The Amplitude Export API documentation does not make it immediately obvious how the `start` and `end` parameters handle timezones. I had to verify empirically by checking `server_upload_time` suffixes in exported events.

## The Confusion

The team had a mental model that went something like: "Our users are in Korea, so a 'business day' means a KST calendar day." But the Amplitude project was configured for **UTC**, not KST. This disconnect turned into a multi-day debate.

Here are the key facts I confirmed:

| Setting                          | Value                            | Impact                                            |
| -------------------------------- | -------------------------------- | ------------------------------------------------- |
| **Amplitude Project Timezone**   | UTC                              | All hour boundaries are UTC-based                 |
| **Export API `start` Parameter** | UTC hours                        | `start=20260126T00` = UTC hour 0 (not KST hour 0) |
| **Event Timestamps**             | UTC                              | `server_upload_time` field uses `.000Z` suffix    |
| **DAG Execution Time**           | 16:00 UTC = 01:00 KST (next day) | Processes previous UTC day                        |
| **Hours Fetched**                | 0-23 UTC                         | Complete business day in UTC                      |

## The Difficulties

Four things made this harder than it needed to be.

**Documentation ambiguity.** The Amplitude docs do not explicitly state whether `start`/`end` parameters follow the project timezone or are always UTC. I had to verify empirically by checking `server_upload_time` suffixes in exported events.

**KST vs UTC confusion in team discussions.** Team members assumed "business day" meant KST calendar day, but the project was configured for UTC. It took checking Amplitude Console settings to confirm.

**Hypothetical KST scenario complicated reasoning.** I had to walk the team through what would happen if the project were KST-configured -- requiring fetches across two UTC dates -- to convince them the current UTC setup was simpler and correct.

**No test environment for timezone changes.** I could not safely switch the Amplitude project timezone to KST to test behavior. All verification came from reading existing data patterns.

## How the Export API Actually Works

The request format is straightforward:

```text
start=YYYYMMDDTHH
end=YYYYMMDDTHH
```

The timezone is **always UTC**, regardless of your project timezone setting.

So when our DAG runs at 16:00 UTC and requests `start=20260126T00&end=20260126T01`, it gets events from UTC 2026-01-26 00:00:00 to 00:59:59. If the project were configured for KST, the same request would still fetch UTC hour 0 -- causing a 9-hour offset that nobody would notice until the numbers looked wrong in dashboards.

## ETL Pipeline Flow

Here is how our daily schedule works:

```text
DAG: amplitude_etl_dag
Schedule: 0 16 * * * (16:00 UTC = 01:00 KST next day)
Processes: {{ yesterday_ds }} (UTC date)
```

And here is a concrete timeline showing what happens:

| Time (UTC)       | Time (KST)       | Action                                              |
| ---------------- | ---------------- | --------------------------------------------------- |
| 2026-01-26 00:00 | 2026-01-26 09:00 | Events start occurring                              |
| 2026-01-26 15:00 | 2026-01-27 00:00 | Events continue (past KST midnight)                 |
| 2026-01-27 16:00 | 2026-01-28 01:00 | **DAG runs**, fetches 2026-01-26 UTC (all 24 hours) |

What gets fetched in practice:

```text
Execution Date: 2026-01-26 (UTC)
Hours Fetched: 0-23 (UTC)

Hour 0:  2026-01-26 00:00-00:59 UTC = 2026-01-26 09:00-09:59 KST
Hour 1:  2026-01-26 01:00-01:59 UTC = 2026-01-26 10:00-10:59 KST
...
Hour 23: 2026-01-26 23:00-23:59 UTC = 2026-01-27 08:00-08:59 KST
```

This covers a full UTC day -- 24 hours of events that span 2 KST calendar dates but represent one complete business day in UTC.

## Validation: Check Your Project Timezone

Before trusting any of this, verify your own project settings.

In the **Amplitude Console**:

1. Login to Amplitude
2. Navigate to: **Settings -> Projects -> [Your Project] -> General**
3. Find: **"Timezone"** setting
4. Verify: Should show **"UTC"** (not "Asia/Seoul")

You can also verify via the **Export API response** by checking the `server_upload_time` field:

```json
{
  "server_upload_time": "2026-01-26T00:00:00.000Z",
  ...
}
```

The `.000Z` suffix confirms UTC timezone.

## Common Misconceptions

**"Export API uses project timezone."** It does not. The `start`/`end` parameters are always UTC, regardless of project timezone setting.

**"We need to convert hours to KST."** If your project timezone is UTC, no conversion is needed. Fetch hours 0-23 UTC.

**"Business day = KST calendar day."** When the project timezone is UTC, a business day is a UTC calendar day. KST is just a display preference.

## What If Your Project Were KST

If Amplitude project were configured to KST timezone, the math gets complicated:

| UTC Hour               | KST Hour               | What to Fetch              |
| ---------------------- | ---------------------- | -------------------------- |
| 2026-01-25 15:00-23:59 | 2026-01-26 00:00-08:59 | Previous date, hours 15-23 |
| 2026-01-26 00:00-14:59 | 2026-01-26 09:00-23:59 | Current date, hours 0-14   |

You would need to fetch from **two UTC dates** to get one KST business day. Our project is UTC, so it is a simple 1:1 mapping -- one UTC date equals one business day.

## Code Impact

Because the project is UTC, the fetch code needs no timezone conversion:

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

## Why This Works

The entire pipeline stays simple because we align everything to UTC. The Amplitude project is UTC. The Export API parameters are UTC. The Airflow schedule runs at a UTC hour. There is no conversion layer, no cross-date fetch logic, and no opportunity for off-by-one timezone bugs.

## Practical Takeaway

Use this approach when building or debugging ETL pipelines that export from Amplitude, or when onboarding new team members who question the timezone logic of existing export code.

Do **not** assume this behavior transfers to other analytics platforms. Mixpanel, GA4, and others each handle timezones differently. Also, if your Amplitude project is configured for a local timezone (e.g., KST), the "no conversion needed" conclusion does not apply -- you will need cross-date fetching as described in the KST section above.

This knowledge covers the batch Export API only. Amplitude's real-time and Cohort APIs may handle timestamps differently.
