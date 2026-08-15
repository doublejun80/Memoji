pub mod anchors;
pub mod fts;
pub mod links;
pub mod markdown;
pub mod tags;
pub mod worker;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexedHeading {
    pub slug: String,
    pub text: String,
    pub level: usize,
    pub line: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexedTag {
    pub name: String,
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexedLink {
    pub target_title: String,
    pub target_anchor: Option<String>,
    pub label: Option<String>,
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexedTaskMarker {
    pub checked: bool,
    pub text: String,
    pub line: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexedChunk {
    pub anchor: Option<String>,
    pub text: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ParsedMarkdown {
    pub headings: Vec<IndexedHeading>,
    pub tags: Vec<IndexedTag>,
    pub links: Vec<IndexedLink>,
    pub tasks: Vec<IndexedTaskMarker>,
    pub chunks: Vec<IndexedChunk>,
}
