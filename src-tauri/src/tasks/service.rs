use crate::db::repositories::page_repository::PageRepository;
use crate::domain::page::SavePageV2Request;
use crate::domain::task::{TaskListRequest, TaskRecord, UpdateTaskRequest};
use crate::services::page_service::PageService;
use crate::tasks::parser::{parse_tasks, render_task_line, valid_task_assignee, valid_task_date};
use rusqlite::{params, Connection};
use std::fmt;

#[derive(Debug)]
pub enum TaskServiceError {
    Sqlite(rusqlite::Error),
    NotFound,
    Conflict,
    InvalidSource,
    InvalidMetadata,
    Page(String),
}

impl fmt::Display for TaskServiceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Sqlite(error) => write!(formatter, "Task storage failed: {error}"),
            Self::NotFound => write!(formatter, "Task was not found"),
            Self::Conflict => write!(formatter, "Task source changed; refresh before updating"),
            Self::InvalidSource => write!(formatter, "Task source could not be patched safely"),
            Self::InvalidMetadata => write!(formatter, "Task metadata is invalid"),
            Self::Page(error) => write!(formatter, "Task page save failed: {error}"),
        }
    }
}

impl std::error::Error for TaskServiceError {}

impl From<rusqlite::Error> for TaskServiceError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sqlite(error)
    }
}

pub struct TaskService;

impl TaskService {
    pub fn replace_page_tasks(
        connection: &Connection,
        page_id: &str,
        markdown: &str,
        project_id: Option<&str>,
        updated_at: &str,
    ) -> Result<(), TaskServiceError> {
        connection.execute("DELETE FROM tasks WHERE page_id=?1", [page_id])?;
        for task in parse_tasks(markdown) {
            let Some(id) = task.id else { continue };
            connection.execute(
                "INSERT INTO tasks (
                    id, page_id, project_id, text, completed, due_date, start_date, assignee,
                    priority, line, source_start, source_end, source_hash, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
                params![
                    id,
                    page_id,
                    project_id,
                    task.text,
                    task.completed,
                    task.due_date,
                    task.start_date,
                    task.assignee,
                    task.priority,
                    task.line,
                    task.source_start,
                    task.source_end,
                    task.source_hash,
                    updated_at,
                ],
            )?;
        }
        Ok(())
    }

