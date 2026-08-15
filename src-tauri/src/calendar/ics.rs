use crate::domain::event::{EventRecord, UpsertEventRequest};

pub fn export_ics(events: &[EventRecord]) -> String {
    let mut output = String::from(
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Memoji//Offline Calendar//KO\r\nCALSCALE:GREGORIAN\r\n",
    );
    for event in events {
        output.push_str("BEGIN:VEVENT\r\n");
        output.push_str(&format!("UID:{}\r\n", escape(&event.id)));
        output.push_str(&format!("SUMMARY:{}\r\n", escape(&event.title)));
        if event.all_day {
            output.push_str(&format!(
                "DTSTART;VALUE=DATE:{}\r\n",
                compact_date(&event.start_at)
            ));
            if let Some(end_at) = &event.end_at {
                output.push_str(&format!("DTEND;VALUE=DATE:{}\r\n", compact_date(end_at)));
            }
        } else {
            output.push_str(&format!(
                "DTSTART;TZID={}:{}\r\n",
                escape(&event.timezone),
                compact_datetime(&event.start_at)
            ));
            if let Some(end_at) = &event.end_at {
                output.push_str(&format!(
                    "DTEND;TZID={}:{}\r\n",
                    escape(&event.timezone),
                    compact_datetime(end_at)
                ));
            }
        }
        if !event.notes.is_empty() {
            output.push_str(&format!("DESCRIPTION:{}\r\n", escape(&event.notes)));
        }
        if let Some(page_id) = &event.page_id {
            output.push_str(&format!("X-MEMOJI-PAGE-ID:{}\r\n", escape(page_id)));
        }
        output.push_str("END:VEVENT\r\n");
    }
    output.push_str("END:VCALENDAR\r\n");
    output
}

pub fn import_ics(source: &str) -> Vec<UpsertEventRequest> {
    let unfolded = source.replace("\r\n ", "").replace("\n ", "");
    unfolded
        .split("BEGIN:VEVENT")
        .skip(1)
        .filter_map(|block| parse_event(block.split("END:VEVENT").next()?))
        .collect()
}

fn parse_event(block: &str) -> Option<UpsertEventRequest> {
    let mut id = None;
    let mut title = None;
    let mut start_at = None;
    let mut end_at = None;
    let mut all_day = false;
    let mut timezone = "local".to_string();
    let mut page_id = None;
    let mut notes = String::new();
    for raw_line in block.lines() {
        let line = raw_line.trim_end_matches('\r').trim();
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        if key == "UID" {
            id = Some(unescape(value));
        } else if key == "SUMMARY" {
            title = Some(unescape(value));
        } else if key.starts_with("DTSTART") {
            all_day = key.contains("VALUE=DATE");
            if let Some(tzid) = key.split("TZID=").nth(1) {
                timezone = unescape(tzid.split(';').next().unwrap_or(tzid));
            }
            start_at = Some(expand_temporal(value, all_day));
        } else if key.starts_with("DTEND") {
            end_at = Some(expand_temporal(value, key.contains("VALUE=DATE")));
        } else if key == "DESCRIPTION" {
            notes = unescape(value);
        } else if key == "X-MEMOJI-PAGE-ID" {
            page_id = Some(unescape(value));
        }
    }
    Some(UpsertEventRequest {
        id: id?,
        title: title?,
        start_at: start_at?,
        end_at,
        all_day,
        timezone,
        page_id,
        notes,
    })
}

fn compact_date(value: &str) -> String {
    value.chars().filter(char::is_ascii_digit).take(8).collect()
}

fn compact_datetime(value: &str) -> String {
    let digits: String = value.chars().filter(char::is_ascii_digit).collect();
    if digits.len() >= 14 {
        format!("{}T{}", &digits[..8], &digits[8..14])
    } else {
        compact_date(value)
    }
}

fn expand_temporal(value: &str, all_day: bool) -> String {
    if value.len() < 8 {
        return value.to_string();
    }
    let date = format!("{}-{}-{}", &value[..4], &value[4..6], &value[6..8]);
    if all_day || value.len() < 15 {
        date
    } else {
        format!(
            "{date}T{}:{}:{}",
            &value[9..11],
            &value[11..13],
            &value[13..15]
        )
    }
}

fn escape(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace(';', "\\;")
        .replace(',', "\\,")
        .replace('\n', "\\n")
}

fn unescape(value: &str) -> String {
    let mut output = String::new();
    let mut chars = value.chars();
    while let Some(character) = chars.next() {
        if character == '\\' {
            match chars.next() {
                Some('n' | 'N') => output.push('\n'),
                Some(next) => output.push(next),
                None => output.push('\\'),
            }
        } else {
            output.push(character);
        }
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_all_day_timezone_notes_and_linked_page() {
        let records = vec![
            EventRecord {
                id: "event-all-day".to_string(),
                title: "GA 휴일".to_string(),
                start_at: "2026-08-16".to_string(),
                end_at: Some("2026-08-17".to_string()),
                all_day: true,
                timezone: "Asia/Seoul".to_string(),
                page_id: Some("page-1".to_string()),
                page_title: Some("출시".to_string()),
                notes: "첫 줄\n둘째 줄".to_string(),
                created_at: "2026-08-16T00:00:00Z".to_string(),
                updated_at: "2026-08-16T00:00:00Z".to_string(),
            },
            EventRecord {
                id: "event-timed".to_string(),
                title: "릴리스 회의".to_string(),
                start_at: "2026-08-16T10:30:00".to_string(),
                end_at: Some("2026-08-16T11:00:00".to_string()),
                all_day: false,
                timezone: "Asia/Seoul".to_string(),
                page_id: None,
                page_title: None,
                notes: String::new(),
                created_at: "2026-08-16T00:00:00Z".to_string(),
                updated_at: "2026-08-16T00:00:00Z".to_string(),
            },
        ];
        let imported = import_ics(&export_ics(&records));
        assert_eq!(imported.len(), 2);
        assert_eq!(imported[0].title, "GA 휴일");
        assert!(imported[0].all_day);
        assert_eq!(imported[0].page_id.as_deref(), Some("page-1"));
        assert_eq!(imported[0].notes, "첫 줄\n둘째 줄");
        assert_eq!(imported[1].start_at, "2026-08-16T10:30:00");
        assert_eq!(imported[1].timezone, "Asia/Seoul");
    }
}
