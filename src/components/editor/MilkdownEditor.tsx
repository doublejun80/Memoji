import React, { CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crepe } from '@milkdown/crepe';
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import { headingSchema, paragraphSchema, setBlockTypeCommand } from '@milkdown/kit/preset/commonmark';
import { TextSelection } from '@milkdown/kit/prose/state';
import { $markSchema, $remark, insert as insertMarkdown, replaceAll } from '@milkdown/kit/utils';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import '@milkdown/prose/tables/style/tables.css';
import {
  EDITOR_FONT_FAMILY_VALUES,
  EDITOR_PREFERENCES_CHANGED_EVENT,
  readEditorPreferences,
} from '../../utils/editorPreferences';

interface MilkdownEditorProps {
  value: string;
  placeholder?: string;
  onChange: (markdown: string) => void;
}

const TEXT_COLOR_OPTIONS = [
  { label: '기본', value: null, swatch: '#111827' },
  { label: '빨강', value: '#dc2626', swatch: '#dc2626' },
  { label: '주황', value: '#ea580c', swatch: '#ea580c' },
  { label: '노랑', value: '#ca8a04', swatch: '#ca8a04' },
  { label: '초록', value: '#16a34a', swatch: '#16a34a' },
  { label: '청록', value: '#0d9488', swatch: '#0d9488' },
  { label: '하늘', value: '#0284c7', swatch: '#0284c7' },
  { label: '파랑', value: '#2563eb', swatch: '#2563eb' },
  { label: '남색', value: '#4f46e5', swatch: '#4f46e5' },
  { label: '보라', value: '#9333ea', swatch: '#9333ea' },
  { label: '분홍', value: '#db2777', swatch: '#db2777' },
  { label: '회색', value: '#6b7280', swatch: '#6b7280' },
  { label: '검정', value: '#111827', swatch: '#111827' },
];

const FORMAT_OPTIONS = [
  { label: 'Paragraph', level: null },
  { label: 'Heading 1', level: 1 },
  { label: 'Heading 2', level: 2 },
  { label: 'Heading 3', level: 3 },
  { label: 'Heading 4', level: 4 },
  { label: 'Heading 5', level: 5 },
  { label: 'Heading 6', level: 6 },
] as const;

const TOOLBAR_BUTTON_LABELS = [
  '굵게',
  '기울임',
  '취소선',
  '인라인 코드',
  '글머리 기호 목록',
  '번호 목록',
  '체크리스트',
  '링크 추가',
  '이미지 삽입',
  '표 삽입',
  '코드 블록',
  '수식 블록',
  '인용',
  '구분선',
];

const normalizeTextColor = (color: unknown): string | null => {
  if (typeof color !== 'string') return null;
  const trimmed = color.trim();
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(trimmed)) return trimmed.toLowerCase();
  return null;
};

const getColorFromHtml = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const match = value.match(/<span\b[^>]*style=(["'])(?:(?!\1).)*?color\s*:\s*(#[0-9a-f]{3}(?:[0-9a-f]{3})?)(?:(?!\1).)*?\1[^>]*>/i);
  return normalizeTextColor(match?.[2]);
};

const isClosingColorSpan = (value: unknown): boolean => (
  typeof value === 'string' && /^<\/span\s*>$/i.test(value.trim())
);

const transformColorSpanNodes = (nodes: any[]): any[] => {
  const nextNodes: any[] = [];

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const color = node?.type === 'html' ? getColorFromHtml(node.value) : null;

    if (color) {
      const children: any[] = [];
      let cursor = index + 1;
      while (cursor < nodes.length && !isClosingColorSpan(nodes[cursor]?.value)) {
        children.push(nodes[cursor]);
        cursor += 1;
      }

      if (cursor < nodes.length && children.length > 0) {
        nextNodes.push({
          type: 'memojiTextColor',
          color,
          children: transformColorSpanNodes(children),
        });
        index = cursor;
        continue;
      }
    }

    if (Array.isArray(node?.children)) {
      nextNodes.push({
        ...node,
        children: transformColorSpanNodes(node.children),
      });
    } else {
      nextNodes.push(node);
    }
  }

  return nextNodes;
};

const remarkTextColor = $remark('memojiTextColor', () => () => (tree: any) => {
  if (Array.isArray(tree?.children)) {
    tree.children = transformColorSpanNodes(tree.children);
  }
});

const textColorSchema = $markSchema('memoji_text_color', () => ({
  attrs: {
    color: { default: '#111827', validate: 'string' },
  },
  parseDOM: [
    {
      tag: 'span[style]',
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) return false;
        const color = getColorFromHtml(`<span style="${dom.getAttribute('style') ?? ''}">`);
        return color ? { color } : false;
      },
    },
  ],
  toDOM: (mark) => ['span', { style: `color: ${mark.attrs.color}` }],
  parseMarkdown: {
    match: (node: any) => node.type === 'memojiTextColor',
    runner: (state, node: any, markType) => {
      state.openMark(markType, { color: normalizeTextColor(node.color) ?? '#111827' });
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'memoji_text_color',
    runner: (state, mark, node) => {
      if (!node.isText) return false;
      const color = normalizeTextColor(mark.attrs.color) ?? '#111827';
      state.addNode('html', undefined, `<span style="color: ${color}">`);
      state.addNode('text', undefined, node.text ?? '');
      state.addNode('html', undefined, '</span>');
      return true;
    },
  },
}));