    pub fn list(
        connection: &Connection,
        request: &TaskListRequest,
    ) -> Result<Vec<TaskRecord>, TaskServiceError> {
        let mut statement = connection.prepare(
            "SELECT t.id, t.page_id, p.title, t.project_id, t.text, t.completed,
                    t.due_date, t.start_date, t.assignee, t.priority, t.line, t.source_start, t.source_end,
                    t.source_hash, t.updated_at
             FROM tasks t JOIN pages p ON p.id=t.page_id
             WHERE p.deleted_at IS NULL
             ORDER BY t.completed, CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END,
                      t.due_date, t.priority, p.title, t.line",
        )?;
        let rows = statement
            .query_map([], read_task)?
            .collect::<Result<Vec<_>, _>>()?;
        let reference = request
            .reference_date
            .clone()
            .unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());
        Ok(rows
            .into_iter()
            .filter(|task| match request.filter.as_str() {
                "today" => !task.completed && task.due_date.as_deref() == Some(&reference),
                "upcoming" => {
                    !task.completed
                        && task
                            .due_date
                            .as_deref()
                            .is_some_and(|due| due > reference.as_str())
                }
                "overdue" => {
                    !task.completed
                        && task
                            .due_date
                            .as_deref()
                            .is_some_and(|due| due < reference.as_str())
                }
                "completed" => task.completed,
                "project" => request.project_id.as_ref() == task.project_id.as_ref(),
                "page" => request.page_id.as_deref() == Some(task.page_id.as_str()),
                "all" => true,
                _ => !task.completed && task.due_date.is_none(),
            })
            .collect())
    }

    pub fn update(
        connection: &mut Connection,
        request: &UpdateTaskRequest,
    ) -> Result<TaskRecord, TaskServiceError> {
        if request
            .due_date
            .as_deref()
            .is_some_and(|value| !valid_task_date(value))
            || request
                .start_date
                .as_deref()
                .is_some_and(|value| !valid_task_date(value))
            || request
                .assignee
                .as_deref()
                .is_some_and(|value| !valid_task_assignee(value))
            || request
                .priority
                .is_some_and(|value| !(1..=3).contains(&value))
        {
            return Err(TaskServiceError::InvalidMetadata);
        }
        let existing = get_task(connection, &request.id)?;
        if existing.source_hash != request.expected_hash {
            return Err(TaskServiceError::Conflict);
        }
        let body = PageRepository::get_body(connection, &existing.page_id)?;
        let summary = PageRepository::get_summary(connection, &existing.page_id)?;
        let source = body
            .body_markdown
            .get(existing.source_start..existing.source_end)
            .ok_or(TaskServiceError::Conflict)?;
        let parsed = parse_tasks(source)
            .into_iter()
            .next()
            .ok_or(TaskServiceError::InvalidSource)?;
        if parsed.source_hash != request.expected_hash
            || parsed.id.as_deref() != Some(existing.id.as_str())
        {
            return Err(TaskServiceError::Conflict);
        }
        let replacement = render_task_line(
            source,
            request.completed,
            request.due_date.as_deref(),
            request.start_date.as_deref(),
            request.assignee.as_deref(),
            request.priority,
        )
        .ok_or(TaskServiceError::InvalidSource)?;
        let mut markdown = body.body_markdown;
        markdown.replace_range(existing.source_start..existing.source_end, &replacement);
        let updated_at = chrono::Utc::now().to_rfc3339();
        PageService::save(
            connection,
            SavePageV2Request {
                id: summary.id,
                title: summary.title,
                icon: summary.icon,
                parent_id: summary.parent_id,
                project_parent_id: summary.project_parent_id,
                project_index: summary.project_index,
                date_key: summary.date_key,
                body_markdown: markdown,
                created_at: summary.created_at,
                updated_at,
                page_type: summary.page_type,
                tags: summary.tags,
                order: summary.order,
                base_revision: body.revision,
                source: "task_update".to_string(),
            },
        )
        .map_err(|error| TaskServiceError::Page(error.to_string()))?;
        get_task(connection, &request.id)
    }
}

