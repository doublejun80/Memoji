use crate::local_ai::{LiteRtManagedStatus, LiteRtManager};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ManagedRuntimeState {
    NotBundled,
    Stopped,
    Starting,
    Ready,
    Degraded,
    Failed,
}

#[derive(Debug, Clone)]
pub struct RuntimeProcessManager {
    manager: LiteRtManager,
}

impl RuntimeProcessManager {
    pub fn new(manager: LiteRtManager) -> Self {
        Self { manager }
    }

    pub fn start(&self) -> Result<bool, String> {
        self.manager.ensure_started()
    }

    pub fn status(&self) -> LiteRtManagedStatus {
        self.manager.status()
    }

    pub fn state(&self) -> ManagedRuntimeState {
        let status = self.status();
        if !status.available {
            ManagedRuntimeState::NotBundled
        } else if status.process_running && status.endpoint_reachable {
            ManagedRuntimeState::Ready
        } else if status.process_running {
            ManagedRuntimeState::Starting
        } else if status.last_error.is_some() {
            ManagedRuntimeState::Failed
        } else {
            ManagedRuntimeState::Stopped
        }
    }
}