const EMOJI_PAGE_SIZE = 16;
const EMOJI_CHOICES = [
  '😊',
  '👍',
  '✅',
  '💡',
  '📌',
  '⭐',
  '🔥',
  '🎯',
  '⚠️',
  '❗',
  '❤️',
  '👏',
  '🙏',
  '🚀',
  '📝',
  '📅',
  '😀',
  '😄',
  '😁',
  '😆',
  '😂',
  '🤣',
  '🙂',
  '😉',
  '😍',
  '😘',
  '😎',
  '🤔',
  '🙄',
  '😮',
  '😢',
  '😡',
  '🙌',
  '👌',
  '🤝',
  '💪',
  '👀',
  '🧠',
  '💬',
  '✍️',
  '📎',
  '📚',
  '📖',
  '🔍',
  '🔔',
  '🗂️',
  '🗓️',
  '⏰',
  '✨',
  '💯',
  '🌟',
  '🎉',
  '🏆',
  '🥇',
  '💎',
  '🌈',
  '☀️',
  '🌙',
  '🌧️',
  '☕',
  '🍀',
  '🌱',
  '🌿',
  '🌸',
  '🔴',
  '🟠',
  '🟡',
  '🟢',
  '🔵',
  '🟣',
  '⚫',
  '⚪',
  '⬆️',
  '⬇️',
  '➡️',
  '⬅️',
  '🔒',
  '🔓',
  '🧩',
  '🛠️',
  '🧰',
  '⚙️',
  '📊',
  '📈',
  '📉',
  '🧾',
  '💼',
  '📁',
  '📂',
  '🗒️',
  '📋',
  '✅',
  '❌',
  '➕',
  '➖',
  '➗',
  '✖️',
  '❓',
  '❕',
  '💭',
  '🗯️',
  '📣',
  '📢',
  '🔖',
  '🏷️',
  '📍',
  '🧭',
  '🗺️',
  '🚩',
  '🏁',
  '🎨',
  '🖌️',
  '🖍️',
  '✏️',
  '🖊️',
  '🖋️',
  '🔧',
  '🔨',
  '🪛',
  '🧪',
  '🔬',
  '💻',
  '⌨️',
  '🖥️',
  '📱',
  '🔋',
  '🔌',
  '🌐',
  '📡',
  '🛡️',
  '🔑',
  '🚪',
  '🪄',
  '🎁',
  '🎈',
  '🎂',
  '🍎',
  '🍊',
  '🍋',
  '🍇',
  '🍓',
  '🍒',
  '🍞',
  '🍜',
  '🍱',
  '🍵',
  '🧊',
  '🏠',
  '🏢',
  '🏫',
  '🏥',
  '🏦',
  '🚗',
  '🚕',
  '🚌',
  '🚆',
  '✈️',
  '🚀',
  '🧱',
  '⛔',
];
const EMOJI_PAGE_COUNT = Math.ceil(EMOJI_CHOICES.length / EMOJI_PAGE_SIZE);

