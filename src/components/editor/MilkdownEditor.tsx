import React, { CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crepe } from '@milkdown/crepe';
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import {
  bulletListSchema,
  emphasisSchema,
  headingSchema,
  inlineCodeSchema,
  liftListItemCommand,
  orderedListSchema,
  paragraphSchema,
  setBlockTypeCommand,
  sinkListItemCommand,
  strongSchema,
  toggleEmphasisCommand,
  toggleStrongCommand,
  wrapInBlockTypeCommand,
} from '@milkdown/kit/preset/commonmark';
import { TextSelection } from '@milkdown/kit/prose/state';
import { strikethroughSchema, toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm';
import { $markSchema, $remark, insert as insertMarkdown, replaceAll } from '@milkdown/kit/utils';
import { IndentDecrease, IndentIncrease } from 'lucide-react';
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
  { label: '본문', level: null },
  { label: '제목 1', level: 1 },
  { label: '제목 2', level: 2 },
  { label: '제목 3', level: 3 },
  { label: '제목 4', level: 4 },
  { label: '제목 5', level: 5 },
  { label: '제목 6', level: 6 },
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

const BULLET_LIST_TOOLBAR_INDEX = 4;
const ORDERED_LIST_TOOLBAR_INDEX = 5;
const INLINE_FORMAT_TOOLBAR_INDEXES = [
  'strong',
  'emphasis',
  'strikethrough',
  'inline-code',
] as const;

type InlineFormat = typeof INLINE_FORMAT_TOOLBAR_INDEXES[number];

const shouldHandleToolbarEvent = (event: Event) => (
  !(event instanceof KeyboardEvent) || event.key === 'Enter' || event.key === ' '
);

const consumeToolbarEvent = (event: Event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  event.stopPropagation();
};

const IMAGE_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
const SAFE_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
]);

