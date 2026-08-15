import { Maximize2, Minus, Square, X } from 'lucide-react';
import { toast } from 'sonner';

export type WindowAction = 'minimize' | 'maximize' | 'close';

interface WindowControlsProps {
  onAction?: (action: WindowAction) => void | Promise<void>;
}

export function WindowControls({ onAction }: WindowControlsProps) {
  const perform = async (action: WindowAction) => {
    try {
      if (onAction) {
        await onAction(action);
        return;
      }
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const appWindow = getCurrentWindow();
      if (action === 'minimize') await appWindow.minimize();
      if (action === 'maximize') await appWindow.toggleMaximize();
      if (action === 'close') await appWindow.close();
    } catch (error) {
      toast.error(`창 작업을 완료하지 못했습니다: ${String(error)}`);
    }
  };

  return (
    <div className="memoji-window-controls" role="group" aria-label="창 제어">
      <button type="button" aria-label="최소화" title="최소화" onClick={() => void perform('minimize')}>
        <Minus aria-hidden="true" />
      </button>
      <button type="button" aria-label="최대화" title="최대화" onClick={() => void perform('maximize')}>
        <Square aria-hidden="true" />
        <Maximize2 className="memoji-window-maximize-fallback" aria-hidden="true" />
      </button>
      <button type="button" aria-label="닫기" title="닫기" onClick={() => void perform('close')}>
        <X aria-hidden="true" />
      </button>
    </div>
  );
}
