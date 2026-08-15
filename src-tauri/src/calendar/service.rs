use crate::calendar::ics::{export_ics, import_ics};
use crate::domain::event::{CalendarItem, CalendarRangeRequest, EventRecord, UpsertEventRequest};
use rusqlite::{params, Connection};
use std::fmt;

#[derive(Debug)]
pub enum CalendarServiceError {
    Sqlite(rusqlite::Error),
    InvalidRange,
    NotFound,
}

impl fmt::Display for CalendarServiceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Sqlite(error) => write!(formatter, "Calendar storage failed: {error}"),
            Self::InvalidRange => write!(formatter, "Calendar range is invalid"),
            Self::NotFound => write!(formatter, "Calendar event was not found"),
        }
    }
}

impl std::error::Error for CalendarServiceError {}

impl From<rusqlite::Error> for CalendarServiceError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sqlite(error)
    }
}

pub struct CalendarService;

impl CalendarService {
    pub fn save(
        connection: &Connection,
        request: &UpsertEventRequest,
    ) -> Result<EventRecord, CalendarServiceError> {
        if request.id.trim().is_empty()
            || request.title.trim().is_empty()
            || request.start_at.len() < 10
        {
            return Err(CalendarServiceError::InvalidRange);
        }
        let now = chrono::Utc::now().to_rfc3339();
        connection.execute(
            "INSERT INTO events (
                id, title, start_at, end_at, all_day, timezone, page_id, notes, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
             ON CONFLICT(id) DO UPDATE SET
                title=excluded.title, start_at=excluded.start_at, end_at=excluded.end_at,
                all_day=excluded.all_day, timezone=excluded.timezone, page_id=excluded.page_id,
                notes=excluded.notes, updated_at=excluded.updated_at",
            params![
                request.id,
                request.title.trim(),
                request.start_at,
                request.end_at,
                request.all_day,
                request.timezone,
                request.page_id,
                request.notes,
                now,
            ],
        )?;
        Self::get(connection, &request.id)
    }

    pub fn get(connection: &Connection, id: &str) -> Result<EventRecord, CalendarServiceError> {
        connection
            .query_row(
                "SELECT e.id, e.title, e.start_at, e.end_at, e.all_day, e.timezone,
                        e.page_id, p.title, e.notes, e.created_at, e.updated_at
                 FROM events e LEFT JOIN pages p ON p.id=e.page_id WHERE e.id=?1",
                [id],
                read_event,
            )
            .map_err(|error| match error {
                rusqlite::Error::QueryReturnedNoRows => CalendarServiceError::NotFound,
                other => CalendarServiceError::Sqlite(other),
            })
    }

    pub fn delete(connection: &Connection, id: &str) -> Result<(), CalendarServiceError> {
        if connection.execute("DELETE FROM events WHERE id=?1", [id])? == 0 {
            return Err(CalendarServiceError::NotFound);
        }
        Ok(())
    }

    pub fn list_items(
        connection: &Connection,
        request: &CalendarRangeRequest,
    ) -> Result<Vec<CalendarItem>, CalendarServiceError> {
        if request.start_date.len() != 10
            || request.end_date.len() != 10
            || request.start_date > request.end_date
        {
            return Err(CalendarServiceError::InvalidRange);
        }
        let mut items = Vec::new();
        let mut events = connection.prepare(
            "SELECT e.id, e.title, e.start_at, e.end_at, e.all_day, e.timezone,
                    e.page_id, p.title, e.notes, e.created_at, e.updated_at
             FROM events e LEFT JOIN pages p ON p.id=e.page_id
             WHERE substr(e.start_at, 1, 10) <= ?2
               AND substr(COALESCE(e.end_at, e.start_at), 1, 10) >= ?1
             ORDER BY e.start_at, e.title",
        )?;
        for row in events.query_map(params![request.start_date, request.end_date], read_event)? {
            let event = row?;
            items.push(CalendarItem {
                kind: "event".to_string(),
                id: event.id,
                title: event.title,
                start_at: event.start_at,
                end_at: event.end_at,
                all_day: event.all_day,
                timezone: event.timezone,
                page_id: event.page_id,
                page_title: event.page_title,
                completed: None,
                priority: None,
            });
        }
        let mut tasks = connection.prepare(
            "SELECT t.id, t.text, t.due_date, t.page_id, p.title, t.completed, t.priority
             FROM tasks t JOIN pages p ON p.id=t.page_id
             WHERE t.due_date BETWEEN ?1 AND ?2 AND p.deleted_at IS NULL
             ORDER BY t.due_date, t.priority, t.text",
        )?;
        let projected = tasks.query_map(params![request.start_date, request.end_date], |row| {
            Ok(CalendarItem {
                kind: "task".to_string(),
                id: row.get(0)?,
                title: row.get(1)?,
                start_at: row.get(2)?,
                end_at: None,
                all_day: true,
                timezone: "local".to_string(),
                page_id: row.get(3)?,
                page_title: row.get(4)?,
                completed: Some(row.get::<_, i64>(5)? != 0),
                priority: row.get(6)?,
            })
        })?;
        items.extend(projected.collect::<Result<Vec<_>, _>>()?);
        items.sort_by(|left, right| {
            left.start_at
                .cmp(&right.start_at)
                .then_with(|| left.kind.cmp(&right.kind))
                .then_with(|| left.title.cmp(&right.title))
        });
        Ok(items)
    }