fn read_task(row: &rusqlite::Row<'_>) -> rusqlite::Result<TaskRecord> {
    Ok(TaskRecord {
        id: row.get(0)?,
        page_id: row.get(1)?,
        page_title: row.get(2)?,
        project_id: row.get(3)?,
        text: row.get(4)?,
        completed: row.get::<_, i64>(5)? != 0,
        due_date: row.get(6)?,
        start_date: row.get(7)?,
        assignee: row.get(8)?,
        priority: row.get(9)?,
        line: row.get(10)?,
        source_start: row.get(11)?,
        source_end: row.get(12)?,
        source_hash: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

fn get_task(connection: &Connection, id: &str) -> Result<TaskRecord, TaskServiceError> {
    connection
        .query_row(
            "SELECT t.id, t.page_id, p.title, t.project_id, t.text, t.completed,
                    t.due_date, t.start_date, t.assignee, t.priority, t.line, t.source_start, t.source_end,
                    t.source_hash, t.updated_at
             FROM tasks t JOIN pages p ON p.id=t.page_id WHERE t.id=?1",
            [id],
            read_task,
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => TaskServiceError::NotFound,
            other => TaskServiceError::Sqlite(other),
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::configure_connection;
    use crate::db::migrations::migrate_with_backup;

    fn connection() -> Connection {
        let mut connection = Connection::open_in_memory().expect("in-memory DB");
        configure_connection(&connection).expect("connection pragmas");
        migrate_with_backup(&mut connection, |_connection| Ok(())).expect("schema");
        connection
    }

    fn page_request(markdown: &str) -> SavePageV2Request {
        SavePageV2Request {
            id: "page-1".to_string(),
            title: "출시".to_string(),
            icon: "📄".to_string(),
            parent_id: None,
            project_parent_id: Some("project-1".to_string()),
            project_index: true,
            date_key: None,
            body_markdown: markdown.to_string(),
            created_at: "2026-08-16T09:00:00Z".to_string(),
            updated_at: "2026-08-16T09:00:00Z".to_string(),
            page_type: "page".to_string(),
            tags: Vec::new(),
            order: 0,
            base_revision: 0,
            source: "test".to_string(),
        }
    }

    #[test]
    fn filters_tasks_and_updates_markdown_through_a_new_page_revision() {
        let mut connection = connection();
        PageService::save(
            &mut connection,
            page_request("- [ ] 인박스\n- [ ] 오늘 @due(2026-08-16) !p1\n- [x] 완료\n"),
        )
        .expect("save");

        let inbox = TaskService::list(
            &connection,
            &TaskListRequest {
                reference_date: Some("2026-08-16".to_string()),
                ..Default::default()
            },
        )
        .expect("inbox");
        assert_eq!(inbox.len(), 1);
        let today = TaskService::list(
            &connection,
            &TaskListRequest {
                filter: "today".to_string(),
                reference_date: Some("2026-08-16".to_string()),
                ..Default::default()
            },
        )
        .expect("today");
        assert_eq!(today.len(), 1);

        let updated = TaskService::update(
            &mut connection,
            &UpdateTaskRequest {
                id: inbox[0].id.clone(),
                completed: true,
                due_date: Some("2026-08-18".to_string()),
                start_date: Some("2026-08-17".to_string()),
                assignee: Some("홍길동".to_string()),
                priority: Some(2),
                expected_hash: inbox[0].source_hash.clone(),
            },
        )
        .expect("update");
        assert!(updated.completed);
        assert_eq!(updated.due_date.as_deref(), Some("2026-08-18"));
        assert_eq!(updated.start_date.as_deref(), Some("2026-08-17"));
        assert_eq!(updated.assignee.as_deref(), Some("홍길동"));
        assert_eq!(
            PageRepository::get_body(&connection, "page-1")
                .unwrap()
                .revision,
            2
        );
        assert!(PageRepository::get_body(&connection, "page-1")
            .unwrap()
            .body_markdown
            .contains("- [x] 인박스 @start(2026-08-17) @due(2026-08-18) !p2 @assignee(홍길동)"));
    }

    #[test]
    fn rejects_stale_task_hashes() {
        let mut connection = connection();
        PageService::save(&mut connection, page_request("- [ ] 충돌 확인\n")).expect("save");
        let task = TaskService::list(
            &connection,
            &TaskListRequest {
                filter: "all".to_string(),
                ..Default::default()
            },
        )
        .unwrap()
        .remove(0);
        let error = TaskService::update(
            &mut connection,
            &UpdateTaskRequest {
                id: task.id,
                completed: true,
                due_date: None,
                start_date: None,
                assignee: None,
                priority: None,
                expected_hash: "stale".to_string(),
            },
        )
        .expect_err("must conflict");
        assert!(matches!(error, TaskServiceError::Conflict));
    }

    #[test]
    fn rejects_invalid_task_metadata_before_patching_markdown() {
        let mut connection = connection();
        PageService::save(&mut connection, page_request("- [ ] 입력 검증\n")).expect("save");
        let task = TaskService::list(
            &connection,
            &TaskListRequest {
                filter: "all".to_string(),
                ..Default::default()
            },
        )
        .unwrap()
        .remove(0);
        let error = TaskService::update(
            &mut connection,
            &UpdateTaskRequest {
                id: task.id,
                completed: false,
                due_date: Some("2026-02-30".to_string()),
                start_date: None,
                assignee: Some("담당자)\n- [ ] 주입".to_string()),
                priority: Some(2),
                expected_hash: task.source_hash,
            },
        )
        .expect_err("invalid metadata must be rejected");
        assert!(matches!(error, TaskServiceError::InvalidMetadata));
    }
}