export const MilkdownEditor: React.FC<MilkdownEditorProps> = ({
  value,
  placeholder = '마크다운으로 작성해보세요...',
  onChange,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const formatButtonRef = useRef<HTMLElement | null>(null);
  const formatMenuRef = useRef<HTMLDivElement>(null);
  const colorButtonRef = useRef<HTMLButtonElement>(null);
  const colorMenuRef = useRef<HTMLDivElement>(null);
  const colorPopoverRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const emojiMenuRef = useRef<HTMLDivElement>(null);
  const emojiPopoverRef = useRef<HTMLDivElement>(null);
  const [preferences, setPreferences] = useState(readEditorPreferences);
  const [toolbarTarget, setToolbarTarget] = useState<HTMLElement | null>(null);
  const [isFormatMenuOpen, setIsFormatMenuOpen] = useState(false);
  const [formatMenuStyle, setFormatMenuStyle] = useState<CSSProperties>({});
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [colorPopoverStyle, setColorPopoverStyle] = useState<CSSProperties>({});
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [emojiPage, setEmojiPage] = useState(0);
  const [emojiPopoverStyle, setEmojiPopoverStyle] = useState<CSSProperties>({});

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const syncPreferences = () => setPreferences(readEditorPreferences());
    window.addEventListener(EDITOR_PREFERENCES_CHANGED_EVENT, syncPreferences);
    window.addEventListener('storage', syncPreferences);
    return () => {
      window.removeEventListener(EDITOR_PREFERENCES_CHANGED_EVENT, syncPreferences);
      window.removeEventListener('storage', syncPreferences);
    };
  }, []);

  const updateEmojiPopoverPosition = useCallback(() => {
    const anchor = emojiButtonRef.current?.getBoundingClientRect();
    if (!anchor) return;

    const popoverWidth = 168;
    const popoverHeight = 184;
    const gap = 6;
    const viewportPadding = 8;
    const left = Math.min(
      window.innerWidth - popoverWidth - viewportPadding,
      Math.max(viewportPadding, anchor.right - popoverWidth)
    );
    const belowTop = anchor.bottom + gap;
    const aboveTop = anchor.top - popoverHeight - gap;
    const top = belowTop + popoverHeight <= window.innerHeight
      ? belowTop
      : Math.max(viewportPadding, aboveTop);

    setEmojiPopoverStyle({
      left,
      top,
    });
  }, []);

  const updateFormatMenuPosition = useCallback(() => {
    const anchor = formatButtonRef.current?.getBoundingClientRect();
    if (!anchor) return;

    const menuWidth = 220;
    const menuHeight = 306;
    const viewportPadding = 8;
    const gap = 6;
    const top = Math.min(
      window.innerHeight - 72 - viewportPadding,
      Math.max(viewportPadding, anchor.bottom + gap)
    );
    const maxHeight = Math.min(
      menuHeight,
      Math.max(72, window.innerHeight - top - viewportPadding)
    );
    const left = Math.min(
      window.innerWidth - menuWidth - viewportPadding,
      Math.max(viewportPadding, anchor.left)
    );

    setFormatMenuStyle({ left, top, maxHeight });
  }, []);

  const updateColorPopoverPosition = useCallback(() => {
    const anchor = colorButtonRef.current?.getBoundingClientRect();
    if (!anchor) return;

    const popoverWidth = 176;
    const popoverHeight = 148;
    const viewportPadding = 8;
    const gap = 6;
    const left = Math.min(
      window.innerWidth - popoverWidth - viewportPadding,
      Math.max(viewportPadding, anchor.right - popoverWidth)
    );
    const belowTop = anchor.bottom + gap;
    const aboveTop = anchor.top - popoverHeight - gap;
    const top = belowTop + popoverHeight <= window.innerHeight
      ? belowTop
      : Math.max(viewportPadding, aboveTop);

    setColorPopoverStyle({ left, top });
  }, []);

  const labelToolbarButtons = useCallback(() => {
    const toolbar = toolbarTarget;
    if (!toolbar) return;

    const headingButton = toolbar.querySelector('.top-bar-heading-button') as HTMLElement | null;
    headingButton?.setAttribute('title', '문단 형식');
    headingButton?.setAttribute('aria-label', '문단 형식');

    const buttons = Array.from(toolbar.querySelectorAll('.top-bar-item')) as HTMLElement[];
    buttons.forEach((button, index) => {
      const label = TOOLBAR_BUTTON_LABELS[index];
      if (!label) return;
      button.setAttribute('title', label);
      button.setAttribute('aria-label', label);
    });
  }, [toolbarTarget]);

  const preserveEditorViewport = useCallback((run: () => void) => {
    const editorElement = rootRef.current?.querySelector('.ProseMirror') as HTMLElement | null;
    const scrollTop = editorElement?.scrollTop ?? 0;
    const scrollLeft = editorElement?.scrollLeft ?? 0;
    run();
    window.requestAnimationFrame(() => {
      if (!editorElement) return;
      editorElement.scrollTop = scrollTop;
      editorElement.scrollLeft = scrollLeft;
    });
  }, []);

  const syncMarkdownToEditor = useCallback((markdown: string) => {
    const crepe = crepeRef.current;
    if (valueRef.current === markdown) return;

    valueRef.current = markdown;
    if (!crepe) return;

    preserveEditorViewport(() => {
      crepe.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        if (!view) return;
        const previousSelection = view.state.selection;
        replaceAll(markdown)(ctx);

        const nextView = ctx.get(editorViewCtx);
        if (!nextView) return;
        const maxPosition = nextView.state.doc.content.size;
        const from = Math.min(Math.max(previousSelection.from, 0), maxPosition);
        const transaction = nextView.state.tr.setSelection(
          TextSelection.near(nextView.state.doc.resolve(from), 1)
        );
        nextView.dispatch(transaction);
      });
    });
  }, [preserveEditorViewport]);

  useEffect(() => {
    syncMarkdownToEditor(value);
  }, [syncMarkdownToEditor, value]);

  useEffect(() => {
    if (!rootRef.current) return;

    let cancelled = false;

    const crepe = new Crepe({
      root: rootRef.current,
      defaultValue: valueRef.current,
      features: {
        [Crepe.Feature.BlockEdit]: false,
        [Crepe.Feature.Table]: true,
        [Crepe.Feature.TopBar]: true,
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: {
          text: placeholder,
          mode: 'doc',
        },
      },
    });
    crepe.editor.use([remarkTextColor, textColorSchema].flat());

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
        if (cancelled || markdown === prevMarkdown || markdown === valueRef.current) return;
        valueRef.current = markdown;
        onChangeRef.current(markdown);
      });
    });

    crepe.create().then(() => {
      if (cancelled) return;
      crepeRef.current = crepe;
      crepe.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        if (!view) return;
        if (crepe.getMarkdown() === valueRef.current) return;
        replaceAll(valueRef.current)(ctx);
      });
      const nextToolbarTarget = rootRef.current?.querySelector('.top-bar-inner') ?? null;
      setToolbarTarget(nextToolbarTarget);
    }).catch((error) => {
      console.error('Milkdown editor failed to mount:', error);
    });

    return () => {
      cancelled = true;
      if (crepeRef.current === crepe) crepeRef.current = null;
      setToolbarTarget(null);
      setIsEmojiPickerOpen(false);
      setIsColorPickerOpen(false);
      setIsFormatMenuOpen(false);
      crepe.destroy().catch((error) => {
        console.error('Milkdown editor failed to destroy:', error);
      });
    };
  }, [placeholder]);

  useEffect(() => {
    if (!isEmojiPickerOpen) return;
    updateEmojiPopoverPosition();

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (emojiMenuRef.current?.contains(event.target as Node)) return;
      if (emojiPopoverRef.current?.contains(event.target as Node)) return;
      setIsEmojiPickerOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('resize', updateEmojiPopoverPosition);
    window.addEventListener('scroll', updateEmojiPopoverPosition, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('resize', updateEmojiPopoverPosition);
      window.removeEventListener('scroll', updateEmojiPopoverPosition, true);
    };
  }, [isEmojiPickerOpen, updateEmojiPopoverPosition]);

  useEffect(() => {
    if (!toolbarTarget) return;

    let headingButton: HTMLElement | null = null;

    const openFormatMenu = (event: PointerEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      formatButtonRef.current = event.currentTarget as HTMLElement;
      updateFormatMenuPosition();
      setIsFormatMenuOpen((open) => !open);
    };

    const blockNativeFormatMenu = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
    };

    const openFormatMenuFromKeyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      formatButtonRef.current = event.currentTarget as HTMLElement;
      updateFormatMenuPosition();
      setIsFormatMenuOpen((open) => !open);
    };

    const attachHeadingButton = () => {
      const nextButton = toolbarTarget.querySelector('.top-bar-heading-button') as HTMLElement | null;
      if (!nextButton || nextButton === headingButton) return;
      headingButton?.removeEventListener('pointerdown', openFormatMenu, true);
      headingButton?.removeEventListener('mousedown', blockNativeFormatMenu, true);
      headingButton?.removeEventListener('click', blockNativeFormatMenu, true);
      headingButton?.removeEventListener('keydown', openFormatMenuFromKeyboard, true);
      headingButton = nextButton;
      formatButtonRef.current = nextButton;
      headingButton.addEventListener('pointerdown', openFormatMenu, true);
      headingButton.addEventListener('mousedown', blockNativeFormatMenu, true);
      headingButton.addEventListener('click', blockNativeFormatMenu, true);
      headingButton.addEventListener('keydown', openFormatMenuFromKeyboard, true);
    };

    const syncToolbarControls = () => {
      attachHeadingButton();
      labelToolbarButtons();
    };

    const observer = new MutationObserver(syncToolbarControls);
    observer.observe(toolbarTarget, {
      childList: true,
      subtree: true,
    });
    syncToolbarControls();

    return () => {
      headingButton?.removeEventListener('pointerdown', openFormatMenu, true);
      headingButton?.removeEventListener('mousedown', blockNativeFormatMenu, true);
      headingButton?.removeEventListener('click', blockNativeFormatMenu, true);
      headingButton?.removeEventListener('keydown', openFormatMenuFromKeyboard, true);
      observer.disconnect();
    };
  }, [labelToolbarButtons, toolbarTarget, updateFormatMenuPosition]);

  useEffect(() => {
    if (!isFormatMenuOpen) return;
    updateFormatMenuPosition();

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (formatButtonRef.current?.contains(event.target as Node)) return;
      if (formatMenuRef.current?.contains(event.target as Node)) return;
      setIsFormatMenuOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('resize', updateFormatMenuPosition);
    window.addEventListener('scroll', updateFormatMenuPosition, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('resize', updateFormatMenuPosition);
      window.removeEventListener('scroll', updateFormatMenuPosition, true);
    };
  }, [isFormatMenuOpen, updateFormatMenuPosition]);

  useEffect(() => {
    if (!isColorPickerOpen) return;
    updateColorPopoverPosition();

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (colorMenuRef.current?.contains(event.target as Node)) return;
      if (colorPopoverRef.current?.contains(event.target as Node)) return;
      setIsColorPickerOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('resize', updateColorPopoverPosition);
    window.addEventListener('scroll', updateColorPopoverPosition, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('resize', updateColorPopoverPosition);
      window.removeEventListener('scroll', updateColorPopoverPosition, true);
    };
  }, [isColorPickerOpen, updateColorPopoverPosition]);

  const editorStyle = {
    '--memoji-editor-font-family': EDITOR_FONT_FAMILY_VALUES[preferences.fontFamily],
  } as CSSProperties;
  const visibleEmojiChoices = EMOJI_CHOICES.slice(
    emojiPage * EMOJI_PAGE_SIZE,
    (emojiPage + 1) * EMOJI_PAGE_SIZE
  );

  const insertEmoji = (emoji: string) => {
    const crepe = crepeRef.current;
    if (!crepe) return;

    preserveEditorViewport(() => {
      crepe.editor.action(insertMarkdown(emoji, true));
    });

    const nextValue = crepe.getMarkdown();
    if (nextValue !== valueRef.current) {
      valueRef.current = nextValue;
      onChangeRef.current(nextValue);
    }
    setIsEmojiPickerOpen(false);
  };

  const applyBlockFormat = (level: typeof FORMAT_OPTIONS[number]['level']) => {
    const crepe = crepeRef.current;
    if (!crepe) return;

    crepe.editor.action((ctx) => {
      const commands = ctx.get(commandsCtx);
      if (level === null) {
        commands.call(setBlockTypeCommand.key, { nodeType: paragraphSchema.type(ctx) });
      } else {
        commands.call(setBlockTypeCommand.key, {
          nodeType: headingSchema.type(ctx),
          attrs: { level },
        });
      }
      ctx.get(editorViewCtx).focus();
    });

    const nextValue = crepe.getMarkdown();
    if (nextValue !== valueRef.current) {
      valueRef.current = nextValue;
      onChangeRef.current(nextValue);
    }
    setIsFormatMenuOpen(false);
  };

  const applyTextColor = (color: string | null) => {
    const crepe = crepeRef.current;
    if (!crepe) return;

    crepe.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const markType = textColorSchema.type(ctx);
      const { state } = view;
      const { from, to, empty } = state.selection;
      let transaction = state.tr;

      if (empty) {
        transaction = transaction.removeStoredMark(markType);
        if (color) transaction = transaction.addStoredMark(markType.create({ color }));
      } else {
        transaction = transaction.removeMark(from, to, markType);
        if (color) transaction = transaction.addMark(from, to, markType.create({ color }));
        transaction = transaction.scrollIntoView();
      }

      view.dispatch(transaction);
      view.focus();
    });

    const nextValue = crepe.getMarkdown();
    if (nextValue !== valueRef.current) {
      valueRef.current = nextValue;
      onChangeRef.current(nextValue);
    }
    setIsColorPickerOpen(false);
  };

  const toggleColorPicker = () => {
    if (!isColorPickerOpen) {
      updateColorPopoverPosition();
    }
    setIsColorPickerOpen((open) => !open);
  };

  const toggleEmojiPicker = () => {
    if (!isEmojiPickerOpen) {
      setEmojiPage(0);
      updateEmojiPopoverPosition();
    }
    setIsEmojiPickerOpen((open) => !open);
  };

  return (
    <div className="memoji-milkdown" style={editorStyle}>
      {toolbarTarget && createPortal(
        <>
          <div
            ref={colorMenuRef}
            className="memoji-editor-color-menu"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setIsColorPickerOpen(false);
            }}
          >
            <button
              ref={colorButtonRef}
              type="button"
              className="memoji-editor-color-button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={toggleColorPicker}
              title="글자 색"
              aria-label="글자 색"
              aria-expanded={isColorPickerOpen}
            >
              A
            </button>
          </div>
          <div
            ref={emojiMenuRef}
            className="memoji-editor-emoji-menu"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setIsEmojiPickerOpen(false);
            }}
          >
            <button
              ref={emojiButtonRef}
              type="button"
              className="memoji-editor-emoji-button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={toggleEmojiPicker}
              title="이모지 선택"
              aria-label="이모지 선택"
              aria-expanded={isEmojiPickerOpen}
            >
              😊
            </button>
          </div>
        </>,
        toolbarTarget
      )}
      {isFormatMenuOpen && createPortal(
        <div
          ref={formatMenuRef}
          className="memoji-editor-format-popover"
          style={formatMenuStyle}
          role="menu"
          aria-label="문단 형식"
        >
          {FORMAT_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              className="memoji-editor-format-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyBlockFormat(option.level)}
              role="menuitem"
            >
              {option.label}
            </button>
          ))}
        </div>,
        document.body
      )}
      {isColorPickerOpen && createPortal(
        <div
          ref={colorPopoverRef}
          className="memoji-editor-color-popover"
          style={colorPopoverStyle}
          role="menu"
          aria-label="글자 색 선택"
        >
          {TEXT_COLOR_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              className="memoji-editor-color-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyTextColor(option.value)}
              role="menuitem"
              aria-label={`${option.label} 색`}
            >
              <span style={{ background: option.swatch }} />
              {option.label}
            </button>
          ))}
        </div>,
        document.body
      )}
      {isEmojiPickerOpen && createPortal(
        <div
          ref={emojiPopoverRef}
          className="memoji-editor-emoji-popover"
          style={emojiPopoverStyle}
          role="menu"
          aria-label="이모지 선택"
        >
          {visibleEmojiChoices.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="memoji-editor-emoji-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertEmoji(emoji)}
              role="menuitem"
              aria-label={`${emoji} 삽입`}
            >
              {emoji}
            </button>
          ))}
          <div className="memoji-editor-emoji-pager" aria-label="이모지 페이지">
            {Array.from({ length: EMOJI_PAGE_COUNT }, (_, index) => (
              <button
                key={index}
                type="button"
                className="memoji-editor-emoji-page-button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setEmojiPage(index)}
                aria-current={emojiPage === index ? 'page' : undefined}
                aria-label={`${index + 1}번 이모지 묶음`}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
      <div ref={rootRef} className="memoji-milkdown-root" />
    </div>
  );
};
