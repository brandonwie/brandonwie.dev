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

exports.

---

## The Problem

The ETL pipeline fetching Amplitude event data ran at 01:00 KST (16:00 UTC). The
team questioned whether the export should fetch KST-based hours since users are
in Korea. This ambiguity risked fetching the wrong 24-hour window of events --
either missing data or duplicating it -- if the timezone assumption was wrong.
The Amplitude Export API documentation does not make the timezone behavior of
`start`/`end` parameters immediately obvious.

---

## Difficulties Encountered

- **Documentation ambiguity:** The Amplitude docs do not explicitly state
  whether `start`/`end` parameters follow the project timezone or are always
  UTC. Had to verify empirically by checking `server_upload_time` suffixes in
  exported events.
- **KST vs UTC confusion in team discussions:** Team members assumed "business
  day" meant KST calendar day, but the project was configured for UTC. Required
  checking Amplitude Console settings to confirm.
- **Hypothetical KST scenario complicated reasoning:** Had to work through what
  would happen if the project were KST-configured (requiring fetches across two
  UTC dates) to convince the team that the current UTC setup was simpler and
  correct.
- **No test environment for timezone changes:** Could not safely switch the
  Amplitude project timezone to KST to test behavior. All verification was done
  by reading existing data patterns.

---

## Critical Context

**Question:** "ETL runs at 01:00 KST (16:00 UTC) fetching yesterday's data.
Shouldn't we fetch KST-based hours since our users are in Korea?"

**Answer:** NO. Amplitude project `{PROJECT_ID}` uses **UTC timezone**, not KST.

## Key Facts

| Setting                          | Value                            | Impact                                            |
| -------------------------------- | -------------------------------- | ------------------------------------------------- |
| **Amplitude Project Timezone**   | UTC                              | All hour boundaries are UTC-based                 |
| **Export API `start` Parameter** | UTC hours                        | `start=20260126T00` = UTC hour 0 (not KST hour 0) |
| **Event Timestamps**             | UTC                              | `server_upload_time` field uses `.000Z` suffix    |
| **DAG Execution Time**           | 16:00 UTC = 01:00 KST (next day) | Processes previous UTC day                        |
| **Hours Fetched**                | 0-23 UTC                         | Complete business day in UTC                      |

## Hour Boundaries

### Export API Request Format

```text
start=YYYYMMDDTHH
end=YYYYMMDDTHH
```

**Timezone:** Always UTC, regardless of project timezone setting.

### Example

**Project Timezone:** UTC **Fetch Request:** `start=20260126T00&end=20260126T01`
**Result:** Events from UTC 2026-01-26 00:00:00 to 00:59:59

**If project were KST (hypothetical):** **Fetch Request:**
`start=20260126T00&end=20260126T01` **Result:** Would still fetch UTC hour 0,
causing 9-hour offset issues!

## ETL Pipeline Flow

### Daily ETL Schedule

```text
DAG: amplitude_etl_dag
Schedule: 0 16 * * * (16:00 UTC = 01:00 KST next day)
Processes: {{ yesterday_ds }} (UTC date)
```

### Example Timeline

| Time (UTC)       | Time (KST)       | Action                                              |
| ---------------- | ---------------- | --------------------------------------------------- |
| 2026-01-26 00:00 | 2026-01-26 09:00 | Events start occurring                              |
| 2026-01-26 15:00 | 2026-01-27 00:00 | Events continue (past KST midnight)                 |
| 2026-01-27 16:00 | 2026-01-28 01:00 | **DAG runs**, fetches 2026-01-26 UTC (all 24 hours) |

### What Gets Fetched

```text
Execution Date: 2026-01-26 (UTC)
Hours Fetched: 0-23 (UTC)

Hour 0:  2026-01-26 00:00-00:59 UTC = 2026-01-26 09:00-09:59 KST
Hour 1:  2026-01-26 01:00-01:59 UTC = 2026-01-26 10:00-10:59 KST
...
Hour 23: 2026-01-26 23:00-23:59 UTC = 2026-01-27 08:00-08:59 KST
```

**Result:** Covers full UTC day = 24 hours of events, which spans 2 KST calendar
dates but represents one complete business day in UTC.

## Validation: Check Your Project Timezone

### Amplitude Console

1. Login to Amplitude
2. Navigate to: **Settings → Projects → [Your Project] → General**
3. Find: **"Timezone"** setting
4. Verify: Should show **"UTC"** (not "Asia/Seoul")

### Via Export API Response

Check `server_upload_time` field in exported events:

```json
{
  "server_upload_time": "2026-01-26T00:00:00.000Z",
  ...
}
```

The `.000Z` suffix confirms UTC timezone.

## Common Misconceptions

### ❌ Myth: "Export API uses project timezone"

**Reality:** Export API `start`/`end` parameters are **always UTC**, regardless
of project timezone setting.

### ❌ Myth: "Need to convert hours to KST"

**Reality:** If project timezone is UTC, no conversion needed. Fetch hours 0-23
UTC.

### ❌ Myth: "Business day = KST calendar day"

**Reality:** Business day = UTC calendar day when project timezone is UTC. KST
is just a display preference.

## What If Project Were KST?

If Amplitude project were configured to KST timezone:

| UTC Hour               | KST Hour               | What to Fetch              |
| ---------------------- | ---------------------- | -------------------------- |
| 2026-01-25 15:00-23:59 | 2026-01-26 00:00-08:59 | Previous date, hours 15-23 |
| 2026-01-26 00:00-14:59 | 2026-01-26 09:00-23:59 | Current date, hours 0-14   |

**Total:** Would need to fetch from TWO UTC dates to get one KST business day.

**Our case:** Project is UTC, so simple 1:1 mapping (one UTC date = one business
day).

## Code Impact

### No Timezone Conversion Needed

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

### Validation Logic

```python
# amplitude_validate.py
def validate_data_completeness(execution_date: str, ...):
    # execution_date: "2026-01-26" (UTC)
    # Expects 24 hours (0-23 UTC)

    expected_hours = set(range(24))
    # Simple check - no timezone math needed
```

## Documentation References

- **Amplitude Export API Docs:**
  <https://amplitude.com/docs/apis/analytics/export>
- **Amplitude Timezone Settings:** Amplitude Console → Settings → Projects →
  General
- **Implementation:** `arch-etl/jobs/amplitude/amplitude_backfill.py`
- **ETL DAG:** `arch-airflow/dags/amplitude_etl_dag.py`

---

## When to Use

- Building or debugging ETL pipelines that export from Amplitude
- Verifying whether your Amplitude project uses UTC or a local timezone
- Onboarding new team members who question the timezone logic of existing
  Amplitude export code
- Setting up Airflow DAG schedules that process Amplitude data

## When NOT to Use

- Non-Amplitude analytics platforms: each platform (Mixpanel, GA4, etc.) has its
  own timezone handling. Do not assume this behavior transfers.
- If your Amplitude project is configured for a local timezone (e.g., KST): the
  "no conversion needed" conclusion only applies to UTC-configured projects. KST
  projects require cross-date fetching as described in the "What If Project Were
  KST" section.
- For real-time streaming: this knowledge covers the batch Export API, not
  Amplitude's real-time or Cohort APIs which may handle timestamps differently.

---