    pub fn export_range(
        connection: &Connection,
        request: &CalendarRangeRequest,
    ) -> Result<String, CalendarServiceError> {
        let mut statement = connection.prepare(
            "SELECT e.id, e.title, e.start_at, e.end_at, e.all_day, e.timezone,
                    e.page_id, p.title, e.notes, e.created_at, e.updated_at
             FROM events e LEFT JOIN pages p ON p.id=e.page_id
             WHERE substr(e.start_at, 1, 10) <= ?2
               AND substr(COALESCE(e.end_at, e.start_at), 1, 10) >= ?1
             ORDER BY e.start_at",
        )?;
        let events = statement
            .query_map(params![request.start_date, request.end_date], read_event)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(export_ics(&events))
    }

    pub fn import(
        connection: &Connection,
        source: &str,
    ) -> Result<Vec<EventRecord>, CalendarServiceError> {
        import_ics(source)
            .iter()
            .map(|event| Self::save(connection, event))
            .collect()
    }
}

fn read_event(row: &rusqlite::Row<'_>) -> rusqlite::Result<EventRecord> {
    Ok(EventRecord {
        id: row.get(0)?,
        title: row.get(1)?,
        start_at: row.get(2)?,
        end_at: row.get(3)?,
        all_day: row.get::<_, i64>(4)? != 0,
        timezone: row.get(5)?,
        page_id: row.get(6)?,
        page_title: row.get(7)?,
        notes: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::configure_connection;
    use crate::db::migrations::migrate_with_backup;
    use crate::domain::page::SavePageV2Request;
    use crate::services::page_service::PageService;

    fn connection() -> Connection {
        let mut connection = Connection::open_in_memory().expect("in-memory DB");
        configure_connection(&connection).expect("connection pragmas");
        migrate_with_backup(&mut connection, |_connection| Ok(())).expect("schema");
        connection
    }

    fn event(id: &str) -> UpsertEventRequest {
        UpsertEventRequest {
            id: id.to_string(),
            title: "릴리스 회의".to_string(),
            start_at: "2026-08-16T10:00:00".to_string(),
            end_at: Some("2026-08-16T11:00:00".to_string()),
            all_day: false,
            timezone: "Asia/Seoul".to_string(),
            page_id: None,
            notes: "GA".to_string(),
        }
    }

    #[test]
    fn creates_updates_ranges_and_deletes_events() {
        let connection = connection();
        let saved = CalendarService::save(&connection, &event("event-1")).expect("create");
        assert_eq!(saved.timezone, "Asia/Seoul");
        let mut changed = event("event-1");
        changed.title = "출시 승인".to_string();
        changed.all_day = true;
        changed.start_at = "2026-08-17".to_string();
        changed.end_at = None;
        assert!(
            CalendarService::save(&connection, &changed)
                .unwrap()
                .all_day
        );
        let items = CalendarService::list_items(
            &connection,
            &CalendarRangeRequest {
                start_date: "2026-08-17".to_string(),
                end_date: "2026-08-17".to_string(),
            },
        )
        .unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "출시 승인");
        CalendarService::delete(&connection, "event-1").expect("delete");
        assert!(matches!(
            CalendarService::get(&connection, "event-1"),
            Err(CalendarServiceError::NotFound)
        ));
    }

    #[test]
    fn projects_task_due_dates_without_copying_them_into_events_and_links_pages() {
        let mut connection = connection();
        PageService::save(
            &mut connection,
            SavePageV2Request {
                id: "page-1".to_string(),
                title: "출시 계획".to_string(),
                icon: "📄".to_string(),
                parent_id: None,
                project_parent_id: None,
                project_index: false,
                date_key: Some("2026-08-16".to_string()),
                body_markdown: "- [ ] 패키징 @due(2026-08-18) !p1".to_string(),
                created_at: "2026-08-16T09:00:00Z".to_string(),
                updated_at: "2026-08-16T09:00:00Z".to_string(),
                page_type: "page".to_string(),
                tags: Vec::new(),
                order: 0,
                base_revision: 0,
                source: "test".to_string(),
            },
        )
        .expect("page");
        let mut linked = event("event-linked");
        linked.start_at = "2026-08-18T09:00:00".to_string();
        linked.end_at = None;
        linked.page_id = Some("page-1".to_string());
        CalendarService::save(&connection, &linked).expect("event");

        let items = CalendarService::list_items(
            &connection,
            &CalendarRangeRequest {
                start_date: "2026-08-18".to_string(),
                end_date: "2026-08-18".to_string(),
            },
        )
        .expect("range");
        assert_eq!(items.iter().filter(|item| item.kind == "task").count(), 1);
        assert_eq!(items.iter().filter(|item| item.kind == "event").count(), 1);
        assert!(items
            .iter()
            .all(|item| item.page_title.as_deref() == Some("출시 계획")));
        let event_rows: i64 = connection
            .query_row("SELECT COUNT(*) FROM events", [], |row| row.get(0))
            .unwrap();
        assert_eq!(event_rows, 1);
    }

    #[test]
    fn exports_and_imports_ics_through_the_service() {
        let source = connection();
        CalendarService::save(&source, &event("event-ics")).unwrap();
        let range = CalendarRangeRequest {
            start_date: "2026-08-01".to_string(),
            end_date: "2026-08-31".to_string(),
        };
        let ics = CalendarService::export_range(&source, &range).unwrap();
        let target = connection();
        let imported = CalendarService::import(&target, &ics).unwrap();
        assert_eq!(imported.len(), 1);
        assert_eq!(imported[0].title, "릴리스 회의");
        assert_eq!(imported[0].timezone, "Asia/Seoul");
    }
}