const imageFileToDataUrl = (file: File): Promise<string> => {
  const isImage = SAFE_IMAGE_MIME_TYPES.has(file.type) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name);
  if (!isImage) {
    return Promise.reject(new Error('PNG, JPG, GIF, WEBP, BMP 이미지만 삽입할 수 있습니다.'));
  }

  if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
    return Promise.reject(new Error('이미지 파일은 20MB 이하만 삽입할 수 있습니다.'));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('이미지를 읽지 못했습니다.'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('이미지를 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
};

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

const getHeadingStyleLevelFromHtml = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const match = value.match(/<span\b[^>]*data-memoji-heading-level=(["'])([1-6])\1[^>]*>/i);
  const numericLevel = Number(match?.[2]);
  return Number.isInteger(numericLevel) && numericLevel >= 1 && numericLevel <= 6 ? numericLevel : null;
};

const isClosingSpan = (value: unknown): boolean => (
  typeof value === 'string' && /^<\/span\s*>$/i.test(value.trim())
);

const transformMemojiSpanNodes = (nodes: any[]): any[] => {
  const nextNodes: any[] = [];

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const color = node?.type === 'html' ? getColorFromHtml(node.value) : null;
    const headingLevel = node?.type === 'html' ? getHeadingStyleLevelFromHtml(node.value) : null;

    if (color) {
      const children: any[] = [];
      let cursor = index + 1;
      while (cursor < nodes.length && !isClosingSpan(nodes[cursor]?.value)) {
        children.push(nodes[cursor]);
        cursor += 1;
      }

      if (cursor < nodes.length && children.length > 0) {
        nextNodes.push({
          type: 'memojiTextColor',
          color,
          children: transformMemojiSpanNodes(children),
        });
        index = cursor;
        continue;
      }
    }

    if (headingLevel) {
      const children: any[] = [];
      let cursor = index + 1;
      while (cursor < nodes.length && !isClosingSpan(nodes[cursor]?.value)) {
        children.push(nodes[cursor]);
        cursor += 1;
      }

      if (cursor < nodes.length && children.length > 0) {
        nextNodes.push(...transformMemojiSpanNodes(children));
        index = cursor;
        continue;
      }
    }

    if (Array.isArray(node?.children)) {
      nextNodes.push({
        ...node,
        children: transformMemojiSpanNodes(node.children),
      });
    } else {
      nextNodes.push(node);
    }
  }

  return nextNodes;
};

const transformListHeadingNodes = (node: any): any => {
  if (!node || !Array.isArray(node.children)) return node;

  const children = node.children.map((child: any) => {
    const transformedChild = transformListHeadingNodes(child);

    if (node.type === 'listItem' && transformedChild?.type === 'heading') {
      return {
        type: 'paragraph',
        children: transformMemojiSpanNodes(transformedChild.children ?? []),
      };
    }

    return transformedChild;
  });

  return {
    ...node,
    children: transformMemojiSpanNodes(children),
  };
};

const remarkMemojiInlineStyles = $remark('memojiInlineStyles', () => () => (tree: any) => {
  if (Array.isArray(tree?.children)) {
    tree.children = transformListHeadingNodes({ ...tree }).children;
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

  const commitEditorMarkdown = useCallback((markdown: string) => {
    if (markdown !== valueRef.current) {
      valueRef.current = markdown;
      onChangeRef.current(markdown);
    }
    return markdown;
  }, []);

  useEffect(() => {
    syncMarkdownToEditor(value);
  }, [syncMarkdownToEditor, value]);

  const applyInlineFormat = useCallback((format: InlineFormat) => {
    const crepe = crepeRef.current;
    if (!crepe) return false;

    let didApply = false;

    crepe.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      if (!view) return;

      const { state } = view;
      const { from, to, empty } = state.selection;

      if (empty) {
        if (format === 'inline-code') {
          const markType = inlineCodeSchema.type(ctx);
          const activeMarks = state.storedMarks ?? state.selection.$from.marks();
          const hasMark = activeMarks.some((mark) => mark.type === markType);
          const transaction = hasMark
            ? state.tr.removeStoredMark(markType)
            : state.tr.addStoredMark(markType.create());
          view.dispatch(transaction);
          didApply = true;
        } else {
          const commands = ctx.get(commandsCtx);
          if (format === 'strong') {
            didApply = Boolean(commands.call(toggleStrongCommand.key));
          } else if (format === 'emphasis') {
            didApply = Boolean(commands.call(toggleEmphasisCommand.key));
          } else if (format === 'strikethrough') {
            didApply = Boolean(commands.call(toggleStrikethroughCommand.key));
          }
        }

        if (didApply) view.focus();
        return;
      }

      const markType = (() => {
        if (format === 'strong') return strongSchema.type(ctx);
        if (format === 'emphasis') return emphasisSchema.type(ctx);
        if (format === 'strikethrough') return strikethroughSchema.type(ctx);
        return inlineCodeSchema.type(ctx);
      })();

      const hasMark = state.doc.rangeHasMark(from, to, markType);
      let transaction = state.tr.removeMark(from, to, markType);

      if (!hasMark) {
        if (format === 'inline-code') {
          Object.values(state.schema.marks).forEach((schemaMarkType) => {
            if (schemaMarkType !== markType) {
              transaction = transaction.removeMark(from, to, schemaMarkType);
            }
          });
        }

        transaction = transaction.addMark(from, to, markType.create());
      }

      if (!transaction.docChanged) return;

      view.dispatch(transaction.scrollIntoView());
      view.focus();
      didApply = true;
    });

    if (didApply) commitEditorMarkdown(crepe.getMarkdown());
    return didApply;
  }, [commitEditorMarkdown]);

  const applyListFormat = useCallback((kind: 'bullet' | 'ordered') => {
    const crepe = crepeRef.current;
    if (!crepe) return false;

    let didApply = false;
    crepe.editor.action((ctx) => {
      const commands = ctx.get(commandsCtx);
      const listType = kind === 'bullet'
        ? bulletListSchema.type(ctx)
        : orderedListSchema.type(ctx);

      commands.call(setBlockTypeCommand.key, { nodeType: paragraphSchema.type(ctx) });
      didApply = Boolean(commands.call(wrapInBlockTypeCommand.key, { nodeType: listType }));
      if (didApply) ctx.get(editorViewCtx).focus();
    });

    if (didApply) commitEditorMarkdown(crepe.getMarkdown());
    return didApply;
  }, [commitEditorMarkdown]);

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
        [Crepe.Feature.Cursor]: {
          virtual: false,
        },
        [Crepe.Feature.ImageBlock]: {
          onUpload: imageFileToDataUrl,
          inlineUploadButton: '파일 선택',
          inlineUploadPlaceholderText: '또는 이미지 링크',
          blockUploadButton: '파일 선택',
          blockUploadPlaceholderText: '또는 이미지 링크',
          blockCaptionPlaceholderText: '이미지 설명',
          onImageLoadError: (event: Event) => {
            console.warn('Memoji image failed to load:', event);
          },
        },
      },
    });
    crepe.editor.use([remarkMemojiInlineStyles, textColorSchema].flat());

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
        if (
          cancelled ||
          markdown === prevMarkdown ||
          markdown === valueRef.current
        ) return;
        commitEditorMarkdown(markdown);
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
      const nextToolbarTarget = rootRef.current?.querySelector('.top-bar-inner') as HTMLElement | null;
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
  }, [commitEditorMarkdown, placeholder]);

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
    let bulletListButton: HTMLElement | null = null;
    let orderedListButton: HTMLElement | null = null;
    let inlineFormatButtonCleanups: Array<() => void> = [];

    const openFormatMenu = (event: PointerEvent) => {
      consumeToolbarEvent(event);
      formatButtonRef.current = event.currentTarget as HTMLElement;
      updateFormatMenuPosition();
      setIsFormatMenuOpen((open) => !open);
    };

    const blockNativeFormatMenu = (event: Event) => {
      consumeToolbarEvent(event);
    };

    const openFormatMenuFromKeyboard = (event: KeyboardEvent) => {
      if (!shouldHandleToolbarEvent(event)) return;
      consumeToolbarEvent(event);
      formatButtonRef.current = event.currentTarget as HTMLElement;
      updateFormatMenuPosition();
      setIsFormatMenuOpen((open) => !open);
    };

    const runBulletList = (event: Event) => {
      if (!shouldHandleToolbarEvent(event)) return;
      consumeToolbarEvent(event);
      applyListFormat('bullet');
    };

    const runOrderedList = (event: Event) => {
      if (!shouldHandleToolbarEvent(event)) return;
      consumeToolbarEvent(event);
      applyListFormat('ordered');
    };

    const detachInlineFormatButtons = () => {
      inlineFormatButtonCleanups.forEach((cleanup) => cleanup());
      inlineFormatButtonCleanups = [];
    };

    const attachInlineFormatButtons = () => {
      detachInlineFormatButtons();
      const buttons = Array.from(toolbarTarget.querySelectorAll('.top-bar-item')) as HTMLElement[];

      INLINE_FORMAT_TOOLBAR_INDEXES.forEach((format, index) => {
        const button = buttons[index];
        if (!button) return;

        const runInlineFormat = (event: Event) => {
          if (!shouldHandleToolbarEvent(event)) return;
          consumeToolbarEvent(event);
          applyInlineFormat(format);
        };

        button.addEventListener('pointerdown', runInlineFormat, true);
        button.addEventListener('keydown', runInlineFormat, true);
        inlineFormatButtonCleanups.push(() => {
          button.removeEventListener('pointerdown', runInlineFormat, true);
          button.removeEventListener('keydown', runInlineFormat, true);
        });
      });
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

    const attachListButtons = () => {
      const buttons = Array.from(toolbarTarget.querySelectorAll('.top-bar-item')) as HTMLElement[];
      const nextBulletListButton = buttons[BULLET_LIST_TOOLBAR_INDEX] ?? null;
      const nextOrderedListButton = buttons[ORDERED_LIST_TOOLBAR_INDEX] ?? null;

      if (nextBulletListButton !== bulletListButton) {
        bulletListButton?.removeEventListener('pointerdown', runBulletList, true);
        bulletListButton?.removeEventListener('keydown', runBulletList, true);
        bulletListButton = nextBulletListButton;
        bulletListButton?.addEventListener('pointerdown', runBulletList, true);
        bulletListButton?.addEventListener('keydown', runBulletList, true);
      }

      if (nextOrderedListButton !== orderedListButton) {
        orderedListButton?.removeEventListener('pointerdown', runOrderedList, true);
        orderedListButton?.removeEventListener('keydown', runOrderedList, true);
        orderedListButton = nextOrderedListButton;
        orderedListButton?.addEventListener('pointerdown', runOrderedList, true);
        orderedListButton?.addEventListener('keydown', runOrderedList, true);
      }
    };

    const syncToolbarControls = () => {
      attachHeadingButton();
      attachInlineFormatButtons();
      attachListButtons();
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
      bulletListButton?.removeEventListener('pointerdown', runBulletList, true);
      bulletListButton?.removeEventListener('keydown', runBulletList, true);
      orderedListButton?.removeEventListener('pointerdown', runOrderedList, true);
      orderedListButton?.removeEventListener('keydown', runOrderedList, true);
      detachInlineFormatButtons();
      observer.disconnect();
    };
  }, [applyInlineFormat, applyListFormat, labelToolbarButtons, toolbarTarget, updateFormatMenuPosition]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let inlineFormatButtonCleanups: Array<() => void> = [];

    const detachInlineFormatButtons = () => {
      inlineFormatButtonCleanups.forEach((cleanup) => cleanup());
      inlineFormatButtonCleanups = [];
    };

    const attachInlineFormatButtons = () => {
      detachInlineFormatButtons();
      const buttons = Array.from(root.querySelectorAll('.milkdown-toolbar .toolbar-item')) as HTMLElement[];

      INLINE_FORMAT_TOOLBAR_INDEXES.forEach((format, index) => {
        const button = buttons[index];
        if (!button) return;

        const runInlineFormat = (event: Event) => {
          if (!shouldHandleToolbarEvent(event)) return;
          consumeToolbarEvent(event);
          applyInlineFormat(format);
        };

        button.addEventListener('pointerdown', runInlineFormat, true);
        button.addEventListener('keydown', runInlineFormat, true);
        inlineFormatButtonCleanups.push(() => {
          button.removeEventListener('pointerdown', runInlineFormat, true);
          button.removeEventListener('keydown', runInlineFormat, true);
        });
      });
    };

    const observer = new MutationObserver(attachInlineFormatButtons);
    observer.observe(root, {
      childList: true,
      subtree: true,
    });
    attachInlineFormatButtons();

    return () => {
      observer.disconnect();
      detachInlineFormatButtons();
    };
  }, [applyInlineFormat]);

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

    commitEditorMarkdown(crepe.getMarkdown());
    setIsEmojiPickerOpen(false);
  };

  const applyBlockFormat = (level: typeof FORMAT_OPTIONS[number]['level']) => {
    const crepe = crepeRef.current;
    if (!crepe) return;

    crepe.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      if (!view) return;

      const commands = ctx.get(commandsCtx);
      if (level === null) {
        commands.call(setBlockTypeCommand.key, { nodeType: paragraphSchema.type(ctx) });
      } else {
        commands.call(setBlockTypeCommand.key, {
          nodeType: headingSchema.type(ctx),
          attrs: { level },
        });
      }
      view.focus();
    });

    commitEditorMarkdown(crepe.getMarkdown());
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

    commitEditorMarkdown(crepe.getMarkdown());
    setIsColorPickerOpen(false);
  };

  const applyListIndent = useCallback((direction: 'increase' | 'decrease') => {
    const crepe = crepeRef.current;
    if (!crepe) return false;

    let didRun = false;

    crepe.editor.action((ctx) => {
      const commands = ctx.get(commandsCtx);
      didRun = Boolean(commands.call(
        direction === 'increase'
          ? sinkListItemCommand.key
          : liftListItemCommand.key
      ));

      if (didRun) {
        ctx.get(editorViewCtx).focus();
      }
    });

    if (!didRun) return false;

    commitEditorMarkdown(crepe.getMarkdown());
    return true;
  }, [commitEditorMarkdown]);

  useEffect(() => {
    const editorElement = rootRef.current?.querySelector('.ProseMirror') as HTMLElement | null;
    if (!editorElement) return;

    const handleTabIndent = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) return;
      let didHandle = false;

      if (event.key === 'Tab') {
        didHandle = applyListIndent(event.shiftKey ? 'decrease' : 'increase');
      }

      if (didHandle) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    editorElement.addEventListener('keydown', handleTabIndent, true);
    return () => {
      editorElement.removeEventListener('keydown', handleTabIndent, true);
    };
  }, [applyListIndent, toolbarTarget]);

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
          <div className="memoji-editor-indent-controls">
            <button
              type="button"
              className="memoji-editor-indent-button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyListIndent('decrease')}
              title="내어쓰기"
              aria-label="내어쓰기"
            >
              <IndentDecrease className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="memoji-editor-indent-button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyListIndent('increase')}
              title="들여쓰기"
              aria-label="들여쓰기"
            >
              <IndentIncrease className="h-4 w-4" />
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
